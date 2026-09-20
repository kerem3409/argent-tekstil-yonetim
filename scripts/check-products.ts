import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductRepository, PRODUCTS_STORAGE_KEY } from '../src/data/products/localStorageRepository.ts';
import { entryTypes, filterStock, newStockInput, validateStock } from '../src/features/products/model.ts';
import type { StockInput } from '../src/features/products/model.ts';
import { emptyContact } from '../src/features/contacts/model.ts';

const person = { ...emptyContact, id: 'supplier-1', name: 'Tekstil Firması', createdAt: '', updatedAt: '' };
function setup() {
  const values = new Map<string, string>();
  let failWrite = false;
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem(key: string, value: string) { if (failWrite) throw new Error('QuotaExceededError'); values.set(key, value); } };
  const contacts = { async get(id: string) { return id === person.id ? person : null; } };
  const repository = createProductRepository(() => storage, contacts);
  return { values, storage, contacts, repository, fail: () => { failWrite = true; } };
}
function input(overrides: Partial<StockInput> = {}): StockInput {
  return { ...newStockInput(), name: 'Polo Yaka Erkek Tişört', brand: 'Argent', color: 'Beyaz', series: "5’li", assortment: 'S1 / M1 / L2 / XL1', packSize: 5, packCount: 20, unitCost: 125.25, date: '2026-09-20', supplierId: person.id, ...overrides };
}

test('Paket girişi 100 adet oluşturur; stok, hareket ve cari kayıt yeniden yüklenir', async () => {
  const { repository, storage, contacts } = setup();
  const record = await repository.create(input({ postAccount: true }));
  const data = await createProductRepository(() => storage, contacts).load();
  assert.equal(record.batch, 'P-0001'); assert.equal(record.quantity, 100);
  assert.equal(data.records.length, 1); assert.equal(data.movements[0].incoming, 100); assert.equal(data.movements[0].balance, 100);
  assert.equal(data.accountMovements[0].amountMinor, 1_252_500);
  assert.equal(data.accountMovements[0].contactId, person.id);
  assert.equal(data.accountMovements[0].movementId, data.movements[0].id);
  assert.equal(data.accountMovements[0].effect, 'payable-increase');
  assert.deepEqual(data.records[0], record);
});

test('Aynı parti/ürün/renk altında farklı asorti; sonraki parti otomatik sıralanır', async () => {
  const { repository } = setup();
  const first = await repository.create(input());
  const second = await repository.create(input({ existingBatch: first.batch, series: "10’lu", assortment: 'M5 / L5', packSize: 10 }));
  assert.notEqual(first.id, second.id); assert.equal(second.batch, first.batch); assert.equal(second.quantity, 200);
  assert.equal((await repository.create(input())).batch, 'P-0002');
  await assert.rejects(repository.create(input({ existingBatch: first.batch, name: 'Farklı Ürün' })), /aynı olmalıdır/);
});

test('Manuel adet, mahsup hareketi ve kuruş hassasiyeti', async () => {
  const { repository } = setup();
  const record = await repository.create(input({ quantityMode: 'manual', quantity: 7, unitCost: 0.29, postAccount: true, accountAction: 'Alacaktan mahsup et' }));
  const data = await repository.load();
  assert.equal(record.quantity, 7); assert.equal(data.accountMovements[0].amountMinor, 203);
  assert.equal(data.accountMovements[0].effect, 'receivable-decrease');
});

test('Düzeltme artış/azalışı ve yeni toplam, hareket bakiyeleriyle tutarlıdır', async () => {
  const { repository } = setup(); const record = await repository.create(input());
  await repository.adjust(record.id, { mode: 'difference', amount: 10, date: '2026-09-21', description: 'Fazla sayım' });
  await repository.adjust(record.id, { mode: 'difference', amount: -5, date: '2026-09-21', description: 'Eksik sayım' });
  await repository.adjust(record.id, { mode: 'total', amount: 80, date: '2026-09-22', description: 'Yeni sayım' });
  const data = await repository.load();
  assert.deepEqual(data.movements.map((item) => item.balance), [100, 110, 105, 80]);
  assert.deepEqual(data.movements.map((item) => item.outgoing), [0, 0, 5, 25]);
  assert.equal(data.records[0].quantity, 80); assert.equal(data.accountMovements.length, 0);
});

test('İade stoğu azaltır; seçilirse firmaya bağlı borç azaltan cari hareket üretir', async () => {
  const { repository } = setup(); const record = await repository.create(input({ postAccount: true }));
  await repository.returnStock(record.id, { quantity: 10, date: '2026-09-21', description: 'Kusurlu ürün', postAccount: true, supplierId: person.id });
  await repository.returnStock(record.id, { quantity: 5, date: '2026-09-21', description: 'Cari dışı iade', postAccount: false, supplierId: '' });
  const data = await repository.load();
  assert.equal(data.records[0].quantity, 85); assert.equal(data.movements[1].outgoing, 10);
  assert.equal(data.accountMovements.length, 2); assert.equal(data.accountMovements[1].amountMinor, 125250);
  assert.equal(data.accountMovements[1].effect, 'payable-decrease');
});

