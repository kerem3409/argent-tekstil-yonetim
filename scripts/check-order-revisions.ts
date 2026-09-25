import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkflowRepository, PRODUCTION_STORAGE_KEY } from '../src/data/production/workflowRepository.ts';
import { createLocalStorageContactRepository } from '../src/data/contacts/localStorageRepository.ts';
import { createProductDefinitionRepository } from '../src/data/productDefinitions/repository.ts';
import { emptyContact, subcontractServices } from '../src/features/contacts/model.ts';
import { selectableContacts } from '../src/domain/contactSelection.ts';
import { orderAllocation, productionSizes, validatePlannedSizes } from '../src/domain/productionWorkflow.ts';

async function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const pending = new Map<string, Promise<unknown>>();
  const lock = <T>(key: string, work: () => Promise<T>): Promise<T> => { const result = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(work); pending.set(key, result); return result; };
  const contacts = createLocalStorageContactRepository(() => storage, lock);
  const customer = await contacts.create({ ...emptyContact, name: 'ŞEVKET HOCA', roles: ['Hazır Giyim Müşterisi'] });
  const cutter = await contacts.create({ ...emptyContact, name: 'Kesim Atölyesi', roles: ['Fasoncu'], services: ['Kesim'] });
  const tailor = await contacts.create({ ...emptyContact, name: 'Dikim Atölyesi', roles: ['Fasoncu'], services: ['Dikim'] });
  const definitions = createProductDefinitionRepository(() => storage, lock);
  const definition = await definitions.save({ name: 'Polo Yaka', note: '', status: 'Aktif' });
  const deps = { contacts, definitions, products: { async load() { return { productionReceipts: [] }; } }, fabrics: { async load() { return { records: [] }; } } };
  const repo = createWorkflowRepository(() => storage, deps, lock);
  const item = { productDefinitionId: definition.id, modelName: 'Basic Polo 2026', colorQuantities: [{ color: 'Siyah', quantity: 1000 }, { color: 'Beyaz', quantity: 500 }], fabricName: 'Penye', gsm: '180', fabricProperties: 'Likralı', productDetails: 'Yaka detayı' };
  const order = await repo.createOrder({ orderType: 'Ön Sipariş', customerId: customer.id, date: '2026-09-25', note: 'Sipariş', items: [item] });
  const input = (quantity = 500, brand = 'PALO') => ({ orderCardId: order.id, orderItemId: order.items[0].id, productDefinitionId: definition.id, brand, selectedColorQuantities: [{ color: 'Siyah', quantity }], plannedSizeDistributions: [{ color: 'Siyah', sizes: { S: quantity } }], sizeSeries: 'Yetişkin' as const, cutterCompanyId: cutter.id, sewingCompanyId: tailor.id, fabricId: '', fabricName: '', gsm: '', cuttingMode: 'Kumaştan Çıktığı Kadar' as const, targetQuantity: null, date: '2026-09-25', productInstructions: '', note: '' });
  const currentOrder = async () => (await repo.listOrders()).find((o) => o.id === order.id)!;
  const current = async (id: string) => (await repo.list()).find((p) => p.id === id)!;
  return { values, storage, lock, deps, contacts, customer, cutter, tailor, definitions, definition, repo, item, order, input, currentOrder, current };
}

