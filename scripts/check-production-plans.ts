import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlanRepository } from '../src/data/production/planRepository.ts';
import { createWorkflowRepository, PRODUCTION_STORAGE_KEY } from '../src/data/production/workflowRepository.ts';
import { INTERNAL_CUSTOMER_ID, completedQuantity, currentCompany, deadlineText, isInternalPlan, itemStatus, planStatus, remainingDays, stageInput } from '../src/domain/productionPlan.ts';
import type { PlanInput, PlanStage } from '../src/domain/productionPlan';
import { defaultSizeDistribution } from '../src/domain/productionWorkflow.ts';
import { createProductRepository } from '../src/data/products/localStorageRepository.ts';

export function planFixture() {
  const values = new Map<string, string>(); let fail = false;
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { if (fail && k === PRODUCTION_STORAGE_KEY) throw new Error('disk full'); values.set(k, v); } };
  let pending = Promise.resolve();
  const lock = (_key: string, work: () => Promise<any>) => { const next = pending.then(work); pending = next.catch(() => {}); return next; };
  const receipts: any[] = [];
  const deps = {
    contacts: { async get(id: string) { return { id, name: id === 'external-argent' ? 'ARGENT' : id, status: 'Aktif', roles: ['customer', 'external-argent'].includes(id) ? ['Hazır Giyim Müşterisi'] : ['Fasoncu'], services: [id] }; } },
    definitions: { async requireActive(id: string) { return { id, name: 'Polo' }; } },
    products: { async load() { return { productionReceipts: receipts }; }, async receiveProduction(input: any) { let receipt = receipts.find((r) => r.jobId === input.jobId); if (!receipt) { receipt = { ...input, good: input.colors.reduce((n: number, r: any) => n + r.quantity, 0), stockIds: ['stock-1'] }; receipts.push(receipt); } return receipt; } },
    fabrics: { async load() { return { records: [] }; } },
  };
  const repo = createPlanRepository(() => storage, deps as any, lock);
  const old = createWorkflowRepository(() => storage, deps as any, lock);
  const input: PlanInput = { name: 'ABC planı', customerId: 'customer', date: '2026-09-26', dueDate: '2026-10-05', customerReference: 'ABC-123', note: 'Özel müşteri bilgisi', items: [{ productDefinitionId: 'product', modelName: 'Polo', brand: 'PALO', fabricName: 'Penye', gsm: '', fabricProperties: '', colors: [{ color: 'Siyah', quantity: 500 }], sizeSeries: 'Yetişkin', sizeDistribution: defaultSizeDistribution('Yetişkin'), instructions: ['Logo tona ton', 'Etiket içte'], materials: [{ name: 'İplik', description: '', quantity: '' }], enabledStages: ['Kesim', 'Nakış', 'Dikim', 'Ütü & Paket'] }] };
  const current = async (id: string) => (await repo.list()).find((p) => p.id === id)!;
  async function stage(id: string, itemId: string, type: PlanStage, qty: number) {
    let p = await current(id); await repo.startStage(id, p.revision, itemId, type, { companyId: type, date: input.date, notes: ['Teknik not'], colorNotes: [{ color: 'Siyah', note: 'Antrasit' }] });
    p = await current(id); return repo.finishStage(id, p.revision, itemId, type, { date: input.date, rows: [{ color: 'Siyah', quantity: qty }] });
  }
  return { repo, old, values, storage, deps, input, current, stage, receipts, failWrites: (v: boolean) => { fail = v; } };
}

test('1 plan + 3 ürün, zorunlu marka/termin/müşteri ve opsiyonel gramaj', async () => {
  const f = planFixture();
  const p = await f.repo.create({ ...f.input, items: ['PALO', 'BUS', 'Markasız'].map((brand) => ({ ...f.input.items[0], brand })) });
  assert.equal((await f.repo.list()).length, 1); assert.equal(p.items.length, 3); assert.equal(new Set(p.items.map((i) => i.id)).size, 3); assert.equal(p.planNo, 'UP-001');
  assert.equal(p.items[2].brand, 'Markasız'); assert.equal(p.items[0].gsm, '');
  assert.deepEqual(p.items[0].sizeDistribution, { S: 1, M: 1, L: 1, XL: 1, '2XL': 1, '3XL': 1 });
  assert.equal(p.items[0].instructions.length, 2); assert.equal(p.items[0].materials[0].name, 'İplik');
  for (const input of [{ ...f.input, customerId: '' }, { ...f.input, dueDate: '' }, { ...f.input, name: '' }, { ...f.input, items: [{ ...f.input.items[0], brand: '' }] }, { ...f.input, items: [{ ...f.input.items[0], materials: [{ name: '', description: '', quantity: '' }] }] }]) await assert.rejects(f.repo.create(input));
  assert.equal((await f.repo.list()).length, 1);
});

