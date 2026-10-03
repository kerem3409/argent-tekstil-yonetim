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
import { costSources, automaticCostSources, generalSheetCosts } from '../src/domain/generalSheetCosts.ts';
import type { CostSourceData } from '../src/domain/generalSheetCosts';
import { stageGroups } from '../src/domain/productionPresentation.ts';
import { actualProductionCosts, emptyOrderCosting, accessoryAvailability } from '../src/domain/orderCosting.ts';
import { createFinanceRepository } from '../src/data/finance/repository.ts';
import { createInventoryRepositories } from '../src/data/inventory/repository.ts';

async function setup(costData?: CostSourceData) {
  const values = new Map<string, string>(); let failNetwork = false;
  const storage = () => ({ getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { if (k === NETWORK_KEY && failNetwork) throw Error('disk full'); values.set(k, v); } });
  const contacts = createLocalStorageContactRepository(storage);
  const supplier = await contacts.create({ ...emptyContact, name: 'Test Tedarikçi', roles: ['Hazır Giyim Tedarikçisi', 'Fasoncu'], services: ['Kesim', 'Nakış', 'Baskı', 'Dikim', 'Ütü & Paket'] });
  const customer = await contacts.create({ ...emptyContact, name: 'Test Müşteri', roles: ['Hazır Giyim Müşterisi'] });
  const products = createProductRepository(storage, contacts);
  const orders = createOrderRepository(storage, { contacts, products, costData: costData ? async () => costData : undefined, definitions: { async requireActive(id: string) { return { id, name: id, status: 'Aktif' as const, note: '', createdAt: '', updatedAt: '' }; } } });
  const brand = await orders.createBrand('Palo');
  const input = { name: 'Polo sipariş', customerId: customer.id, date: operationDate(), dueDate: operationDate(), customerReference: '', customerNote: '', note: '', product: { productDefinitionId: 'Polo', modelName: 'Basic Polo 01', brandId: brand.id, fabricName: 'Pike', gsm: '220', fabricProperties: '', colors: [{ color: 'Siyah', quantity: 100 }], instructions: ['Etiket'], sizeSeries: 'Yetişkin' as const, sizeDistribution: defaultSizeDistribution('Yetişkin'), enabledStages: ['Kesim', 'Dikim', 'Ütü & Paket'] as ('Kesim' | 'Dikim' | 'Ütü & Paket')[], materials: [], embroidery: emptyEmbroidery(), printing: emptyEmbroidery(), packaging: emptyPackaging() } };
  return { values, storage, contacts, supplier, customer, products, orders, input, fail: (v: boolean) => { failNetwork = v; } };
}

const emptyCostData = (): CostSourceData => ({ fabrics: { version: 1, records: [], movements: [] }, materials: { version: 1, records: [], movements: [] }, production: { version: 1, plans: [], jobs: [], stages: [], nextPlan: 1, nextJob: 1, nextStage: 1 }, finance: { version: 1, moneyMovements: [], manualDebts: [], expenses: [] } });