test('Müşteri adında Türkçe harf ve gereksiz boşluk farkları ikinci kayda yol açmaz', async () => {
  const f = await setup();
  for (const name of ['şevket hoca', ' ŞEVKET HOCA ', 'Şevket   Hoca']) await assert.rejects(f.contacts.create({ ...emptyContact, name, roles: ['Hazır Giyim Müşterisi'] }), /Bu isimde bir müşteri zaten kayıtlı/);
  assert.equal((await f.contacts.list()).filter((c) => c.roles.includes('Hazır Giyim Müşterisi')).length, 1);
  const results = await Promise.allSettled(['Yeni Müşteri', ' yeni   müşteri '].map((name) => f.contacts.create({ ...emptyContact, name, roles: ['Hazır Giyim Müşterisi'] })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});

test('Ürün tanımı adında harf/boşluk farkıyla tekrar kayıt ve pasif kayıt çoğaltma engellenir', async () => {
  const f = await setup();
  for (const name of ['polo yaka', 'POLO YAKA', ' Polo   Yaka ']) await assert.rejects(f.definitions.save({ name, note: '', status: 'Aktif' }), /Bu isimde bir ürün zaten kayıtlı/);
  await f.definitions.setStatus(f.definition.id, 'Pasif');
  await assert.rejects(f.definitions.save({ name: 'Polo Yaka', note: '', status: 'Aktif' }), /zaten kayıtlı/);
});

test('Rol ve hizmet filtreleri yalnız ilgili aktif kayıtları gösterir', async () => {
  const f = await setup();
  for (const service of subcontractServices) {
    const c = await f.contacts.create({ ...emptyContact, name: `${service} Usta`, roles: ['Fasoncu'], services: [service] });
    const records = selectableContacts(await f.contacts.list(), 'Fasoncu', service);
    assert.ok(records.some((r) => r.id === c.id));
    assert.ok(records.every((r) => r.services.includes(service)));
    assert.ok(!records.some((r) => r.id === f.customer.id));
  }
  const multi = await f.contacts.create({ ...emptyContact, name: 'Çok Rollü', roles: ['Hazır Giyim Müşterisi', 'Kumaş Tedarikçisi', 'Malzeme Tedarikçisi', 'Hazır Giyim Tedarikçisi'] });
  for (const role of multi.roles) assert.ok(selectableContacts(await f.contacts.list(), role).some((c) => c.id === multi.id));
  await f.contacts.update(multi.id, { ...multi, status: 'Pasif' });
  assert.deepEqual(selectableContacts(await f.contacts.list(), 'Hazır Giyim Müşterisi').map((c) => c.id), [f.customer.id]);
  await assert.rejects(f.repo.createOrder({ ...f.order, customerId: f.cutter.id }), /Hazır Giyim Müşterisi/);
  await assert.rejects(f.repo.create({ ...f.input(), cutterCompanyId: f.tailor.id }), /Kesim hizmeti/);
});

test('Aynı kalem PALO 500, TOMMY 300, YILDIZ 200 olarak ayrılır; model ve bağlantılar kalıcıdır', async () => {
  const f = await setup();
  for (const [brand, quantity] of [['PALO', 500], ['TOMMY', 300], ['YILDIZ', 200]] as const) {
    const card = await f.repo.create(f.input(quantity, brand));
    assert.equal(card.productName, 'Basic Polo 2026');
    assert.equal(card.modelName, 'Basic Polo 2026');
    assert.equal(card.orderCardId, f.order.id); assert.equal(card.orderItemId, f.order.items[0].id);
    assert.deepEqual((await f.current(card.id)).plannedSizeDistributions, [{ color: 'Siyah', sizes: { S: quantity } }]);
  }
  assert.deepEqual(orderAllocation(f.order.items[0], await f.repo.list()), [{ color: 'Siyah', quantity: 1000, allocated: 1000, remaining: 0 }, { color: 'Beyaz', quantity: 500, allocated: 0, remaining: 500 }]);
  assert.equal((await f.currentOrder()).productionCardIds.length, 3);
  await assert.rejects(f.repo.create(f.input(1)), /en fazla miktar 0/);
});

test('Siparişte olmayan renk, yanlış ürün, marka yokluğu, negatif/kesirli adet ve beden toplamı reddedilir', async () => {
  const f = await setup();
  const before = f.values.get(PRODUCTION_STORAGE_KEY);
  await assert.rejects(f.repo.create({ ...f.input(), selectedColorQuantities: [{ color: 'Mavi', quantity: 1 }] }), /Sipariş kaleminde olmayan renk/);
  const other = await f.definitions.save({ name: 'Sıfır Yaka', note: '', status: 'Aktif' });
  await assert.rejects(f.repo.create({ ...f.input(), productDefinitionId: other.id }), /ürün bağlantısı/);
  await assert.rejects(f.repo.create({ ...f.input(), brand: '' }), /Marka/);
  await assert.rejects(f.repo.create({ ...f.input(), brand: undefined }), /Marka/);
  for (const quantity of [-1, 1.5, NaN]) await assert.rejects(f.repo.create(f.input(quantity)), /tam sayı/);
  await assert.rejects(f.repo.create({ ...f.input(), plannedSizeDistributions: [{ color: 'Siyah', sizes: { S: 499 } }] }), /eşleşmelidir/);
  await assert.rejects(f.repo.create({ ...f.input(), plannedSizeDistributions: [{ color: 'Siyah', sizes: { XS: 500 } }] }), /beden serisi/);
  assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), before);
});

