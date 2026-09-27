import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalStorageContactRepository } from '../src/data/contacts/localStorageRepository.ts';
import { createNetworkRepository, NETWORK_KEY, networkContactInput } from '../src/data/contacts/networkRepository.ts';
import { createProductRepository } from '../src/data/products/localStorageRepository.ts';
import { createOrderRepository } from '../src/data/production/orderRepository.ts';
import { emptyContact } from '../src/features/contacts/model.ts';
import { newStockInput } from '../src/features/products/model.ts';
import { selectAccountEntries } from '../src/domain/accountSelectors.ts';
import { emptyEmbroidery, emptyPackaging } from '../src/domain/productionOrder.ts';
import { defaultSizeDistribution } from '../src/domain/productionWorkflow.ts';
import { costMoney, productionCosts } from '../src/domain/productionCosts.ts';
import { filterLiveOrders, operationDate } from '../src/domain/productionPlanning.ts';

async function setup() {
  const values = new Map<string, string>(); let failNetwork = false;
  const storage = () => ({ getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { if (k === NETWORK_KEY && failNetwork) throw Error('disk full'); values.set(k, v); } });
  const contacts = createLocalStorageContactRepository(storage);
  const supplier = await contacts.create({ ...emptyContact, name: 'Test Tedarikçi', roles: ['Hazır Giyim Tedarikçisi', 'Fasoncu'], services: ['Kesim', 'Nakış', 'Baskı', 'Dikim', 'Ütü & Paket'] });
  const customer = await contacts.create({ ...emptyContact, name: 'Test Müşteri', roles: ['Hazır Giyim Müşterisi'] });
  const products = createProductRepository(storage, contacts);
  const orders = createOrderRepository(storage, { contacts, products, definitions: { async requireActive(id: string) { return { id, name: id, status: 'Aktif' as const, note: '', createdAt: '', updatedAt: '' }; } } });
  const brand = await orders.createBrand('Palo');
  const input = { name: 'Polo sipariş', customerId: customer.id, date: operationDate(), dueDate: operationDate(), customerReference: '', customerNote: '', note: '', product: { productDefinitionId: 'Polo', modelName: 'Basic Polo 01', brandId: brand.id, fabricName: 'Pike', gsm: '220', fabricProperties: '', colors: [{ color: 'Siyah', quantity: 100 }], instructions: ['Etiket'], sizeSeries: 'Yetişkin' as const, sizeDistribution: defaultSizeDistribution('Yetişkin'), enabledStages: ['Kesim', 'Dikim', 'Ütü & Paket'] as ('Kesim' | 'Dikim' | 'Ütü & Paket')[], materials: [], embroidery: emptyEmbroidery(), printing: emptyEmbroidery(), packaging: emptyPackaging() } };
  return { values, storage, contacts, supplier, customer, products, orders, input, fail: (v: boolean) => { failNetwork = v; } };
}

