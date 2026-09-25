import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductDefinitionRepository, DEFINITIONS_STORAGE_KEY } from '../src/data/productDefinitions/repository.ts';
import { createProductRepository, PRODUCTS_STORAGE_KEY } from '../src/data/products/localStorageRepository.ts';
import { createProductionRepository } from '../src/data/production/repository.ts';
import { createCompletionService } from '../src/data/production/completion.ts';
import { newStockInput } from '../src/features/products/model.ts';
import { OPEN_ACCOUNT_ID } from '../src/domain/sales.ts';

function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const contacts = { async get() { return null; } };
  const definitions = createProductDefinitionRepository(() => storage);
  const products = createProductRepository(() => storage, contacts, undefined, definitions);
  const production = createProductionRepository(() => storage, contacts, undefined, undefined, definitions);
  const input = { ...newStockInput(), color: 'Beyaz', date: '2026-09-21', packCount: 10 };
  return { values, storage, contacts, definitions, products, production, input };
}

test('Ürün listesi boş başlar; Polo tanımı stokta ID ile saklanır, ad tanımdan okunur', async () => {
  const { definitions, products, input, values } = setup();
  assert.deepEqual(await definitions.list(), []);
  assert.equal(values.size, 0);
  const polo = await definitions.save({ name: 'Polo Yaka Tişört', note: 'Not', status: 'Aktif' });
  await assert.rejects(products.create({ ...input, name: polo.name }), /Aktif bir ürün/);
  await assert.rejects(products.create({ ...input, productDefinitionId: 'missing' }), /Aktif bir ürün/);
  const stock = await products.create({ ...input, name: 'Yanlış istemci adı', productDefinitionId: polo.id });
  assert.equal(stock.name, polo.name); assert.equal(stock.productDefinitionId, polo.id);
  assert.equal(JSON.parse(values.get(PRODUCTS_STORAGE_KEY)!).records[0].productDefinitionId, polo.id);
  await definitions.save({ ...polo, name: 'Yeni Polo Adı' }, polo.id);
  assert.equal((await products.load()).records[0].name, 'Yeni Polo Adı');
  const second = await products.create({ ...input, productDefinitionId: polo.id, existingBatch: stock.batch });
  assert.equal(second.batch, stock.batch); assert.equal(second.name, 'Yeni Polo Adı');
});

test('Pasif ürün yeni girişte kullanılamaz; eski stok, hareket ve stoktan satış korunur', async () => {
  const { definitions, products, input } = setup();
  const polo = await definitions.save({ name: 'Polo Yaka Tişört', note: '', status: 'Aktif' });
  const stock = await products.create({ ...input, productDefinitionId: polo.id });
  const before = await products.load();
  await definitions.setStatus(polo.id, 'Pasif');
  assert.deepEqual(await products.load(), before);
  await assert.rejects(products.create({ ...input, productDefinitionId: polo.id }), /Aktif bir ürün/);
  await assert.rejects(products.create({ ...input, productDefinitionId: polo.id, existingBatch: stock.batch }), /Aktif bir ürün/);
  const sale = await products.sell({ stockId: stock.id, companyId: OPEN_ACCOUNT_ID, responsibleId: '', responsibleName: 'Test', quantityType: 'Adet', quantity: 2, price: 100, date: input.date, note: '' });
  assert.equal(sale.stockId, stock.id); assert.equal((await products.load()).records[0].quantity, 8);
  await definitions.setStatus(polo.id, 'Aktif');
  assert.equal((await definitions.requireActive(polo.id)).id, polo.id);
});

test('Hızlı eklemede dönen ürün ID ile aynı stok formu verilerine eklenebilir', async () => {
  const { definitions, products, input } = setup();
  const hoodie = await definitions.save({ name: 'Hoodie', note: '', status: 'Aktif' });
  assert.equal((await definitions.requireActive(hoodie.id)).name, 'Hoodie');
  const stock = await products.create({ ...input, productDefinitionId: hoodie.id });
  assert.equal(stock.color, input.color); assert.equal(stock.quantity, input.packCount); assert.equal(stock.name, hoodie.name);
  const polo = await definitions.save({ name: 'Polo Yaka Tişört', note: '', status: 'Aktif' });
  await assert.rejects(products.create({ ...input, productDefinitionId: polo.id, existingBatch: stock.batch }), /aynı olmalıdır/);
});