test('Gerçek maliyet ve cari: fire harcaması kalır, ödeme borcu düşürür, düzeltme ve arşiv hareketi çoğaltmaz', async () => {
  const data = emptyCostData(), f = await setup(data);
  const details = { ...emptyOrderCosting(), fabricCompanyId: f.supplier.id, extras: [{ id: 'logistics', category: 'Lojistik' as const, name: 'Nakliye', amountMinor: 50000, companyId: f.supplier.id, date: operationDate() }], accessories: [{ id: 'label', name: 'Ense etiketi', quantity: 1500, unit: 'Adet' as const, materialId: '', companyId: f.supplier.id, priceMinor: 50 }] };
  let o = await f.orders.create({ ...f.input, costPricesMinor: { Kumaş: 10000, Kesim: 200, Dikim: 300, 'Ütü & Paket': 100 }, costing: details, product: { ...f.input.product, colors: [{ color: 'Siyah', quantity: 1500 }] } });
  const entries = async () => selectAccountEntries({ ...data, contacts: await f.contacts.list(), orders: await f.orders.list(), errors: [] });
  assert.equal((await entries()).reduce((n,e) => n+e.deltaMinor,0), -125000);
  o = await f.orders.savePlanning(o.id,o.revision,o.product.enabledStages.map((type) => ({ type, companyId: f.supplier.id, plannedStart: o.date, dueDate: o.dueDate })));
  for (const [type, quantity] of [['Kesim',1400],['Dikim',1300],['Ütü & Paket',1200]] as const) { o = await f.orders.beginPlannedStage(o.id,o.revision,type); o = await f.orders.recordStageResult(o.id,o.revision,type,[{ color: 'Siyah', quantity, ...(type === 'Kesim' ? { kg: 600 } : {}) }],[]); }
  const c = actualProductionCosts(o,data);
  assert.equal(c.rows.find((r) => r.name === 'Kumaş')?.total, 6000000); assert.equal(c.rows.find((r) => r.name === 'Kumaş')?.unit, 5000);
  assert.equal(c.rows.find((r) => r.name === 'Kesim')?.total, 300000); assert.equal(c.rows.find((r) => r.name === 'Dikim')?.total, 420000); assert.equal(c.rows.find((r) => r.name === 'Ütü / Paket')?.total, 130000);
  assert.equal(c.total, 6975000); assert.equal(c.unit, 5813);
  const original = await entries(); assert.equal(original.length,6); assert.equal(original.reduce((n,e) => n+e.deltaMinor,0), -c.total);
  assert.ok(original.every((e) => e.description.includes(o.orderNo) && e.description.includes(f.supplier.name)));
  const finance = createFinanceRepository(f.storage,f.contacts); await finance.payment({ companyId: f.supplier.id, responsibleId: '', date: o.date, direction: 'paid', method: 'Banka', description: 'Üretim ödemesi', amount: 10000 }); data.finance = await finance.load();
  assert.equal((await entries()).reduce((n,e) => n+e.deltaMinor,0), -5975000);
  o = await f.orders.saveCosts(o.id,o.revision,{ ...o.costPricesMinor, Kesim: 300 },details);
  assert.equal((await entries()).filter((e) => e.source === 'Üretim Maliyeti').length,6);
  assert.equal((await entries()).reduce((n,e) => n+e.deltaMinor,0), -6125000);
  const before = await entries(); o = await f.orders.setArchived(o.id,o.revision,true); assert.deepEqual(await entries(),before);
  o = await f.orders.setArchived(o.id,o.revision,false);
  o = await f.orders.recordStageResult(o.id,o.revision,'Ütü & Paket',[{ color: 'Siyah', quantity: 0 }],[]);
  assert.equal(actualProductionCosts(o,data).unit,undefined); assert.equal(actualProductionCosts(o,data).total,7125000);
  const raw = [...f.values.entries()]; await assert.rejects(f.orders.saveCosts(o.id,o.revision,{ Kesim: -1 },details)); assert.deepEqual([...f.values.entries()],raw);
});

test('Aksesuar stok ihtiyacı, eksik miktar, kaynak bağlantısı ve cari çift kayıt koruması', async () => {
  const data = emptyCostData(), f = await setup(data), stock = createInventoryRepositories(f.storage,f.contacts);
  const material = await stock.materials.create({ name: 'Ense etiketi', category: 'Etiket', feature: '', quantity: 1000, unit: 'Adet', price: 0.5, date: operationDate(), companyId: f.supplier.id, account: 'Borç oluştur', note: '' });
  data.materials = await stock.materials.load();
  const accessory = { id: 'stock-label', name: material.name, quantity: 1200, unit: 'Adet' as const, materialId: material.id, companyId: '', priceMinor: undefined };
  assert.equal(accessoryAvailability([accessory],data.materials.records)[0].missing,200);
  const costing = { ...emptyOrderCosting(), accessories: [accessory] };
  let o = await f.orders.create({ ...f.input, costing });
  await assert.rejects(f.orders.saveCosts(o.id,o.revision,{}, { ...costing, accessories: [{ ...accessory, unit: 'Metre' }] }), /birimde/);
  assert.equal(actualProductionCosts(o,data).total,60000);
  let ledger = selectAccountEntries({ ...data, contacts: await f.contacts.list(), orders: [o], errors: [] }); assert.equal(ledger.length,1); assert.equal(ledger[0].deltaMinor,-50000);
  await stock.materials.move(material.id,'Çıkış',600,o.date,'Üretimde kullanıldı'); data.materials = await stock.materials.load();
  const sourceId = `material:${data.materials.movements.at(-1)!.id}`;
  o = await f.orders.saveSheetCosts(o.id,o.revision,{ estimated: {}, sources: [sourceId] });
  assert.equal(actualProductionCosts(o,data).total,30000);
  ledger = selectAccountEntries({ ...data, contacts: await f.contacts.list(), orders: [o], errors: [] }); assert.equal(ledger.length,1); assert.equal(ledger[0].deltaMinor,-50000);
  const other = await f.orders.create(f.input); await assert.rejects(f.orders.saveSheetCosts(other.id,other.revision,{ estimated: {}, sources: [sourceId] }), /iki üretime/);
});