test('Eşzamanlı iki üretim ve sipariş düzenleme en son rezervasyonu dikkate alır', async () => {
  const f = await setup();
  const results = await Promise.allSettled([f.repo.create(f.input(600)), f.repo.create(f.input(600, 'TOMMY'))]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  await assert.rejects(f.repo.updateOrder(f.order.id, f.order.revision ?? 0, f.order), /başka bir işlemde/);
  const order = await f.currentOrder();
  await assert.rejects(f.repo.updateOrder(order.id, order.revision!, { ...order, items: [{ ...order.items[0], colorQuantities: [{ color: 'Siyah', quantity: 500 }] }] }), /600 adet daha önce üretime aktarılmıştır/);
  assert.equal(orderAllocation(order.items[0], await f.repo.list())[0].remaining, 400);
});

test('Sipariş güncelleme kalem kimliğini korur; yeni kalem eklenir; rezervasyon altına düşülmez', async () => {
  const f = await setup(); await f.repo.create(f.input(600));
  const order = await f.currentOrder(); const originalId = order.items[0].id;
  const snapshot = f.values.get(PRODUCTION_STORAGE_KEY);
  for (const items of [[], [{ ...order.items[0], colorQuantities: [{ color: 'Beyaz', quantity: 500 }] }], [{ ...order.items[0], id: 'unknown' }]]) await assert.rejects(f.repo.updateOrder(order.id, order.revision!, { ...order, items }));
  assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), snapshot);
  const updated = await f.repo.updateOrder(order.id, order.revision!, { ...order, note: 'Yeni not', items: [{ ...order.items[0], modelName: 'Yeni Model', colorQuantities: [{ color: 'Siyah', quantity: 600 }, { color: 'Beyaz', quantity: 700 }] }, { ...f.item, modelName: 'İkinci Model' }] });
  assert.equal(updated.items[0].id, originalId); assert.notEqual(updated.items[1].id, originalId);
  assert.equal(updated.items[0].modelName, 'Yeni Model'); assert.equal(updated.note, 'Yeni not');
  assert.equal(orderAllocation(updated.items[0], await f.repo.list())[0].remaining, 0);
  assert.equal((await f.repo.list())[0].productName, 'Basic Polo 2026');
  const nextDefinition = await f.definitions.save({ name: 'Sıfır Yaka', note: '', status: 'Aktif' });
  const revised = await f.repo.updateOrder(updated.id, updated.revision!, { ...updated, items: updated.items.map((i, index) => index === 0 ? { ...i, productDefinitionId: nextDefinition.id } : i) });
  assert.equal(revised.items[0].productDefinitionId, nextDefinition.id);
  assert.equal((await f.repo.list())[0].productDefinitionId, f.definition.id);
});

