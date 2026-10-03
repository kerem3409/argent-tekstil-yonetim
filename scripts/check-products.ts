import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductRepository, PRODUCTS_STORAGE_KEY } from '../src/data/products/localStorageRepository.ts';
import { entryQuantity, entryTypes, filterStock, newStockInput, validateStock } from '../src/features/products/model.ts';
import { OPEN_ACCOUNT_ID } from '../src/domain/sales.ts';
import { emptyFilters, stockReport } from '../src/domain/reportSelectors.ts';
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

const colors = [{ color: 'Beyaz', quantity: 500 }, { color: 'Siyah', quantity: 200 }, { color: 'Lacivert', quantity: 300 }];

test('Renk dağılımı tek partide 1000 adet, ayrı stok/hareket ve doğru toplam cari oluşturur', async () => {
  const { repository, storage, contacts } = setup();
  const entry = input({ colors, brand: 'Palo', unitCost: 12.25, postAccount: true, quantity: 9999, packCount: 9999 });
  assert.equal(entryQuantity(entry), 1000);
  const first = await repository.create(entry);
  const data = await createProductRepository(() => storage, contacts).load();
  assert.equal(data.nextBatch, 2); assert.equal(data.records.length, 3);
  assert.equal(new Set(data.records.map((r) => r.productId)).size, 1);
  assert.deepEqual(data.records.map((r) => r.batch), [first.batch, first.batch, first.batch]);
  assert.deepEqual(data.records.map((r) => ({ color: r.color, quantity: r.quantity })), colors);
  assert.deepEqual(data.movements.map((m) => m.incoming), [500, 200, 300]);
  assert.equal(data.accountMovements.reduce((sum, m) => sum + m.amountMinor, 0), 1_225_000);
  assert.equal(new Set(data.accountMovements.map((m) => m.movementId)).size, 3);
  assert.equal((await repository.create(input({ colors }))).batch, 'P-0002');
});

test('Renk satış, iade ve düzeltmesi diğer renklerin stoklarını değiştirmez', async () => {
  const { repository } = setup();
  await repository.create(input({ colors }));
  const [white, black, navy] = (await repository.load()).records;
  await repository.sell({ stockId: black.id, companyId: OPEN_ACCOUNT_ID, responsibleId: '', responsibleName: 'Test', quantityType: 'Adet', quantity: 20, price: 150, date: black.date, note: '' });
  await repository.returnStock(white.id, { quantity: 5, date: white.date, description: 'Renk iadesi', postAccount: false, supplierId: '' });
  await repository.adjust(navy.id, { mode: 'total', amount: 290, date: navy.date, description: 'Renk sayımı' });
  const data = await repository.load();
  assert.deepEqual(data.records.map((r) => r.quantity), [495, 180, 290]);
  const report = stockReport({ contacts: [], products: data, errors: [] }, { ...emptyFilters, batch: white.batch });
  assert.deepEqual(report[0].rows.map((row) => [row[2], row[7]]), [['Beyaz', 495], ['Siyah', 180], ['Lacivert', 290]]);
  const filtered = filterStock(data.records, { search: '', brand: '', batch: white.batch, color: 'Siyah', status: '' });
  assert.equal(filtered.length, 1); assert.equal(filtered[0].quantity, 180);
  await assert.rejects(repository.sell({ stockId: black.id, companyId: OPEN_ACCOUNT_ID, responsibleId: '', responsibleName: 'Test', quantityType: 'Adet', quantity: 181, price: 150, date: black.date, note: '' }), /Stok yetersiz/);
});

test('Boş, tekrarlı, kesirli ve geçersiz renk dağılımı hiçbir kayıt veya parti sayacı değiştirmez', async () => {
  const { repository, values } = setup();
  await repository.create(input());
  const before = values.get(PRODUCTS_STORAGE_KEY);
  for (const rows of [[], [{ color: '', quantity: 1 }], [{ color: '  ', quantity: 1 }], [{ color: 'Siyah', quantity: 1 }, { color: ' SİYAH ', quantity: 2 }], ...[0, -1, 1.5, NaN, Infinity].map((quantity) => [{ color: 'Beyaz', quantity }]), [{ color: 'Beyaz', quantity: 1_000_000_000 }, { color: 'Siyah', quantity: 1 }]]) {
    await assert.rejects(repository.create(input({ colors: rows })));
    assert.equal(values.get(PRODUCTS_STORAGE_KEY), before);
  }
});

