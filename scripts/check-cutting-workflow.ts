import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkflowRepository, PRODUCTION_STORAGE_KEY } from '../src/data/production/workflowRepository.ts';
import { cuttingAllocation, cutProductionAllocation } from '../src/domain/cuttingWorkflow.ts';
import { defaultSizeDistribution, cutRows } from '../src/domain/productionWorkflow.ts';

async function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  let pending = Promise.resolve();
  const lock = (_key: string, work: () => Promise<any>) => { const next = pending.then(work); pending = next.catch(() => {}); return next; };
  const services = ['Kesim', 'Nakış', 'Baskı', 'Dikim', 'Ütü & Paket'];
  const repo = createWorkflowRepository(() => storage, {
    contacts: { async get(id: string) { return { id, status: 'Aktif', roles: id === 'customer' ? ['Hazır Giyim Müşterisi'] : ['Fasoncu'], services: services.includes(id) ? [id] : [] }; } },
    definitions: { async requireActive(id: string) { return { id, name: 'Tişört' }; } },
    products: { async load() { return { productionReceipts: [] }; } },
    fabrics: { async load() { return { records: [] }; } },
  } as any, lock);
  const order = await repo.createOrder({ orderName: 'Yaz Siparişi', orderType: 'Stok İçin Üretim', customerId: 'ignored', date: '2026-09-26', note: '', items: [{ productDefinitionId: 'product', modelName: 'Polo', fabricName: 'Penye', gsm: '', fabricProperties: 'Pamuk', productDetails: '', instructions: ['Yaka ribana', 'Etiket içte'], colorQuantities: [{ color: 'Beyaz', quantity: 500 }, { color: 'Siyah', quantity: 500 }] }] });
  const cutInput = { orderId: order.id, orderItemId: order.items[0].id, date: order.date, cutterCompanyId: 'Kesim', requested: [{ color: 'Beyaz', quantity: 500 }, { color: 'Siyah', quantity: 500 }], sizeSeries: 'Yetişkin' as const, sizeDistribution: defaultSizeDistribution('Yetişkin'), note: '' };
  const productionInput = { productionName: 'Polo üretimi', brand: 'ARGENT', productionDueDate: '2026-10-01', date: order.date, selectedColorQuantities: [{ color: 'Beyaz', quantity: 487 }], embroideryCompanyId: 'Nakış', printingCompanyId: 'Baskı', sewingCompanyId: 'Dikim', ironingPackagingCompanyId: 'Ütü & Paket', note: 'Paket talimatı' };
  const currentCut = async (id: string) => (await repo.listCuttingOrders()).find((c) => c.id === id)!;
  const currentOrder = async () => (await repo.listOrders())[0];
  async function result() {
    const c = await repo.createCuttingOrder(cutInput);
    await repo.saveCuttingOrderResult(c.id, c.revision, { date: order.date, rows: [{ color: 'Beyaz', rollCount: 2, kg: 90, quantity: 487 }, { color: 'Siyah', rollCount: 2, kg: 92, quantity: 492 }] });
    return currentCut(c.id);
  }
  return { repo, values, order, cutInput, productionInput, currentCut, currentOrder, result };
}

test('Yeni sipariş kesim emri ister; müşteri ve kumaş kuralları korunur', async () => {
  const f = await setup();
  assert.equal(f.order.workflowVersion, 2); assert.equal(f.order.customerId, undefined); assert.equal(f.order.items[0].gsm, '');
  for (const input of [{ ...f.order, orderName: '' }, { ...f.order, orderType: 'Ön Sipariş' as const, customerId: '' }, { ...f.order, items: [{ ...f.order.items[0], fabricName: '' }] }]) await assert.rejects(f.repo.createOrder(input));
  await assert.rejects(f.repo.create({ productDefinitionId: 'product', orderCardId: f.order.id, brand: 'ARGENT', fabricId: '', fabricName: 'Penye', gsm: '', sizeSeries: 'Yetişkin', cuttingMode: 'Hedef Adet', targetQuantity: 500, cutterCompanyId: 'Kesim', date: f.order.date, productInstructions: '', note: '' }), /önce Kesim Emri/);
  await assert.rejects(f.repo.createCuttingOrder({ ...f.cutInput, cutterCompanyId: 'Dikim' }), /Kesim hizmeti/);
});