test('Üretim düzenlemesi güvenli alanlarla sınırlıdır; kesim sonrası seri/firma, tamamlanınca tüm düzenleme kilitlenir', async () => {
  const f = await setup(); let p = await f.repo.create(f.input());
  await f.repo.updateProduction(p.id, p.revision, { ...p, note: 'Yeni not', fabricProperties: 'Yeni özellik', sizeSeries: 'Battal Boy', plannedSizeDistributions: [{ color: 'Siyah', sizes: { '4XL': 500 } }], cutterCompanyId: '' });
  p = await f.current(p.id); assert.equal(p.note, 'Yeni not'); assert.equal(p.sizeSeries, 'Battal Boy'); assert.equal(p.orderItemId, f.order.items[0].id);
  await assert.rejects(f.repo.updateProduction(p.id, p.revision - 1, p), /başka bir işlemde/);
  await assert.rejects(f.repo.updateProduction(p.id, p.revision, { ...p, brand: 'TOMMY' }), /yeni Üretim Kartı/);
  const sections = structuredClone(p.cuttingSheet.brandSections); sections[0].rows[0].rollCount = 2; sections[0].rows[0].kg = 30; sections[0].rows[0].quantity = 500;
  await f.repo.saveCutting(p.id, p.revision, sections, true); p = await f.current(p.id);
  assert.deepEqual(p.sizeDistributions[0].sizes, { '4XL': 500 });
  await assert.rejects(f.repo.updateProduction(p.id, p.revision, { ...p, sizeSeries: 'Yetişkin' }), /Kesim tamamlandıktan/);
  await assert.rejects(f.repo.updateProduction(p.id, p.revision, { ...p, cutterCompanyId: f.cutter.id }), /işlemi başladıktan/);
  await f.repo.updateProduction(p.id, p.revision, { ...p, note: 'Kesim sonrası not' }); p = await f.current(p.id);
  await f.repo.complete(p.id, p.revision, [{ rowId: sections[0].rows[0].id, size: '4XL', good: 500, waste: 0 }], p.date, ''); p = await f.current(p.id);
  await assert.rejects(f.repo.updateProduction(p.id, p.revision, { ...p, note: 'İzin yok' }), /Tamamlanan üretim/);
});

test('Kesim kaydı rezervasyon renklerini ve miktar sınırını aşamaz', async () => {
  const f = await setup(); const p = await f.repo.create(f.input()); const sections = structuredClone(p.cuttingSheet.brandSections);
  sections[0].rows[0].color = 'Mavi'; await assert.rejects(f.repo.saveCutting(p.id, 0, sections, false), /olmayan renk/);
  sections[0].rows[0].color = 'Siyah'; sections[0].rows[0].quantity = 501; sections[0].rows[0].rollCount = 2; sections[0].rows[0].kg = 30;
  await assert.rejects(f.repo.saveCutting(p.id, 0, sections, true), /ayrılan miktarı aşamaz/);
  assert.equal((await f.current(p.id)).revision, 0);
});

test('Başlamış fason işlemin firması değişmez; kart güncellemesi rezervasyon veya bağlantıları değiştiremez', async () => {
  const f = await setup(); let p = await f.repo.create(f.input());
  const sections = structuredClone(p.cuttingSheet.brandSections); sections[0].rows[0].rollCount = 2; sections[0].rows[0].kg = 30; sections[0].rows[0].quantity = 500;
  await f.repo.saveCutting(p.id, p.revision, sections, true); p = await f.current(p.id);
  const stage = { processType: 'Dikim' as const, companyId: f.tailor.id, rowId: sections[0].rows[0].id, sentQuantity: 500, returnedQuantity: 0, priceType: 'Adet Fiyatı' as const, price: 2, sentDate: p.date, returnDate: '', status: 'İşlemde' as const, note: '' };
  await assert.rejects(f.repo.addStage(p.id, p.revision, { ...stage, companyId: f.cutter.id }), /Dikim hizmeti/);
  await f.repo.addStage(p.id, p.revision, stage); p = await f.current(p.id);
  await assert.rejects(f.repo.updateProduction(p.id, p.revision, { ...p, sewingCompanyId: '' }), /işlemi başladıktan/);
  const stages = structuredClone(p.productionStages);
  const extra = { ...p, note: 'Not değişikliği', orderItemId: 'other', orderCardId: 'other', selectedColorQuantities: [{ color: 'Siyah', quantity: 9999 }] };
  await f.repo.updateProduction(p.id, p.revision, extra); p = await f.current(p.id);
  assert.equal(p.orderItemId, f.order.items[0].id); assert.equal(p.orderCardId, f.order.id);
  assert.deepEqual(p.selectedColorQuantities, [{ color: 'Siyah', quantity: 500 }]);
  assert.deepEqual(p.productionStages, stages);
});