test('Tüm giriş türleri renk dağılımını destekler; mevcut parti ve eski kayıtlar korunur', async () => {
  const { repository } = setup();
  const old = await repository.create(input());
  for (const entryType of entryTypes) {
    const record = await repository.create(input({ entryType, note: 'Giriş açıklaması', colors: [{ color: 'Kırmızı', quantity: 7 }, { color: 'Yeşil', quantity: 8 }] }));
    const data = await repository.load();
    assert.equal(data.records.filter((r) => r.batch === record.batch).length, 2);
    assert.equal(data.movements.find((m) => m.stockId === record.id)?.type, entryType);
    assert.equal(record.initialPackCount, 1); assert.equal(record.quantity, 7);
  }
  const nextBatch = (await repository.load()).nextBatch;
  await repository.create(input({ existingBatch: old.batch, colors }));
  const data = await repository.load();
  assert.equal(data.nextBatch, nextBatch);
  assert.deepEqual(data.records.find((r) => r.id === old.id), old);
  assert.equal(data.records.filter((r) => r.batch === old.batch).length, 4);
});

test('Çok renkli girişte depolama hatası hiçbir kısmi stok veya cari hareket bırakmaz', async () => {
  const { repository, values, fail } = setup();
  await repository.create(input());
  const before = values.get(PRODUCTS_STORAGE_KEY);
  fail();
  await assert.rejects(repository.create(input({ colors, postAccount: true })), /kaydedilemedi/);
  assert.equal(values.get(PRODUCTS_STORAGE_KEY), before);
});

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
  for (const entryType of entryTypes) await repository.create(input({ entryType, note: 'Giriş açıklaması' }));
  const data = await repository.load(); assert.equal(data.movements.length, 5); assert.ok(data.movements.every((item) => item.incoming === 100));
  assert.equal(filterStock(data.records, { search: 'TİŞÖRT', brand: 'Argent', batch: 'P-0001', color: 'Beyaz', status: 'Aktif' }).length, 1);
  assert.equal(filterStock(data.records, { search: '', brand: '', batch: '', color: '', status: 'Pasif' }).length, 0);
  assert.ok(validateStock(input({ unitCost: 1.234 })).length);
  assert.ok(validateStock(input({ date: '2026-02-30' })).length);
  assert.ok(validateStock(input({ packSize: 1.5 })).length);
});

test('Renk satırı mevcut PIN ile Çöp Kutusuna taşınır; hareket/cari ve kardeş renkler korunur', async () => {
  const { repository, values } = setup();
  await repository.deletionPin.setup('stock-pin', 'stock-pin');
  await repository.create(input({ colors, postAccount: true }));
  const before = await repository.load(), black = before.records[1];
  const raw = values.get(PRODUCTS_STORAGE_KEY);
  await assert.rejects(repository.trash(black.id, 'wrong-pin', black.quantity), /yanlış/);
  await assert.rejects(repository.trash(black.id, 'stock-pin', black.quantity + 1), /değişti/);
  assert.equal(values.get(PRODUCTS_STORAGE_KEY), raw);
  await repository.trash(black.id, 'stock-pin', black.quantity);
  const deleted = await repository.load(), row = deleted.records.find((r) => r.id === black.id)!;
  assert.equal(row.trash?.quantity, 200); assert.equal(row.status, 'Pasif');
  assert.deepEqual(deleted.records.filter((r) => r.id !== black.id), before.records.filter((r) => r.id !== black.id));
  assert.deepEqual(deleted.movements, before.movements); assert.deepEqual(deleted.accountMovements, before.accountMovements);
  assert.equal(filterStock(deleted.records, { search: '', brand: '', batch: '', color: '', status: '' }).length, 2);
  assert.equal(deleted.records.filter((r) => r.status === 'Aktif').reduce((n, r) => n + r.quantity, 0), 800);
  assert.equal(stockReport({ contacts: [], products: deleted, errors: [] }, emptyFilters)[0].rows.length, 2);
  await assert.rejects(repository.setStatus(black.id, 'Aktif'), /Çöp/);
  await assert.rejects(repository.adjust(black.id, { mode: 'difference', amount: 1, date: black.date, description: 'Sayım' }), /Çöp/);
  await assert.rejects(repository.permanentlyDelete(black.id, 'stock-pin', row.trash!.deletedAt), /bağlı/);
  await repository.restore(black.id, row.trash!.deletedAt);
  assert.deepEqual((await repository.load()).records, before.records);
});