test('Negatif stok, sıfır/fractional iade, boş açıklama, değişmeyen adet ve eski tarih reddedilir', async () => {
  const { repository } = setup(); const record = await repository.create(input());
  const before = await repository.load();
  for (const quantity of [101, 0, -1, 1.5, NaN]) await assert.rejects(repository.returnStock(record.id, { quantity, date: '2026-09-21', description: 'İade', postAccount: false, supplierId: '' }));
  for (const amount of [-101, 0, 0.5]) await assert.rejects(repository.adjust(record.id, { mode: 'difference', amount, date: '2026-09-21', description: 'Sayım' }));
  await assert.rejects(repository.adjust(record.id, { mode: 'total', amount: 10, date: '2026-09-21', description: '  ' }));
  await assert.rejects(repository.adjust(record.id, { mode: 'total', amount: 10, date: '2026-09-19', description: 'Sayım' }), /önce olamaz/);
  assert.deepEqual(await repository.load(), before);
});

test('Aktif/pasif geçişinde kayıtlar silinmez; pasif kayıtta stok işlemi yapılamaz', async () => {
  const { repository } = setup(); const record = await repository.create(input());
  await repository.setStatus(record.id, 'Pasif');
  await assert.rejects(repository.adjust(record.id, { mode: 'total', amount: 10, date: '2026-09-21', description: 'Sayım' }), /aktif hale/);
  await assert.rejects(repository.returnStock(record.id, { quantity: 1, date: '2026-09-21', description: 'İade', postAccount: false, supplierId: '' }), /aktif hale/);
  await repository.setStatus(record.id, 'Aktif');
  const data = await repository.load(); assert.equal(data.records.length, 1); assert.equal(data.movements.length, 1); assert.equal(data.records[0].quantity, 100);
});

test('Cari için mevcut aktif firma ve pozitif maliyet gerekir; hatada kısmi stok oluşmaz', async () => {
  const { repository, storage } = setup();
  await assert.rejects(repository.create(input({ postAccount: true, supplierId: '' })));
  await assert.rejects(repository.create(input({ supplierId: 'bilinmeyen' })));
  await assert.rejects(repository.create(input({ postAccount: true, unitCost: 0 })));
  const passive = createProductRepository(() => storage, { async get() { return { ...person, status: 'Pasif' }; } });
  await assert.rejects(passive.create(input()), /Aktif/);
  assert.equal((await repository.load()).records.length, 0);
});

test('Depolama hatasında stok, hareket, parti sayacı ve cari birlikte korunur', async () => {
  const { repository, values, fail } = setup(); const record = await repository.create(input());
  const before = values.get(PRODUCTS_STORAGE_KEY); fail();
  await assert.rejects(repository.create(input({ postAccount: true })), /kaydedilemedi/);
  await assert.rejects(repository.returnStock(record.id, { quantity: 1, date: '2026-09-21', description: 'İade', postAccount: true, supplierId: person.id }), /kaydedilemedi/);
  assert.equal(values.get(PRODUCTS_STORAGE_KEY), before);
});

test('Bozuk verinin veya bozuk hareket bakiyesinin üzerine yazılmaz', async () => {
  const { repository, values } = setup(); await repository.create(input());
  const data = await repository.load(); data.movements[0].balance = 1;
  for (const raw of ['bozuk', JSON.stringify(data)]) {
    values.set(PRODUCTS_STORAGE_KEY, raw);
    await assert.rejects(repository.load(), /okunamadı/);
    await assert.rejects(repository.create(input()), /okunamadı/);
    assert.equal(values.get(PRODUCTS_STORAGE_KEY), raw);
  }
});

test('Beş giriş türü pozitif hareket üretir; liste filtreleri birlikte çalışır', async () => {
  const { repository } = setup();
  for (const entryType of entryTypes) await repository.create(input({ entryType }));
  const data = await repository.load(); assert.equal(data.movements.length, 5); assert.ok(data.movements.every((item) => item.incoming === 100));
  assert.equal(filterStock(data.records, { search: 'TİŞÖRT', brand: 'Argent', batch: 'P-0001', color: 'Beyaz', status: 'Aktif' }).length, 1);
  assert.equal(filterStock(data.records, { search: '', brand: '', batch: '', color: '', status: 'Pasif' }).length, 0);
  assert.ok(validateStock(input({ unitCost: 1.234 })).length);
  assert.ok(validateStock(input({ date: '2026-02-30' })).length);
  assert.ok(validateStock(input({ packSize: 1.5 })).length);
});