test('ARGENT kimliği sabittir; aynı adlı harici müşteri stok üretimi sayılmaz', async () => {
  const f = planFixture();
  const p = await f.repo.create({ ...f.input, customerId: INTERNAL_CUSTOMER_ID }); assert.ok(isInternalPlan(p));
  const external = await f.repo.create({ ...f.input, customerId: 'external-argent' }); assert.equal(isInternalPlan(external), false);
});

test('510 kesim → 505 nakış → 500 dikim → 498 paket; tek kalemde otomatik başlangıç', async () => {
  const f = planFixture(), p = await f.repo.create(f.input), item = p.items[0];
  await assert.rejects(f.repo.startStage(p.id, p.revision, item.id, 'Nakış', { companyId: 'Nakış', date: p.date, notes: [], colorNotes: [] }), /önceki aşamayı/);
  const cut = await f.stage(p.id, item.id, 'Kesim', 510); assert.equal(stageInput(cut.items[0], 'Nakış')[0].quantity, 510);
  await f.repo.startStage(p.id, cut.revision, item.id, 'Nakış', { companyId: 'Nakış', date: p.date, notes: ['Logo tona ton olacak', 'Sol göğüs 8 cm'], colorNotes: [{ color: 'Siyah', note: 'Antrasit' }] });
  let current = await f.current(p.id); assert.equal(itemStatus(current.items[0]), 'Nakışta'); assert.equal(currentCompany(current.items[0]), 'Nakış');
  await assert.rejects(f.repo.finishStage(p.id, current.revision, item.id, 'Nakış', { date: p.date, rows: [{ color: 'Siyah', quantity: 511 }] }), /başlangıç miktarını aşamaz/);
  await f.repo.finishStage(p.id, current.revision, item.id, 'Nakış', { date: p.date, rows: [{ color: 'Siyah', quantity: 505 }] });
  current = await f.current(p.id); assert.equal(stageInput(current.items[0], 'Dikim')[0].quantity, 505);
  await f.stage(p.id, item.id, 'Dikim', 500); const complete = await f.stage(p.id, item.id, 'Ütü & Paket', 498);
  assert.equal(completedQuantity(complete.items[0]), 498); assert.equal(planStatus(complete), 'Tamamlandı'); assert.equal(complete.items[0].id, item.id); assert.equal((await f.repo.list()).length, 1);
  const stored = JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!); assert.equal(stored.cuttingOrders, undefined); assert.equal(stored.productions, undefined);
});

test('Aşama filtreleri, fazla/negatif/tekrarlı renk, eski ekran ve değişmez sonuç', async () => {
  const f = planFixture(), p = await f.repo.create(f.input), i = p.items[0];
  await assert.rejects(f.repo.startStage(p.id, 0, i.id, 'Kesim', { companyId: 'Dikim', date: p.date, notes: [], colorNotes: [] }), /Kesim hizmeti/);
  const started = await f.repo.startStage(p.id, 0, i.id, 'Kesim', { companyId: 'Kesim', date: p.date, notes: [], colorNotes: [] });
  for (const rows of [[{ color: 'Siyah', quantity: -1 }], [{ color: 'Mavi', quantity: 510 }], [{ color: 'Siyah', quantity: 2 }, { color: 'Siyah', quantity: 3 }]]) await assert.rejects(f.repo.finishStage(p.id, started.revision, i.id, 'Kesim', { date: p.date, rows }));
  await assert.rejects(f.repo.finishStage(p.id, 0, i.id, 'Kesim', { date: p.date, rows: [{ color: 'Siyah', quantity: 510 }] }), /Plan değişti/);
  const cut = await f.repo.finishStage(p.id, started.revision, i.id, 'Kesim', { date: p.date, rows: [{ color: 'Siyah', quantity: 510 }] });
  await assert.rejects(f.repo.finishStage(p.id, cut.revision, i.id, 'Kesim', { date: p.date, rows: [{ color: 'Siyah', quantity: 520 }] }), /zaten tamamlanmış/);
  await assert.rejects(f.repo.update(p.id, cut.revision, f.input), /kilitlidir/);
});

test('Opsiyonel aşamalar atlanır; plan ancak bütün ürünler bittiğinde tamamlanır', async () => {
  const f = planFixture(), input = { ...f.input, items: [f.input.items[0], { ...f.input.items[0], enabledStages: ['Kesim', 'Baskı', 'Dikim', 'Ütü & Paket'] as PlanStage[] }] }, p = await f.repo.create(input);
  for (const i of p.items) { await f.stage(p.id, i.id, 'Kesim', 510); await f.stage(p.id, i.id, i.enabledStages.includes('Nakış') ? 'Nakış' : 'Baskı', 505); await f.stage(p.id, i.id, 'Dikim', 500); await f.stage(p.id, i.id, 'Ütü & Paket', 498); if (i === p.items[0]) assert.equal(planStatus(await f.current(p.id)), 'Üretimde'); }
  assert.equal(planStatus(await f.current(p.id)), 'Tamamlandı');
});