test('Kalıcı silme yalnız bağlantısız satırı kaldırır; ek hareketler ve üretim makbuzları korunur', async () => {
  const { repository, values } = setup(); await repository.deletionPin.setup('stock-pin', 'stock-pin');
  await repository.create(input({ colors }));
  const black = (await repository.load()).records[1];
  await repository.trash(black.id, 'stock-pin', black.quantity);
  const row = (await repository.load()).records.find((r) => r.id === black.id)!;
  const raw = values.get(PRODUCTS_STORAGE_KEY);
  await assert.rejects(repository.permanentlyDelete(black.id, 'wrong-pin', row.trash!.deletedAt));
  await assert.rejects(repository.permanentlyDelete(black.id, 'stock-pin', 'stale-date'));
  assert.equal(values.get(PRODUCTS_STORAGE_KEY), raw);
  await repository.permanentlyDelete(black.id, 'stock-pin', row.trash!.deletedAt);
  const data = await repository.load(); assert.equal(data.records.length, 2); assert.equal(data.movements.length, 2);
  assert.ok(!data.movements.some((m) => m.stockId === black.id));
  const white = data.records[0]; await repository.adjust(white.id, { mode: 'difference', amount: 1, date: white.date, description: 'Sayım' });
  await repository.trash(white.id, 'stock-pin', white.quantity + 1);
  const adjusted = (await repository.load()).records.find((r) => r.id === white.id)!;
  await assert.rejects(repository.permanentlyDelete(white.id, 'stock-pin', adjusted.trash!.deletedAt), /bağlı/);
  const receipt = await repository.receiveProduction({ jobId: 'job-1', productId: 'product-1', name: 'Polo', brand: 'ARGENT', colors: [{ color: 'Siyah', quantity: 50 }], waste: 2, date: white.date, note: '', unitCostMinor: 0 });
  await repository.trash(receipt.stockIds[0], 'stock-pin', 50);
  const produced = (await repository.load()).records.find((r) => r.id === receipt.stockIds[0])!;
  await assert.rejects(repository.permanentlyDelete(produced.id, 'stock-pin', produced.trash!.deletedAt), /bağlı/);
  assert.deepEqual(await repository.receiveProduction({ jobId: 'job-1', productId: 'product-1', name: 'Polo', brand: 'ARGENT', colors: [{ color: 'Siyah', quantity: 50 }], waste: 2, date: white.date, note: '', unitCostMinor: 0 }), receipt);
});

test('Çöp Kutusu yazma hatası stok ve hareketleri değiştirmez; pasif durum geri yüklemede korunur', async () => {
  const f = setup(); await f.repository.deletionPin.setup('stock-pin', 'stock-pin');
  const record = await f.repository.create(input()); await f.repository.setStatus(record.id, 'Pasif');
  await f.repository.trash(record.id, 'stock-pin', record.quantity);
  const deleted = (await f.repository.load()).records[0]; await f.repository.restore(record.id, deleted.trash!.deletedAt);
  assert.equal((await f.repository.load()).records[0].status, 'Pasif');
  const raw = f.values.get(PRODUCTS_STORAGE_KEY); f.fail();
  await assert.rejects(f.repository.trash(record.id, 'stock-pin', record.quantity), /kaydedilemedi/);
  assert.equal(f.values.get(PRODUCTS_STORAGE_KEY), raw);
});
