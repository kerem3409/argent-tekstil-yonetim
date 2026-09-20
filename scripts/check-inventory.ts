import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventoryRepositories } from '../src/data/inventory/repository.ts';
import { emptyContact } from '../src/features/contacts/model.ts';
const company = { ...emptyContact, id: 'c1', name: 'Tedarikçi', createdAt: '', updatedAt: '' };
test('Makine bedeli tek alış kaydıdır; durum ve arşiv cariyi çoğaltmaz', async () => {
  const { repository } = setup(); const item = await repository.machines.create({ name: 'Dikiş Makinesi', type: 'Dikiş', model: 'Model A', quantity: 2, price: 40000, date: '2026-09-20', companyId: 'c1', account: 'Borç oluştur', status: 'Aktif', note: '' });
  await repository.machines.updateStatus(item.id, 'Bakımda'); await repository.machines.toggle(item.id);
  const data = await repository.machines.load(); assert.equal(data.records.length, 1); assert.equal(data.records[0].purchaseMinor, 4000000); assert.equal(data.records[0].status, 'Bakımda'); assert.equal(data.records[0].active, false);
});
test('Malzeme giriş/çıkış/iade/düzeltme aynı stokta ve alımdan ayrı izlenir', async () => {
  const { repository } = setup(); const r = await repository.materials.create({ name: 'Etiket', category: 'Etiket', feature: 'Beyaz', quantity: 100, unit: 'Adet', price: 0.29, date: '2026-09-20', companyId: 'c1', account: 'Alacaktan mahsup et', note: '' });
  assert.equal(r.purchaseMinor, 2900);
  await repository.materials.move(r.id, 'Çıkış', 10, r.date, 'Üretim'); await repository.materials.move(r.id, 'İade', 5, r.date, 'İade'); await repository.materials.move(r.id, 'Giriş', 2, r.date, 'Geri geldi'); await repository.materials.move(r.id, 'Sayım / Düzeltme', 80, r.date, 'Sayım');
  const data = await repository.materials.load(); assert.equal(data.records[0].quantity, 80); assert.equal(data.movements.length, 5); assert.equal(data.records[0].purchaseMinor, 2900);
  await assert.rejects(repository.materials.move(r.id, 'Çıkış', 81, r.date, 'Fazla'));
});
function setup() { const data = new Map<string, string>(); const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; return { data, repository: createInventoryRepositories(() => storage, { async get(id) { return id === company.id ? company : null; } }) }; }
test('Kumaş renkleri, toplam alış, düzeltme ve cari kaynağı kalıcıdır', async () => {
  const { repository } = setup(); const r = await repository.fabrics.create({ name: 'Penye', grammage: '180', content: 'Pamuk', width: '180 cm', lot: 'L-1', date: '2026-09-20', companyId: 'c1', price: 100, account: 'Borç oluştur', note: '', colors: [{ color: 'Siyah', rolls: 4, kg: 96 }, { color: 'Beyaz', rolls: 3, kg: 71 }] });
  assert.equal(r.purchaseMinor, 1670000); assert.equal(r.companyId, 'c1');
  await repository.fabrics.adjust(r.id, r.colors[0].id, 90, 4, '2026-09-20', 'Sayım');
  const result = await repository.fabrics.load(); assert.equal(result.records[0].colors[0].kg, 90); assert.equal(result.movements.at(-1)?.outgoing, 6); assert.equal(result.records[0].purchaseMinor, 1670000);
  await assert.rejects(repository.fabrics.adjust(r.id, r.colors[0].id, -1, 0, '2026-09-20', 'Sayım'));
  await repository.fabrics.toggle(r.id); await assert.rejects(repository.fabrics.adjust(r.id, r.colors[0].id, 1, 1, '2026-09-20', 'Sayım'));
});