test('Termin İstanbul takvim gününe göre hesaplanır, gecikme açık gösterilir', () => {
  assert.equal(remainingDays('2026-10-05', new Date('2026-09-26T09:00:00Z')), 9);
  assert.equal(remainingDays('2026-10-05', new Date('2026-10-04T22:30:00Z')), 0);
  assert.equal(deadlineText('2026-10-05', new Date('2026-10-07T09:00:00Z')), '2 gün gecikti');
});

test('PIN, arşiv, çöp ve geri yükleme aynı ürün/aşama verilerini korur', async () => {
  const f = planFixture(), p = await f.repo.create(f.input); await f.stage(p.id, p.items[0].id, 'Kesim', 510);
  let current = await f.current(p.id); const before = structuredClone(current.items);
  await f.repo.setArchived(p.id, current.revision, true); current = await f.current(p.id); assert.ok(current.archived);
  await assert.rejects(f.repo.startStage(p.id, current.revision, p.items[0].id, 'Nakış', { companyId: 'Nakış', date: p.date, notes: [], colorNotes: [] }), /geri alın/);
  await f.repo.setArchived(p.id, current.revision, false); current = await f.current(p.id);
  await f.repo.deletionPin.setup('123456', '123456'); await assert.rejects(f.repo.trash(p.id, current.revision, 'wrong'));
  await f.repo.trash(p.id, current.revision, '123456'); current = await f.current(p.id); assert.ok(current.deleted);
  await f.repo.restore(p.id, current.revision); assert.deepEqual((await f.current(p.id)).items, before);
});

test('Eski kesim kaydı kayıpsız dönüşür; okuma yazmaz, ilk işlem ham geçmişi korur', async () => {
  const f = planFixture(); const o = await f.old.createOrder({ orderName: 'Eski Stok', orderType: 'Stok İçin Üretim', date: f.input.date, dueDate: f.input.dueDate, note: '', items: [{ productDefinitionId: 'product', modelName: 'Polo', colorQuantities: [{ color: 'Siyah', quantity: 500 }], fabricName: 'Penye', gsm: '', fabricProperties: '', productDetails: '', instructions: ['Etiket içte'] }] });
  const c = await f.old.createCuttingOrder({ orderId: o.id, orderItemId: o.items[0].id, date: o.date, cutterCompanyId: 'Kesim', requested: [{ color: 'Siyah', quantity: 500 }], sizeSeries: 'Yetişkin', sizeDistribution: defaultSizeDistribution('Yetişkin'), note: '' });
  await f.old.saveCuttingOrderResult(c.id, c.revision, { date: o.date, rows: [{ color: 'Siyah', quantity: 510, kg: 0, rollCount: 0 }] });
  const before = f.values.get(PRODUCTION_STORAGE_KEY)!, p = (await f.repo.list())[0]; assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), before);
  assert.equal(p.customerId, INTERNAL_CUSTOMER_ID); assert.equal(p.items[0].id, o.items[0].id); assert.equal(p.items[0].legacy?.readOnly, false); assert.equal(stageInput(p.items[0], 'Dikim')[0].quantity, 510);
  await f.stage(p.id, p.items[0].id, 'Dikim', 505);
  const after = JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!); assert.deepEqual(after.orderCards, JSON.parse(before).orderCards); assert.deepEqual(after.cuttingOrders, JSON.parse(before).cuttingOrders); assert.equal((await f.repo.list()).length, 1);
});

test('ARGENT stok aktarımı mevcut makbuzu kullanır; yazım hatasında yeniden aktarım çoğaltmaz', async () => {
  const f = planFixture(), p = await f.repo.create({ ...f.input, customerId: INTERNAL_CUSTOMER_ID }); const i = p.items[0];
  for (const [type, quantity] of [['Kesim', 510], ['Nakış', 505], ['Dikim', 500], ['Ütü & Paket', 498]] as const) await f.stage(p.id, i.id, type, quantity);
  const current = await f.current(p.id); f.failWrites(true); await assert.rejects(f.repo.transfer(p.id, current.revision, i.id), /kaydedilemedi/); f.failWrites(false);
  await f.repo.transfer(p.id, current.revision, i.id); assert.equal(f.receipts.length, 1); assert.equal(f.receipts[0].good, 498); assert.equal(f.receipts[0].waste, 12);
  assert.ok((await f.current(p.id)).items[0].stockTransfer);
});