test('Eski kesilmemiş kart, yeni beden planı zorunlu tutulmadan notuyla güncellenebilir', async () => {
  const f = await setup(); const p = await f.repo.create(f.input());
  const data = JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!); delete data.productions[0].plannedSizeDistributions;
  f.values.set(PRODUCTION_STORAGE_KEY, JSON.stringify(data));
  const old = await f.current(p.id);
  await f.repo.updateProduction(p.id, old.revision, { ...old, note: 'Geçmiş kart notu' });
  assert.equal((await f.current(p.id)).note, 'Geçmiş kart notu');
  assert.equal((await f.current(p.id)).plannedSizeDistributions, undefined);
});

test('Eski model/beden belgeleri salt okumada değişmez ve eski bedenler korunarak düzenlenir', async () => {
  const f = await setup(); const p = await f.repo.create(f.input());
  const data = JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!);
  delete data.orderCards[0].revision; delete data.orderCards[0].items[0].modelName;
  const old = data.productions[0]; delete old.modelName; delete old.plannedSizeDistributions;
  old.cuttingSheet.completedAt = '2026-09-25'; old.cuttingSheet.brandSections[0].rows[0].rollCount = 2; old.cuttingSheet.brandSections[0].rows[0].kg = 30; old.cuttingSheet.brandSections[0].rows[0].quantity = 500;
  old.sizeDistributions = [{ rowId: old.cuttingSheet.brandSections[0].rows[0].id, sizes: { XS: 100, S: 400 } }];
  const raw = JSON.stringify(data); f.values.set(PRODUCTION_STORAGE_KEY, raw);
  const reloaded = createWorkflowRepository(() => f.storage, f.deps, f.lock);
  assert.equal((await reloaded.listOrders())[0].items[0].productName, 'Polo Yaka');
  const loaded = (await reloaded.list())[0]; assert.ok(productionSizes(loaded).includes('XS'));
  assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), raw);
  await reloaded.updateProduction(p.id, loaded.revision, { ...loaded, note: 'Eski kayıt güncellendi' });
  assert.deepEqual((await reloaded.list())[0].sizeDistributions[0].sizes, { XS: 100, S: 400 });
  assert.throws(() => validatePlannedSizes('Çocuk', [{ color: 'Beyaz', quantity: 1 }], [{ color: 'Beyaz', sizes: { '02 Yaş': 1 } }]), /beden serisi/);
});

test('Sipariş arşivi kalıcıdır, üretim tahsislerini korur ve eski revizyonu reddeder', async () => {
  const f = await setup();
  const p = await f.repo.create(f.input());
  const before = await f.currentOrder();
  const archived = await f.repo.setOrderArchived(before.id, before.revision!, true);
  assert.equal(archived.archived, true); assert.ok(archived.archivedAt);
  const reloaded = createWorkflowRepository(() => f.storage, f.deps, f.lock);
  assert.equal((await reloaded.listOrders()).find((o) => o.id === before.id)?.archived, true);
  assert.deepEqual(await f.current(p.id), p);
  assert.deepEqual(archived.productionCardIds, [p.id]);
  assert.equal(orderAllocation(archived.items[0], await f.repo.list())[0].allocated, 500);
  await assert.rejects(f.repo.updateOrder(before.id, before.revision!, { ...before, note: 'Eski form' }), /başka bir işlemde/);
  await assert.rejects(f.repo.setOrderArchived(before.id, before.revision!, false), /başka bir işlemde/);
  const restored = await reloaded.setOrderArchived(archived.id, archived.revision!, false);
  assert.equal(restored.archived, false); assert.equal(restored.archivedAt, null);
  assert.deepEqual(restored.productionCardIds, [p.id]);
  assert.equal(restored.createdAt, before.createdAt);
  assert.equal((await reloaded.listOrders()).length, 1);
});