test('450 adet hazır alım 90.000 TL tek kaynak borç; satış, sayım ve iadeler stok/cariyi korur', async () => {
  const f = await setup();
  await f.products.create({ ...newStockInput(), name: 'Polo Yaka', brand: 'Palo', fabric: '30/2 Pike', grammage: '220 gr', colors: [{ color: 'Siyah', quantity: 200 }, { color: 'Beyaz', quantity: 100 }, { color: 'Lacivert', quantity: 150 }], series: 'Yetişkin', assortment: 'S1 M1 L1 XL1 2XL1 3XL1', packSize: 6, supplierId: f.supplier.id, unitCost: 200, postAccount: true });
  let data = await f.products.load(); assert.equal(data.records.reduce((n, r) => n + r.quantity, 0), 450);
  let entries = selectAccountEntries({ contacts: await f.contacts.list(), products: data, errors: [] });
  assert.equal(entries.reduce((n, r) => n + r.deltaMinor, 0), -9_000_000); assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
  const white = data.records.find((r) => r.color === 'Beyaz')!;
  const sale = await f.products.sell({ stockId: white.id, companyId: f.customer.id, responsibleId: '', responsibleName: '', quantity: 50, quantityType: 'Adet', price: 250, date: white.date, note: '' });
  data = await f.products.load(); assert.equal(data.records.find((r) => r.id === white.id)?.quantity, 50);
  entries = selectAccountEntries({ contacts: await f.contacts.list(), products: data, errors: [] }); assert.equal(entries.filter((e) => e.companyId === f.customer.id).reduce((n, e) => n + e.deltaMinor, 0), 1_250_000);
  const raw = f.values.get('argent-tekstil.products.v1');
  await assert.rejects(f.products.sell({ stockId: white.id, companyId: f.customer.id, responsibleId: '', responsibleName: '', quantity: 60, quantityType: 'Adet', price: 250, date: white.date, note: '' }), /yetersiz/); assert.equal(f.values.get('argent-tekstil.products.v1'), raw);
  for (const amount of [95, 100, 95]) await f.products.adjust(white.id, { mode: 'total', amount, date: white.date, description: 'Fiziki sayım' });
  data = await f.products.load(); assert.deepEqual(data.movements.slice(-2).map((m) => m.incoming - m.outgoing), [5, -5]);
  await f.products.receiveReturn(white.id, { quantity: 5, saleId: sale.id, date: white.date, description: 'Müşteriden iade' });
  assert.equal((await f.products.load()).records.find((r) => r.id === white.id)?.quantity, 100);
  await assert.rejects(f.products.receiveReturn(white.id, { quantity: 46, saleId: sale.id, date: white.date, description: 'Fazla iade' }));
  await assert.rejects(f.products.create({ ...newStockInput(), entryType: 'Diğer', name: 'Polo', color: 'Siyah' }), /açıklama/);
  await f.contacts.deactivate(f.customer.id); await f.contacts.deactivate(f.supplier.id);
  assert.equal((await f.contacts.get(f.customer.id))?.name, 'Test Müşteri');
  assert.deepEqual(selectAccountEntries({ contacts: await f.contacts.list(), products: await f.products.load(), errors: [] }), entries);
});

test('Maliyetler 50 kg × 100 TL / 100 adet; kalıcılık, sonuç düzeltmesi ve sıfır sonucu', async () => {
  const f = await setup(); let o = await f.orders.create(f.input);
  o = await f.orders.saveCosts(o.id, o.revision, { Kumaş: 10000, Kesim: 200, Dikim: 300, 'Ütü & Paket': 100 });
  assert.equal(productionCosts(o).perUnit, undefined);
  o = await f.orders.savePlanning(o.id, o.revision, f.input.product.enabledStages.map((type) => ({ type, companyId: f.supplier.id, plannedStart: o.date, dueDate: o.dueDate })));
  for (const type of f.input.product.enabledStages) { o = await f.orders.beginPlannedStage(o.id, o.revision, type); o = await f.orders.recordStageResult(o.id, o.revision, type, [{ color: 'Siyah', quantity: 100, ...(type === 'Kesim' ? { kg: 50 } : {}) }], []); }
  const c = productionCosts((await f.orders.list())[0]); assert.equal(c.rows[0].quantity, 50); assert.equal(c.rows[0].total, 500000); assert.equal(c.rows[0].perUnit, 5000); assert.equal(c.total, 560000); assert.equal(c.perUnit, 5600); assert.equal(costMoney(1250), '12,50 TL');
  const before = structuredClone(o.product);
  o = await f.orders.saveCosts(o.id, o.revision, { ...o.costPricesMinor, Kumaş: 12000 }); assert.deepEqual(o.product, before);
  o = await f.orders.recordStageResult(o.id, o.revision, 'Kesim', [{ color: 'Siyah', quantity: 100, kg: 60 }], []);
  assert.equal(productionCosts(o).rows[0].total, 720000);
  o = await f.orders.recordStageResult(o.id, o.revision, 'Ütü & Paket', [{ color: 'Siyah', quantity: 0 }], []);
  assert.equal(productionCosts(o).perUnit, undefined); assert.ok(!JSON.stringify(productionCosts(o)).includes('Infinity'));
  await assert.rejects(f.orders.saveCosts(o.id, o.revision, { Kumaş: -1 }));
});