test('Eski isim kayıtları silinmez, salt okuma depolamayı değiştirmez, aynı isim ID ile eşleşir', async () => {
  const { definitions, products, input, storage, contacts, values } = setup();
  const legacy = createProductRepository(() => storage, contacts);
  await legacy.create({ ...input, name: 'Polo Yaka Tişört' });
  await legacy.create({ ...input, name: 'Eski Özel Ürün' });
  const raw = values.get(PRODUCTS_STORAGE_KEY);
  assert.equal((await products.load()).records[0].name, 'Polo Yaka Tişört');
  const polo = await definitions.save({ name: 'Polo Yaka Tişört', note: '', status: 'Aktif' });
  const data = await products.load();
  assert.equal(data.records[0].productDefinitionId, polo.id);
  assert.equal(data.records[1].name, 'Eski Özel Ürün');
  assert.equal(data.records[1].productDefinitionId, undefined);
  assert.equal(values.get(PRODUCTS_STORAGE_KEY), raw);
});

test('Tekrarlı ve geçersiz tanımlar reddedilir; bozuk veri ve başarısız yazım korunur', async () => {
  const { definitions, values, storage } = setup();
  const polo = await definitions.save({ name: 'Polo Yaka Tişört', note: '', status: 'Aktif' });
  await assert.rejects(definitions.save({ name: ' POLO YAKA TİŞÖRT ', note: '', status: 'Aktif' }), /zaten kayıtlı/);
  await assert.rejects(definitions.save({ name: '', note: '', status: 'Aktif' }), /Ürün adı/);
  await assert.rejects(definitions.save({ ...polo }, 'missing'), /bulunamadı/);
  const raw = values.get(DEFINITIONS_STORAGE_KEY);
  const failing = createProductDefinitionRepository(() => ({ ...storage, setItem() { throw new Error('Quota'); } }));
  await assert.rejects(failing.setStatus(polo.id, 'Pasif'), /kaydedilemedi/);
  assert.equal(values.get(DEFINITIONS_STORAGE_KEY), raw);
  values.set(DEFINITIONS_STORAGE_KEY, '{bad');
  await assert.rejects(definitions.save({ name: 'Yeni Ürün', note: '', status: 'Aktif' }), /korunuyor/);
  assert.equal(values.get(DEFINITIONS_STORAGE_KEY), '{bad');
});

test('Üretim planı aynı tanımı kullanır; pasife alınsa bile mevcut üretim ID ile stoğa tamamlanır', async () => {
  const { definitions, products, production, input } = setup();
  const polo = await definitions.save({ name: 'Polo Yaka Tişört', note: '', status: 'Aktif' });
  const planInput = { productDefinitionId: polo.id, name: '', brand: '', total: 10, colors: [{ color: 'Beyaz', quantity: 10 }], startDate: input.date, deliveryDate: '', note: '', status: 'Planlandı' as const };
  const plan = await production.createPlan(planInput);
  assert.equal(plan.name, polo.name); assert.equal(plan.productDefinitionId, polo.id);
  const job = await production.startPlan(plan.id, input.date);
  await definitions.setStatus(polo.id, 'Pasif');
  await assert.rejects(production.createPlan(planInput), /Aktif bir ürün/);
  const complete = createCompletionService(production, products);
  await complete(job.id, [{ colorId: plan.colors[0].id, good: 10 }], 0, input.date, '');
  const stock = (await products.load()).records[0];
  assert.equal(stock.productDefinitionId, polo.id); assert.equal(stock.quantity, 10); assert.equal(stock.name, polo.name);
});