test('Manuel sipariş no benzersizdir; otomatik sayaç manuel numarayı atlar, arşiv numarasını yeniden kullanmaz', async () => {
  const f = await setup();
  const manual = await f.orders.create({ ...f.input, orderNo: 'SP-001' });
  const automatic = await f.orders.create(f.input);
  assert.notEqual(automatic.orderNo, manual.orderNo);
  const before = [...f.values.entries()];
  await assert.rejects(f.orders.create({ ...f.input, orderNo: 'sp-001' }), /kullanıl/);
  assert.deepEqual([...f.values.entries()], before);
  await f.orders.setArchived(manual.id, manual.revision, true);
  await assert.rejects(f.orders.create({ ...f.input, orderNo: ' SP-001 ' }), /kullanıl/);
});

test('Numuneler üçle sınırlıdır, başladıktan sonra değişebilir; eski alanlar ve üretim sonuçları korunur', async () => {
  const f = await setup(), images = [1,2,3].map((n) => ({ id: String(n), name: `Numune ${n}`, dataUrl: 'data:image/png;base64,YQ==' }));
  let o = await f.orders.create({ ...f.input, customerReference: 'ESKİ-REF', product: { ...f.input.product, sampleImages: images, packaging: { ...f.input.product.packaging, labelingNote: 'Eski etiket' } } });
  assert.deepEqual((await f.orders.list())[0].product.sampleImages, images);
  o = await f.orders.savePlanning(o.id, o.revision, [{ type: 'Kesim', companyId: f.supplier.id, plannedStart: o.date, dueDate: o.dueDate }]);
  o = await f.orders.beginPlannedStage(o.id, o.revision, 'Kesim');
  o = await f.orders.recordStageResult(o.id, o.revision, 'Kesim', [{ color: 'Siyah', quantity: 105, kg: 50 }], []);
  const stages = structuredClone(o.product.stages), plans = structuredClone(o.stagePlans);
  await assert.rejects(f.orders.saveSampleImages(o.id, o.revision, [...images, { ...images[0], id: '4' }]), /3/);
  o = await f.orders.saveSampleImages(o.id, o.revision, images.slice(1));
  assert.deepEqual(o.product.stages, stages); assert.deepEqual(o.stagePlans, plans);
  assert.equal(o.customerReference, 'ESKİ-REF'); assert.equal(o.product.packaging.labelingNote, 'Eski etiket');
  assert.deepEqual((await f.orders.list())[0].product.sampleImages, images.slice(1));
});

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