test('İş Ağı test telefonunu kaydeder; aktarım tekrarında ve yazma hatasında firma çoğalmaz', async () => {
  const f = await setup(), network = createNetworkRepository(f.storage, f.contacts);
  const r = await network.save({ name: 'Mehmet Yılmaz', company: 'Yılmaz Kumaş', category: 'Kumaşçı', phone: 'test', city: 'İstanbul', note: 'Tanışıldı', metDate: operationDate(), status: 'Bağlantı' });
  assert.equal((await network.list())[0].phone, 'test'); const input = networkContactInput(r); assert.equal(input.name, 'Yılmaz Kumaş'); assert.ok(input.note.includes('test'));
  f.fail(true); await assert.rejects(network.transfer(r.id, r.revision, input)); f.fail(false);
  const c = await network.transfer(r.id, r.revision, input); assert.equal((await network.transfer(r.id, r.revision, input)).id, c.id);
  assert.equal((await f.contacts.list()).filter((v) => v.name === c.name).length, 1);
  assert.equal((await network.list())[0].contactId, c.id);
  const unused = await f.contacts.create({ ...emptyContact, name: 'Kullanılmamış Firma', roles: ['Malzeme Tedarikçisi'] }); await f.contacts.deactivate(unused.id); assert.equal((await f.contacts.get(unused.id))?.status, 'Pasif');
});

test('Canlı üretim ürün, müşteri, aşama, firma, termin ve aramayı birlikte süzer', async () => {
  const f = await setup(); const rows = [];
  for (const type of ['Polo', 'Sweatshirt']) {
    let o = await f.orders.create({ ...f.input, product: { ...f.input.product, productDefinitionId: type, modelName: type } });
    o = await f.orders.savePlanning(o.id, o.revision, [{ type: 'Kesim', companyId: f.supplier.id, plannedStart: o.date, dueDate: o.dueDate }]);
    rows.push(await f.orders.beginPlannedStage(o.id, o.revision, 'Kesim'));
  }
  const filters = { product: 'Sweatshirt', customer: f.customer.id, stage: 'Kesim', company: f.supplier.id, deadline: 'Bugün Terminli', search: 'palo' };
  assert.equal(filterLiveOrders(rows, filters, () => 'Test Müşteri').length, 1);
  assert.equal(filterLiveOrders(rows, { ...filters, search: 'bulunmaz' }, () => 'Test Müşteri').length, 0);
  assert.equal(filterLiveOrders(rows, { ...filters, deadline: 'Geciken' }, () => 'Test Müşteri').length, 0);
});

test('Eski renk bazlı nakış/baskı notları sipariş düzenlenirken kaybolmaz', async () => {
  const f = await setup();
  const input = structuredClone(f.input);
  input.product.embroidery.colorNotes = [{ color: 'Siyah', note: 'Eski nakış talimatı' }];
  input.product.printing.colorNotes = [{ color: 'Siyah', note: 'Eski baskı talimatı' }];
  const o = await f.orders.create(input);
  const edited = structuredClone(input); edited.product.colors = [{ color: 'Beyaz', quantity: 100 }];
  edited.product.embroidery.colorNotes = []; edited.product.printing.colorNotes = [];
  await f.orders.update(o.id, o.revision, edited);
  const saved = (await f.orders.list())[0];
  assert.deepEqual(saved.product.embroidery.colorNotes, input.product.embroidery.colorNotes);
  assert.deepEqual(saved.product.printing?.colorNotes, input.product.printing.colorNotes);
  assert.equal(saved.product.colors[0].color, 'Beyaz');
});