test('Termin oluşturulur, güncellenir, temizlenir; eski eksik alanlar salt okumada korunur', async () => {
  const f = await setup();
  let order = await f.repo.createOrder({ ...f.order, dueDate: '2026-10-10' });
  assert.equal(order.dueDate, '2026-10-10');
  order = await f.repo.updateOrder(order.id, order.revision!, { ...order, dueDate: '2026-10-20' });
  assert.equal((await f.repo.listOrders()).find((o) => o.id === order.id)?.dueDate, '2026-10-20');
  await assert.rejects(f.repo.updateOrder(order.id, order.revision!, { ...order, dueDate: 'not-a-date' }), /tarih/i);
  order = await f.repo.updateOrder(order.id, order.revision!, { ...order, dueDate: '' });
  assert.equal(order.dueDate, undefined);
  const raw = JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!);
  delete raw.orderCards[0].createdAt; delete raw.orderCards[0].archived; delete raw.orderCards[0].dueDate;
  f.values.set(PRODUCTION_STORAGE_KEY, JSON.stringify(raw));
  const snapshot = f.values.get(PRODUCTION_STORAGE_KEY);
  for (let i = 0; i < 3; i++) {
    const read = await f.repo.listOrders(); assert.equal(read.length, 2); assert.equal(!!read[0].archived, false);
  }
  assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), snapshot);
});

test('Sipariş sıralaması createdAt kullanır, eşit zamanda numara ve eski kayıtta tarih kullanır', async () => {
  const { newestOrdersFirst } = await import('../src/domain/productionWorkflow.ts');
  const f = await setup();
  const older = { ...f.order, id: 'old', orderNo: 'SP-0001', date: '2027-01-01', createdAt: '2026-09-01T09:00:00Z' };
  const newer = { ...f.order, id: 'new', orderNo: 'SP-0002', date: '2025-01-01', createdAt: '2026-09-02T09:00:00Z' };
  const tied = { ...newer, id: 'tie', orderNo: 'SP-0003' };
  const legacy = { ...older, id: 'legacy', createdAt: undefined, date: '2020-01-01' } as unknown as typeof older;
  const records = [older, newer, legacy, tied];
  assert.deepEqual(newestOrdersFirst(records).map((o) => o.id), ['tie', 'new', 'old', 'legacy']);
  assert.deepEqual(records.map((o) => o.id), ['old', 'new', 'legacy', 'tie']);
});

test('Yeni üretimin kesim sonuçları boş başlar, sonuç girilmeden tamamlanamaz', async () => {
  const f = await setup(); const p = await f.repo.create(f.input());
  const row = p.cuttingSheet.brandSections[0].rows[0];
  assert.equal(row.rollCount, null); assert.equal(row.kg, null); assert.equal(row.quantity, null);
  assert.equal((await f.repo.list()).length, 1);
  await assert.rejects(f.repo.saveCutting(p.id, p.revision, p.cuttingSheet.brandSections, true), /Top sayısı/);
});

test('Eski üretimden türetilen sipariş arşivlenip açılırken kopyalanmaz', async () => {
  const f = await setup(); const p = await f.repo.create(f.input());
  const data = JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!); data.orderCards = [];
  f.values.set(PRODUCTION_STORAGE_KEY, JSON.stringify(data));
  const legacy = (await f.repo.listOrders())[0]; assert.equal(legacy.legacy, true);
  let archived = await f.repo.setOrderArchived(legacy.id, legacy.revision ?? 0, true);
  for (let i = 0; i < 3; i++) {
    const orders = await f.repo.listOrders(); assert.equal(orders.length, 1); assert.equal(orders[0].archived, true);
  }
  archived = await f.repo.setOrderArchived(archived.id, archived.revision!, false);
  assert.deepEqual(archived.productionCardIds, [p.id]);
  assert.deepEqual(await f.current(p.id), p);
  assert.equal(JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!).orderCards.length, 1);
});