test('500 hedef → 487 sonuç, 13 yeniden kesim; iki kez tahsis ve erken üretim engellenir', async () => {
  const f = await setup(); const c = await f.repo.createCuttingOrder(f.cutInput);
  await assert.rejects(f.repo.createProductionFromCut(c.id, c.revision, f.productionInput), /önce Kesim Sonucu/);
  await assert.rejects(f.repo.createCuttingOrder({ ...f.cutInput, requested: [{ color: 'Beyaz', quantity: 1 }] }), /kalan 0/);
  const result = { date: f.order.date, rows: [{ color: 'Beyaz', rollCount: 2, kg: 90, quantity: 487 }, { color: 'Siyah', rollCount: 2, kg: 92, quantity: 492 }] };
  await assert.rejects(f.repo.saveCuttingOrderResult(c.id, c.revision, { ...result, rows: [{ ...result.rows[0], color: 'Mavi' }, result.rows[1]] }), /olmayan renk/);
  await f.repo.saveCuttingOrderResult(c.id, c.revision, result);
  assert.deepEqual(cuttingAllocation(f.order.items[0], await f.repo.listCuttingOrders()).map((r) => r.remaining), [13, 8]);
  await f.repo.createCuttingOrder({ ...f.cutInput, requested: [{ color: 'Beyaz', quantity: 13 }] });
  await assert.rejects(f.repo.createCuttingOrder({ ...f.cutInput, requested: [{ color: 'Beyaz', quantity: 1 }] }), /kalan 0/);
  const cut = await f.currentCut(c.id);
  await assert.rejects(f.repo.createProductionFromCut(c.id, cut.revision, { ...f.productionInput, selectedColorQuantities: [{ color: 'Beyaz', quantity: 488 }] }), /kalan 487/);
  const p1 = await f.repo.createProductionFromCut(c.id, cut.revision, { ...f.productionInput, selectedColorQuantities: [{ color: 'Beyaz', quantity: 200 }] });
  await assert.rejects(f.repo.createProductionFromCut(c.id, cut.revision, f.productionInput), /değişti/);
  const p2 = await f.repo.createProductionFromCut(c.id, (await f.currentCut(c.id)).revision, { ...f.productionInput, selectedColorQuantities: [{ color: 'Beyaz', quantity: 287 }, { color: 'Siyah', quantity: 492 }] });
  assert.equal(p1.cuttingOrderId, c.id); assert.equal(p2.targetQuantity, 779); assert.equal(p2.productInstructions, 'Yaka ribana\nEtiket içte');
  assert.deepEqual(cutProductionAllocation(cut, await f.repo.list()).map((r) => r.remaining), [0, 0]);
  await assert.rejects(f.repo.createProductionFromCut(c.id, (await f.currentCut(c.id)).revision, f.productionInput), /kalan 0/);
  await assert.rejects(f.repo.saveCutting(p1.id, p1.revision, p1.cuttingSheet.brandSections, false), /bağlı Kesim Emrindedir/);
  await assert.rejects(f.repo.saveSizes(p1.id, p1.revision, []), /Pastal Kesim Emrinde/);
  const snapshot = f.values.get(PRODUCTION_STORAGE_KEY); await f.repo.list(); await f.repo.listOrders(); await f.repo.listCuttingOrders(); assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), snapshot);
});

test('Eşzamanlı kesim tahsisi, gerçek fazla/sıfır çıktı ve fason hizmetleri doğrulanır', async () => {
  const f = await setup();
  const attempted = await Promise.allSettled([f.repo.createCuttingOrder(f.cutInput), f.repo.createCuttingOrder(f.cutInput)]);
  assert.equal(attempted.filter((r) => r.status === 'fulfilled').length, 1);
  const c = (await f.repo.listCuttingOrders())[0];
  await f.repo.saveCuttingOrderResult(c.id, c.revision, { date: f.order.date, rows: [{ color: 'Beyaz', rollCount: 3, kg: 100, quantity: 510 }, { color: 'Siyah', rollCount: 0, kg: 0, quantity: 0 }] });
  assert.deepEqual(cuttingAllocation(f.order.items[0], await f.repo.listCuttingOrders()).map((r) => r.remaining), [0, 500]);
  const cut = await f.currentCut(c.id);
  for (const field of ['embroideryCompanyId', 'printingCompanyId', 'sewingCompanyId', 'ironingPackagingCompanyId']) await assert.rejects(f.repo.createProductionFromCut(c.id, cut.revision, { ...f.productionInput, [field]: 'Kesim' }), /hizmeti veren/);
  const p = await f.repo.createProductionFromCut(c.id, cut.revision, { ...f.productionInput, selectedColorQuantities: [{ color: 'Beyaz', quantity: 510 }] });
  assert.equal(p.targetQuantity, 510);
});

test('Arşiv ve PIN ile çöp tüm zinciri taşır; geri yükleme çift tahsis yapmaz', async () => {
  const f = await setup(); const c = await f.result();
  const p = await f.repo.createProductionFromCut(c.id, c.revision, f.productionInput);
  await f.repo.setOrderArchived(f.order.id, (await f.currentOrder()).revision!, true);
  assert.ok((await f.currentCut(c.id)).archived); assert.ok((await f.repo.list())[0].archived);
  await assert.rejects(f.repo.createProductionFromCut(c.id, (await f.currentCut(c.id)).revision, f.productionInput), /arşivden/);
  await f.repo.setOrderArchived(f.order.id, (await f.currentOrder()).revision!, false);
  await f.repo.deletionPin.setup('123456', '123456');
  await assert.rejects(f.repo.deleteOrder(f.order.id, (await f.currentOrder()).revision!, 'wrong'));
  await f.repo.deleteOrder(f.order.id, (await f.currentOrder()).revision!, '123456');
  assert.ok((await f.currentCut(c.id)).deleted); assert.ok((await f.repo.list())[0].deleted);
  await f.repo.restoreOrder(f.order.id, (await f.currentOrder()).revision!);
  assert.equal((await f.currentCut(c.id)).deleted, false); assert.equal((await f.repo.list())[0].deleted, false);
  let current = (await f.repo.list())[0];
  await f.repo.deleteProduction(p.id, current.revision, '123456');
  const replacement = await f.repo.createProductionFromCut(c.id, (await f.currentCut(c.id)).revision, f.productionInput);
  current = (await f.repo.list()).find((r) => r.id === p.id)!;
  await assert.rejects(f.repo.restoreProduction(p.id, current.revision), /tahsisi/);
  await f.repo.addStage(replacement.id, replacement.revision, { processType: 'Dikim', companyId: 'Dikim', rowId: cutRows(replacement)[0].id, sentQuantity: 487, returnedQuantity: 0, priceType: 'Toplam Fiyat', price: 0, sentDate: f.order.date, returnDate: '', status: 'İşlemde', note: '' });
  current = (await f.repo.list()).find((r) => r.id === replacement.id)!;
  await f.repo.deleteProduction(current.id, current.revision, '123456');
  assert.equal(cutProductionAllocation(await f.currentCut(c.id), await f.repo.list())[0].remaining, 0);
});