test('Genel Föy: mevcut kumaş, malzeme, fason ve gider kaynakları tek kez hesaplanır ve fiyat güncellemesini izler', async () => {
  const data: CostSourceData = { fabrics: { version: 1, records: [], movements: [] }, materials: { version: 1, records: [], movements: [] }, production: { version: 1, plans: [], jobs: [], stages: [], nextPlan: 1, nextJob: 1, nextStage: 1 }, finance: { version: 1, moneyMovements: [], manualDebts: [], expenses: [] } };
  const f = await setup(data); let o = await f.orders.create(f.input);
  data.fabrics.records.push({ id: 'fabric', name: 'Pike', companyId: '', date: o.date, note: '', account: 'Hayır', purchaseMinor: 1000000, active: true, grammage: '220', content: '', width: '', lot: '', priceMinor: 10000, colors: [] });
  data.fabrics.movements.push({ id: 'cut-fabric', recordId: 'fabric', date: o.date, type: 'Çıkış', outgoing: 50, incoming: 0, balance: 50, description: 'Kesimde kullanılan' });
  data.materials.records.push({ id: 'label', name: 'Etiket', category: 'Diğer', feature: '', quantity: 100, unit: 'Adet', priceMinor: 200, companyId: '', date: o.date, note: '', account: 'Hayır', purchaseMinor: 20000, active: true });
  data.materials.movements.push({ id: 'labels', recordId: 'label', date: o.date, type: 'Çıkış', outgoing: 100, incoming: 0, balance: 0, description: 'Ürün etiketi' });
  data.production.stages.push({ id: 'cutting', number: 'FS-001', jobId: o.stockSourceId, companyId: f.supplier.id, date: o.date, approvedDate: o.date, status: 'Tamamlandı', note: '', lines: [{ operation: 'Kesim', quantity: 100, returned: 100, priceType: 'Adet Fiyatı', priceMinor: 300 }] });
  data.finance.expenses.push({ id: 'shipping', companyId: '', date: o.date, category: 'Diğer', description: 'Üretim nakliyesi', amountMinor: 10000, method: 'Nakit', note: '' });
  o = await f.orders.saveCosts(o.id,o.revision,{Kumaş: 10000, Kesim: 99900});
  o = await f.orders.savePlanning(o.id,o.revision,f.input.product.enabledStages.map((type) => ({ type, companyId:f.supplier.id,plannedStart:o.date,dueDate:o.dueDate })));
  for (const type of f.input.product.enabledStages) { o=await f.orders.beginPlannedStage(o.id,o.revision,type); o=await f.orders.recordStageResult(o.id,o.revision,type,[{color:'Siyah',quantity:100,...(type==='Kesim'?{kg:50}:{})}],[]); }
  const settings = { estimated: { Kumaş: 480000, Kesim: 25000 }, sources: ['fabric:cut-fabric','material:labels','expense:shipping'] };
  o=await f.orders.saveSheetCosts(o.id,o.revision,settings);
  let sources=costSources(data), c=generalSheetCosts(o,sources,automaticCostSources(o,data,sources));
  assert.equal(c.actual,560000); assert.equal(c.perUnit,5600); assert.equal(c.estimated,505000);
  assert.equal(c.rows.find((r)=>r.name==='Kesim')?.actual,30000); assert.equal(c.rows[0].difference,20000);
  assert.deepEqual((await f.orders.list())[0].sheetCosts,settings);
  const second=await f.orders.create(f.input);
  await assert.rejects(f.orders.saveSheetCosts(second.id,second.revision,settings), /iki üretime/);
  await assert.rejects(f.orders.saveSheetCosts(second.id,second.revision,{estimated:{},sources:['stage:cutting:0']}), /iki üretime/);
  await assert.rejects(f.orders.saveSheetCosts(second.id,second.revision,{estimated:{},sources:['missing']}), /bulunamadı/);
  data.fabrics.records[0].priceMinor=12000; sources=costSources(data); c=generalSheetCosts(o,sources,automaticCostSources(o,data,sources)); assert.equal(c.actual,660000);
  assert.equal(generalSheetCosts(o,[],[]).missing.length,3);
});

test('Tek Nakış/Baskı grubu teknik bilgileri ve ayrı sonuçları korur; başlanmış işlem türü değişmez', async () => {
  const f=await setup(); let o=await f.orders.create(f.input);
  o=await f.orders.saveDecoration(o.id,o.revision,['Nakış','Baskı'],{...emptyEmbroidery(),position:'Göğüs',color:'Mavi',notes:['Logo']},{...emptyEmbroidery(),position:'Sırt',color:'Beyaz'});
  assert.deepEqual(stageGroups(o.product).map((g)=>g.name),['Kesim','Uygulama','Dikim','Paket']);
  assert.equal(o.product.embroidery.color,'Mavi'); assert.equal(o.product.printing?.color,'Beyaz');
  o=await f.orders.savePlanning(o.id,o.revision,o.product.enabledStages.map((type)=>({type,companyId:f.supplier.id,plannedStart:o.date,dueDate:o.dueDate})));
  for(const type of ['Kesim','Nakış'] as const) { o=await f.orders.beginPlannedStage(o.id,o.revision,type); o=await f.orders.recordStageResult(o.id,o.revision,type,[{color:'Siyah',quantity:type==='Kesim'?100:95}],[]); }
  const raw=f.values.get('argent-tekstil.production.v1');
  await assert.rejects(f.orders.saveDecoration(o.id,o.revision,['Baskı'],emptyEmbroidery(),emptyEmbroidery()),/tür değiştirilemez/); assert.equal(f.values.get('argent-tekstil.production.v1'),raw);
  o=await f.orders.beginPlannedStage(o.id,o.revision,'Baskı'); o=await f.orders.recordStageResult(o.id,o.revision,'Baskı',[{color:'Siyah',quantity:92}],[]);
  assert.equal(o.product.stages.find((s)=>s.type==='Nakış')?.result?.rows[0].quantity,95); assert.equal(o.product.stages.find((s)=>s.type==='Baskı')?.result?.rows[0].quantity,92);
});