test('Gerçek stok deposuna 498 adet bir kez girer; cari ve malzeme hareketi oluşmaz', async () => {
  const f = planFixture(), products = createProductRepository(() => f.storage, f.deps.contacts as any);
  const repo = createPlanRepository(() => f.storage, { ...f.deps, products } as any);
  const p = await repo.create({ ...f.input, customerId: INTERNAL_CUSTOMER_ID });
  for (const [type, quantity] of [['Kesim', 510], ['Nakış', 505], ['Dikim', 500], ['Ütü & Paket', 498]] as const) await f.stage(p.id, p.items[0].id, type, quantity);
  await repo.transfer(p.id, (await f.current(p.id)).revision, p.items[0].id);
  await repo.transfer(p.id, (await f.current(p.id)).revision, p.items[0].id);
  const stock = await products.load(); assert.equal(stock.records.length, 1); assert.equal(stock.records[0].quantity, 498); assert.equal(stock.productionReceipts?.length, 1); assert.equal(stock.accountMovements.length, 0);
  assert.deepEqual([...f.values.keys()].sort(), ['argent-tekstil.production.v1', 'argent-tekstil.products.v1']);
});

test('Eski mali aşamalar salt okunur kalır; grup çöp/geri yükleme ham işlemleri korur', async () => {
  const f = planFixture(); const o = await f.old.createOrder({ orderName: 'Geçmiş Plan', orderType: 'Stok İçin Üretim', date: f.input.date, dueDate: f.input.dueDate, note: '', items: [{ productDefinitionId: 'product', modelName: 'Polo', colorQuantities: [{ color: 'Siyah', quantity: 500 }], fabricName: 'Penye', gsm: '180', fabricProperties: '', productDetails: '' }] });
  const c = await f.old.createCuttingOrder({ orderId: o.id, orderItemId: o.items[0].id, date: o.date, cutterCompanyId: 'Kesim', requested: [{ color: 'Siyah', quantity: 500 }], sizeSeries: 'Yetişkin', sizeDistribution: defaultSizeDistribution('Yetişkin'), note: '' });
  await f.old.saveCuttingOrderResult(c.id, c.revision, { date: o.date, rows: [{ color: 'Siyah', quantity: 487, kg: 85, rollCount: 2 }] });
  const cut = (await f.old.listCuttingOrders())[0]; const card = await f.old.createProductionFromCut(c.id, cut.revision, { productionName: 'Polo', brand: 'PALO', productionDueDate: f.input.dueDate, date: o.date, selectedColorQuantities: [{ color: 'Siyah', quantity: 487 }], embroideryCompanyId: '', printingCompanyId: '', sewingCompanyId: 'Dikim', ironingPackagingCompanyId: '', note: '' });
  await f.old.addStage(card.id, card.revision, { processType: 'Dikim', companyId: 'Dikim', rowId: card.cuttingSheet.brandSections[0].rows[0].id, sentQuantity: 487, returnedQuantity: 400, priceType: 'Adet Fiyatı', price: 10, sentDate: o.date, returnDate: o.date, status: 'Kısmi Geldi', note: 'Eski not' });
  const snapshot = f.values.get(PRODUCTION_STORAGE_KEY), p = (await f.repo.list())[0]; assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), snapshot); assert.ok(p.items[0].legacy?.readOnly); assert.equal(itemStatus(p.items[0]), 'Dikimde');
  await assert.rejects(f.repo.finishStage(p.id, p.revision, p.items[0].id, 'Dikim', { date: o.date, rows: [{ color: 'Siyah', quantity: 400 }] }), /salt okunur/);
  await f.repo.deletionPin.setup('123456', '123456'); await f.repo.trash(p.id, p.revision, '123456');
  assert.ok((await f.old.list())[0].deleted); assert.ok((await f.old.listCuttingOrders())[0].deleted);
  const trashed = await f.current(p.id); await f.repo.restore(p.id, trashed.revision);
  assert.equal((await f.old.list())[0].deleted, false); assert.deepEqual((await f.old.list())[0].productionStages, JSON.parse(snapshot!).productions[0].productionStages);
});

test('Depolama hatası ve bozuk kayıt mevcut belgeyi değiştirmez; eşzamanlı aşama tek kez başlar', async () => {
  const f = planFixture(), p = await f.repo.create(f.input), before = f.values.get(PRODUCTION_STORAGE_KEY);
  f.failWrites(true); await assert.rejects(f.repo.setArchived(p.id, p.revision, true), /kaydedilemedi/); f.failWrites(false); assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), before);
  const start = () => f.repo.startStage(p.id, 0, p.items[0].id, 'Kesim', { companyId: 'Kesim', date: p.date, notes: [], colorNotes: [] });
  const results = await Promise.allSettled([start(), start()]); assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  f.values.set(PRODUCTION_STORAGE_KEY, '{broken'); await assert.rejects(f.repo.list(), /kayıtları okunamadı/); assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), '{broken');
});