test('Kesimden itibaren güncel maliyet, lojistik ve birim/toplu kalemler ortak sonuçlarla hesaplanır', async () => {
  const f = await setup(), data = emptyCostData();
  let o = await f.orders.create(f.input);
  const details = { ...emptyOrderCosting(), logisticsMinor: 100000, extras: [
    { id: 'unit', category: 'Diğer' as const, calculation: 'unit' as const, name: 'Özel malzeme', amountMinor: 500, companyId: '', date: o.date },
    { id: 'total', category: 'Diğer' as const, calculation: 'total' as const, name: 'Kalıp', amountMinor: 150000, companyId: '', date: o.date },
  ] };
  o = await f.orders.saveCosts(o.id, o.revision, { Kumaş: 1000, Kesim: 200, Dikim: 300, 'Ütü & Paket': 100 }, details);
  assert.equal(actualProductionCosts(o, data).unit, undefined);
  for (const [type, count, expected] of [['Kesim', 110, 337000], ['Dikim', 100, 365000], ['Ütü & Paket', 90, 370000]] as const) {
    o = await f.orders.beginPlannedStage(o.id, o.revision, type, { type, companyId: f.supplier.id, plannedStart: o.date, dueDate: o.dueDate });
    o = await f.orders.recordStageResult(o.id, o.revision, type, [{ color: 'Siyah', quantity: count, ...(type === 'Kesim' ? { kg: 10 } : {}) }], []);
    const costs = actualProductionCosts(o, data);
    assert.equal(costs.total, expected); assert.equal(costs.unit, Math.round(expected / count));
    assert.equal(costs.currentQuantity, count); assert.equal(costs.final, type === 'Ütü & Paket');
  }
  const raw = [...f.values.entries()];
  const applied = structuredClone(o);
  applied.costPricesMinor = { ...o.costPricesMinor, Uygulama: 250 };
  applied.product.enabledStages = ['Kesim', 'Nakış', 'Baskı', 'Dikim', 'Ütü & Paket'];
  for (const type of ['Nakış', 'Baskı'] as const) applied.product.stages.push({ type, companyId: f.supplier.id, date: o.date, notes: [], colorNotes: [], result: { date: o.date, rows: [{ color: 'Siyah', quantity: 100 }] } });
  assert.equal(actualProductionCosts(applied, data).rows.find((r) => r.name === 'Uygulama')?.total, 27500);
  const unified = structuredClone(o);
  unified.product.applicationPosition = 'after';
  unified.product.enabledStages = ['Kesim', 'Dikim', 'Uygulama', 'Ütü & Paket'];
  unified.product.stages.push({ type: 'Uygulama', companyId: f.supplier.id, date: o.date, notes: [], colorNotes: [], result: { date: o.date, rows: [{ color: 'Siyah', quantity: 95 }] } });
  unified.costPricesMinor = { ...o.costPricesMinor, Uygulama: 250 };
  data.production.stages.push({ id: 'application-source', number: 'FS-APP', jobId: o.stockSourceId, companyId: f.supplier.id, date: o.date, approvedDate: o.date, status: 'Tamamlandı', note: '', lines: [{ operation: 'Baskı', quantity: 100, returned: 95, priceType: 'Adet Fiyatı', priceMinor: 300 }] });
  assert.equal(actualProductionCosts(unified, data).rows.find((r) => r.name === 'Uygulama')?.total, 30000);
  const sources = costSources(data);
  assert.equal(generalSheetCosts(unified, sources, automaticCostSources(unified, data, sources)).rows.find((r) => r.name === 'Nakış / Baskı')?.actual, 30000);
  await assert.rejects(f.orders.saveCosts(o.id, o.revision, {}, { ...details, logisticsMinor: -1 }));
  assert.deepEqual([...f.values.entries()], raw);
});
