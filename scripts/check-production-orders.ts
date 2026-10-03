import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrderRepository } from '../src/data/production/orderRepository.ts';
import { createPlanRepository } from '../src/data/production/planRepository.ts';
import { migratedOrders } from '../src/data/production/orderMigration.ts';
import { INTERNAL_CUSTOMER_ID, isInternalPlan, stageInput, completedQuantity } from '../src/domain/productionPlan.ts';
import { emptyEmbroidery, emptyPackaging } from '../src/domain/productionOrder.ts';
import { defaultSizeDistribution } from '../src/domain/productionWorkflow.ts';
import type { ProductionOrderInput } from '../src/domain/productionOrder';
import type { PlanStage } from '../src/domain/productionPlan';
import { createOrderDrafts, DRAFT_KEY } from '../src/data/production/orderDrafts.ts';
import { stockStatus, differenceText } from '../src/domain/productionOrder.ts';
import { liveGroups, stagePlan } from '../src/domain/productionPlanning.ts';
import { currentCompany, activeStages, currentQuantity, productionRoute, stageAvailable, stageState } from '../src/domain/productionPlan.ts';
import { orderProductionStatus } from '../src/domain/productionOrder.ts';

async function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  const receipts: any[] = [];
  const deps: any = {
    contacts: { async get(id: string) { return { id, name: 'ARGENT', status: 'Aktif', roles: id === 'customer' ? ['Hazır Giyim Müşterisi'] : ['Fasoncu'], services: [id] }; } },
    definitions: { async requireActive(id: string) { return { id, name: 'Polo' }; } },
    products: { async load() { return { records: [], productionReceipts: receipts }; }, async receiveProduction(input: any) { const receipt = receipts.find((r) => r.jobId === input.jobId) ?? { ...input, stockIds: ['stock'] }; if (!receipts.includes(receipt)) receipts.push(receipt); return receipt; } },
  };
  const repo = createOrderRepository(() => storage, deps), old = createPlanRepository(() => storage, deps);
  const brand = await repo.createBrand('PALO');
  const input: ProductionOrderInput = { name: 'Sipariş', customerId: 'customer', date: '2026-09-27', dueDate: '2026-10-05', customerReference: '', customerNote: '', note: '', product: { productDefinitionId: 'polo', modelName: 'Model', brandId: brand.id, fabricName: 'Penye', gsm: '', fabricProperties: '', colors: [{ color: 'Siyah', quantity: 500 }, { color: 'Beyaz', quantity: 300 }], instructions: ['Etiket', 'Ribana'], sizeSeries: 'Yetişkin', sizeDistribution: defaultSizeDistribution('Yetişkin'), enabledStages: ['Kesim', 'Nakış', 'Dikim', 'Ütü & Paket'], materials: [], embroidery: emptyEmbroidery(), packaging: emptyPackaging() } };
  return { repo, old, input, values, storage, receipts };
}
test('v4: tek ürün, kayıtlı marka, zorunlu alanlar ve stabil ARGENT kimliği', async () => {
  const { repo, input } = await fixture();
  for (let n = 0; n < 3; n++) await repo.create(input);
  assert.equal((await repo.list()).length, 3); assert.ok((await repo.list()).every((o) => !('items' in o) && o.product.gsm === ''));
  for (const invalid of [{ ...input, items: [input.product] }, { ...input, dueDate: '' }, { ...input, product: { ...input.product, brandId: '' } }, { ...input, product: { ...input.product, colors: [] } }]) await assert.rejects(repo.create(invalid));
  assert.equal(isInternalPlan((await repo.list())[0]), false);
  for (let n = 0; n < 2; n++) assert.ok(isInternalPlan(await repo.create({ ...input, customerId: INTERNAL_CUSTOMER_ID })));
  assert.ok(!(await repo.listBrands()).some((b) => b.name === 'Markasız')); await repo.createBrand('Markasız'); assert.ok((await repo.listBrands()).some((b) => b.name === 'Markasız'));
});
test('v4: çok renkli aşamalar, fazla sonuç koruması, stok aktarımı ve eski revizyon', async () => {
  const { repo, input, receipts } = await fixture(); let o = await repo.create({ ...input, customerId: INTERNAL_CUSTOMER_ID });
  const id = o.id;
  for (const [type, amount] of [['Kesim', 510], ['Nakış', 505], ['Dikim', 500], ['Ütü & Paket', 498]] as [PlanStage, number][]) {
    await assert.rejects(repo.startStage(id, o.revision, type, { companyId: 'wrong', date: input.date, notes: [], colorNotes: [] }));
    o = await repo.startStage(id, o.revision, type, { companyId: type, date: input.date, notes: [], colorNotes: [] });
    if (type !== 'Kesim') await assert.rejects(repo.finishStage(id, o.revision, type, { date: input.date, rows: [{ color: 'Siyah', quantity: 999 }, { color: 'Beyaz', quantity: 300 }] }));
    o = await repo.finishStage(id, o.revision, type, { date: input.date, rows: [{ color: 'Siyah', quantity: amount }, { color: 'Beyaz', quantity: 300 }] });
    if (type === 'Kesim') assert.equal(stageInput(o.product, 'Nakış')[0].quantity, 510);
    if (type === 'Nakış') assert.equal(stageInput(o.product, 'Dikim')[0].quantity, 505);
  }
  assert.equal(completedQuantity(o.product), 798); await assert.rejects(repo.setArchived(id, 0, true));
  await repo.transfer(id, o.revision); o = (await repo.list())[0]; await repo.transfer(id, o.revision); assert.equal(receipts.length, 1); assert.equal(receipts[0].colors[0].quantity, 498);
  const stages = structuredClone(o.product.stages); o = await repo.setArchived(id, o.revision, true); o = await repo.setArchived(id, o.revision, false); assert.deepEqual(o.product.stages, stages);
});
test('v3 çok ürünlü plan ayrı siparişlere dönüşür, kaynak ve kardeş kayıtlar korunur', async () => {
  const { repo, old, input, storage, values } = await fixture();
  const legacyInput = { ...input, items: [1, 2, 3].map((n) => ({ ...input.product, brand: 'PALO', modelName: `Model ${n}` })) };
  const plan = await old.create(legacyInput); const key = 'argent-tekstil.production.v1'; const before = storage.getItem(key)!;
  let orders = await repo.list(); assert.equal(orders.length, 3); assert.equal(storage.getItem(key), before); assert.equal(new Set(orders.map((o) => o.id)).size, 3);
  assert.equal(orders[0].stockSourceId, `unified:${plan.id}:${plan.items[0].id}`);
  await repo.setArchived(orders[0].id, 0, true); orders = await repo.list(); assert.equal(orders.filter((o) => o.archived).length, 1);
  assert.deepEqual(JSON.parse(storage.getItem(key)!).unifiedPlans, JSON.parse(before).unifiedPlans);
  await repo.deletionPin.setup('123456', '123456'); await assert.rejects(repo.trash(orders[1].id, 0, '000000')); await repo.trash(orders[1].id, 0, '123456'); orders = await repo.list(); assert.equal(orders.filter((o) => o.deleted).length, 1);
  const trashed = orders.find((o) => o.deleted)!; await repo.restore(trashed.id, trashed.revision); assert.equal((await repo.list()).length, 3);
  const result = migratedOrders({ unifiedPlans: [{ id: 'bad', planNo: 'bad', items: null }] } as any); assert.ok(result.warnings.length); assert.equal(result.orders.length, 0);
  values.set(key, '{broken'); await assert.rejects(repo.list()); assert.equal(storage.getItem(key), '{broken');
});

test('Taslak eksik alanları korur, sipariş sayılarına girmez ve tek kez dönüşür', async () => {
  const { repo, input, storage, values } = await fixture(); const drafts = createOrderDrafts(() => storage);
  let draft = drafts.save('draft-1', 0, { ...input, name: '', product: { ...input.product, brandId: '' } });
  assert.equal((await repo.list()).length, 0); assert.equal(createOrderDrafts(() => storage).list()[0].input.product.gsm, '');
  await assert.rejects(repo.create(draft.input, draft.id)); assert.equal(drafts.list().length, 1);
  draft = drafts.save(draft.id, draft.revision, input); assert.throws(() => drafts.save(draft.id, 0, input), /başka sekmede/);
  const saved = await repo.create(draft.input, draft.id); assert.equal((await repo.create(draft.input, draft.id)).id, saved.id); assert.equal((await repo.list()).length, 1);
  values.set(DRAFT_KEY, '{broken'); assert.throws(() => drafts.save('new', 0, input), /korunuyor/); assert.equal(storage.getItem(DRAFT_KEY), '{broken');
});

test('Bölüm kaydı atomik, müşteri siparişi stok bekler ve bir kez aktarılır', async () => {
  const { repo, input, receipts, values } = await fixture(); let o = await repo.create(input);
  const stage = (type: PlanStage) => ({ companyId: type, date: input.date, notes: ['Teknik not'], colorNotes: [] });
  const result = (qty: number) => ({ date: input.date, rows: [{ color: 'Siyah', quantity: qty, rollCount: 10, kg: 210, date: input.date }, { color: 'Beyaz', quantity: 295, rollCount: 6, kg: 125, date: input.date }] });
  await assert.rejects(repo.saveStage(o.id, o.revision, 'Kesim', stage('Kesim'), result(510)), /Üretime Başla/);
  o = await repo.startProduction(o.id, o.revision); const before = values.get('argent-tekstil.production.v1');
  await assert.rejects(repo.saveStage(o.id, o.revision, 'Kesim', { ...stage('Kesim'), companyId: '' }, result(510)));
  await assert.rejects(repo.saveStage(o.id, o.revision, 'Kesim', stage('Kesim'), { ...result(510), rows: [{ ...result(510).rows[0], date: '2026-09-01' }, result(510).rows[1]] }));
  assert.equal(values.get('argent-tekstil.production.v1'), before);
  for (const [type, qty] of [['Kesim', 510], ['Nakış', 505], ['Dikim', 500], ['Ütü & Paket', 498]] as [PlanStage, number][]) o = await repo.saveStage(o.id, o.revision, type, stage(type), result(qty));
  assert.equal(stockStatus(o), 'Stoğa Aktarılmayı Bekliyor'); assert.equal(differenceText(500, 510), '+10 adet'); assert.equal(differenceText(510, 505), '5 fire');
  await repo.transfer(o.id, o.revision); o = (await repo.list())[0]; assert.equal(stockStatus(o), 'Stoğa Aktarıldı');
  await repo.transfer(o.id, o.revision); assert.equal(receipts.length, 1); assert.equal(receipts[0].colors.reduce((n: number, r: any) => n + r.quantity, 0), 793);
});

test('Zincir sonuçsuz planlanır; başlatma, düzeltme, onay ve stok tutarlılığı', async () => {
  const { repo, input, values } = await fixture(); let o = await repo.create(input);
  const plans = activeStages(o.product).map((type) => ({ type, companyId: type, plannedStart: '2026-10-01', dueDate: '2026-10-05' }));
  o = await repo.savePlanning(o.id, o.revision, plans); assert.equal(o.product.stages.length, 0); assert.equal(currentCompany(o.product), '');
  assert.equal(liveGroups([o]).length, 0); await assert.rejects(repo.beginPlannedStage(o.id, o.revision, 'Nakış'));
  const rows = (qty: number) => [{ color: 'Siyah', quantity: qty, rollCount: 10, kg: 210 }, { color: 'Beyaz', quantity: 300 }];
  o = await repo.beginPlannedStage(o.id, o.revision, 'Kesim'); assert.equal(currentCompany(o.product), 'Kesim'); assert.equal(o.product.stages[0].result, null);
  o = await repo.recordStageResult(o.id, o.revision, 'Kesim', rows(510), ['Kesim notu']); assert.ok(o.product.stages[0].actualCompletedAt);
  o = await repo.beginPlannedStage(o.id, o.revision, 'Nakış'); assert.equal(currentCompany(o.product), 'Nakış');
  o = await repo.recordStageResult(o.id, o.revision, 'Nakış', rows(500), []);
  await assert.rejects(repo.recordStageResult(o.id, o.revision, 'Nakış', rows(480), []), /onaylayın/);
  o = await repo.recordStageResult(o.id, o.revision, 'Nakış', rows(480), [], true); assert.equal(stageInput(o.product, 'Dikim')[0].quantity, 480);
  o = await repo.beginPlannedStage(o.id, o.revision, 'Dikim'); o = await repo.recordStageResult(o.id, o.revision, 'Dikim', rows(470), []);
  const before = values.get('argent-tekstil.production.v1'); await assert.rejects(repo.recordStageResult(o.id, o.revision, 'Nakış', rows(460), [], true), /Önce Dikim/); assert.equal(values.get('argent-tekstil.production.v1'), before);
  o = await repo.savePlanning(o.id, o.revision, [{ ...plans[2], dueDate: '2026-10-07', plannedStart: '2026-10-02' }]); assert.equal(stagePlan(o, 'Dikim')?.dueDate, '2026-10-07');
  o = await repo.beginPlannedStage(o.id, o.revision, 'Ütü & Paket'); o = await repo.recordStageResult(o.id, o.revision, 'Ütü & Paket', rows(465), []); await repo.transfer(o.id, o.revision); o = (await repo.list())[0];
  await assert.rejects(repo.recordStageResult(o.id, o.revision, 'Kesim', rows(520), [], true), /Stoğa aktarılmış/);
  o = await repo.recordStageResult(o.id, o.revision, 'Kesim', [{ ...rows(510)[0], kg: 215 }, rows(510)[1]], ['Düzeltilen not']); assert.equal(o.product.stages[0].result?.rows[0].kg, 215); assert.ok(o.resultHistory?.length);
});

test('Toplu arşiv işlemleri bir bütün olarak uygulanır, yanlış PIN/eski revizyon yazmaz', async () => {
  const { repo, input, values } = await fixture(); const orders = [];
  for (let i = 0; i < 4; i++) { const o = await repo.create(input); orders.push(await repo.setArchived(o.id, o.revision, true)); }
  await repo.deletionPin.setup('123456', '123456'); const before = values.get('argent-tekstil.production.v1');
  await assert.rejects(repo.bulkArchiveAction(orders.slice(0, 3), 'trash', '000000')); assert.equal(values.get('argent-tekstil.production.v1'), before);
  await assert.rejects(repo.bulkArchiveAction([orders[0], { ...orders[1], revision: 0 }], 'restore')); assert.equal(values.get('argent-tekstil.production.v1'), before);
  await repo.bulkArchiveAction(orders.slice(0, 3), 'restore'); assert.equal((await repo.list()).filter((o) => o.archived).length, 1);
  await repo.bulkArchiveAction([orders[3]], 'trash', '123456'); assert.equal((await repo.list()).filter((o) => o.deleted).length, 1); const deleted = (await repo.list()).find((o) => o.deleted)!; await repo.restore(deleted.id, deleted.revision); assert.ok((await repo.list()).find((o) => o.id === deleted.id)?.archived);
});

test('Canlı üretim: farklı müşteriler tek ürün, bir sipariş tek sütun ve güvenilir miktar', async () => {
  const { repo, input } = await fixture();
  let a = await repo.create(input), b = await repo.create({ ...input, customerId: INTERNAL_CUSTOMER_ID }); const waiting = await repo.create(input);
  const plans = activeStages(a.product).map((type) => ({ type, companyId: type, plannedStart: input.date, dueDate: input.dueDate }));
  a = await repo.savePlanning(a.id, a.revision, plans); b = await repo.savePlanning(b.id, b.revision, plans);
  a = await repo.beginPlannedStage(a.id, a.revision, 'Kesim'); b = await repo.beginPlannedStage(b.id, b.revision, 'Kesim');
  b = await repo.recordStageResult(b.id, b.revision, 'Kesim', [{ color: 'Siyah', quantity: 510 }, { color: 'Beyaz', quantity: 300 }], []); b = await repo.beginPlannedStage(b.id, b.revision, 'Nakış');
  const groups = liveGroups([a, b, waiting, { ...a, id: 'archived', archived: true }, { ...b, id: 'deleted', deleted: true }, { ...a, id: 'stocked', product: { ...a.product, stockTransfer: { stockIds: [], date: input.date } } }]);
  assert.equal(groups.length, 1); assert.equal(groups[0].total, 1610); assert.deepEqual(groups[0].stages, { Kesim: 800, Nakış: 810 }); assert.equal(groups[0].rows.length, 2); assert.equal(Object.values(groups[0].stages).reduce((a, b) => a + b, 0), groups[0].total);
});

test('Özellik düzenleme üretim/stok verisini korur; eski alanlar, revizyon ve arşiv güvenlidir', async () => {
  const { repo, input, values } = await fixture(); let o = await repo.create(input);
  assert.equal(o.product.dropShoulder, undefined);
  const plans = activeStages(o.product).map((type) => ({ type, companyId: type, plannedStart: input.date, dueDate: input.dueDate }));
  o = await repo.savePlanning(o.id, o.revision, plans);
  for (const type of activeStages(o.product)) {
    o = await repo.beginPlannedStage(o.id, o.revision, type);
    o = await repo.recordStageResult(o.id, o.revision, type, [{ color: 'Siyah', quantity: 490 }, { color: 'Beyaz', quantity: 290 }], []);
  }
  await repo.transfer(o.id, o.revision); o = (await repo.list())[0]; const before = structuredClone(o);
  o = await repo.updateFeatures(o.id, o.revision, { dropShoulder: true, sideSlit: false, instructions: ['Yeni talimat', 'Etiket'] });
  assert.deepEqual(o.product.stages, before.product.stages); assert.deepEqual(o.product.stockTransfer, before.product.stockTransfer);
  assert.deepEqual(o.stagePlans, before.stagePlans); assert.deepEqual(o.product.colors, before.product.colors); assert.equal(o.stockSourceId, before.stockSourceId);
  assert.deepEqual((await repo.list())[0].product.instructions, ['Yeni talimat', 'Etiket']);
  const raw = values.get('argent-tekstil.production.v1');
  await assert.rejects(repo.updateFeatures(o.id, before.revision, { dropShoulder: false, sideSlit: true, instructions: [] }), /değişti/);
  await assert.rejects(repo.updateFeatures(o.id, o.revision, { dropShoulder: false, sideSlit: true, instructions: ['x'.repeat(2001)] }));
  assert.equal(values.get('argent-tekstil.production.v1'), raw);
  o = await repo.setArchived(o.id, o.revision, true);
  await assert.rejects(repo.updateFeatures(o.id, o.revision, { dropShoulder: false, sideSlit: true, instructions: [] }), /geri alın/);
});

test('Aktif toplu işlemler atomiktir; aşamalar korunur ve çöp eski arşiv durumuna döner', async () => {
  const { repo, input, values } = await fixture(); const orders = [];
  for (let i = 0; i < 3; i++) {
    let o = await repo.create(input);
    o = await repo.savePlanning(o.id, o.revision, [{ type: 'Kesim', companyId: 'Kesim', plannedStart: input.date, dueDate: input.dueDate }]);
    orders.push(await repo.beginPlannedStage(o.id, o.revision, 'Kesim'));
  }
  const before = values.get('argent-tekstil.production.v1');
  await assert.rejects(repo.bulkArchiveAction([orders[0], { ...orders[1], revision: 0 }], 'archive', '', 'active'));
  assert.equal(values.get('argent-tekstil.production.v1'), before);
  await repo.bulkArchiveAction(orders, 'archive', '', 'active');
  let current = await repo.list(); assert.ok(current.every((o) => o.archived));
  for (const o of current) { const original = orders.find((v) => v.id === o.id)!; assert.deepEqual(o.product, original.product); assert.deepEqual(o.stagePlans, original.stagePlans); }
  await repo.bulkArchiveAction(current, 'restore'); current = await repo.list();
  await repo.deletionPin.setup('123456', '123456'); const priorTrash = values.get('argent-tekstil.production.v1');
  await assert.rejects(repo.bulkArchiveAction(current.slice(0, 2), 'trash', '000000', 'active'));
  assert.equal(values.get('argent-tekstil.production.v1'), priorTrash);
  await repo.bulkArchiveAction(current.slice(0, 2), 'trash', '123456', 'active');
  current = await repo.list(); assert.equal(current.filter((o) => o.deleted).length, 2);
  for (const o of current.filter((v) => v.deleted)) { const restored = await repo.restore(o.id, o.revision); assert.equal(restored.archived, false); assert.deepEqual(restored.product, orders.find((v) => v.id === o.id)!.product); }
});

test('Eski planın özellikleri düzenlenirken ham plan ve diğer alanlar değişmez', async () => {
  const { repo, old, input, values } = await fixture();
  const plan = await old.create({ ...input, items: [{ ...input.product, brand: 'PALO' }] });
  const raw = JSON.parse(values.get('argent-tekstil.production.v1')!);
  let order = (await repo.list()).find((o) => o.source?.planId === plan.id)!;
  assert.deepEqual(order.product.instructions, input.product.instructions);
  order = await repo.updateFeatures(order.id, order.revision, { dropShoulder: false, sideSlit: true, instructions: [...order.product.instructions, 'Yeni madde'] });
  const after = JSON.parse(values.get('argent-tekstil.production.v1')!);
  assert.deepEqual(after.unifiedPlans, raw.unifiedPlans);
  assert.deepEqual(order.product.instructions, ['Etiket', 'Ribana', 'Yeni madde']);
  assert.deepEqual((await repo.list()).find((o) => o.id === order.id)?.product, order.product);
});

test('Uygulama tek aşama: iki güvenli rota, gerçek durum ve rotaya göre güncel adet', async () => {
  for (const position of ['before', 'after'] as const) {
    const { repo, input, values } = await fixture();
    const route = productionRoute(true, position);
    let o = await repo.create({ ...input, product: { ...input.product, applicationPosition: position, enabledStages: route } });
    assert.deepEqual(activeStages(o.product), route); assert.equal(currentQuantity(o.product), undefined);
    const rows = (count: number) => [{ color: 'Siyah', quantity: count }, { color: 'Beyaz', quantity: 290 }];
    for (const [index, type] of route.entries()) {
      assert.equal(stageState(o.product, type), '○ Bekliyor');
      assert.equal(orderProductionStatus(o), `${type === 'Ütü & Paket' ? 'Paket' : type} Bekliyor`);
      o = await repo.beginPlannedStage(o.id, o.revision, type, { type, companyId: type, plannedStart: input.date, dueDate: input.dueDate });
      assert.equal(stageState(o.product, type), '● Devam Ediyor');
      if (index > 0) assert.equal(stageInput(o.product, type)[0].quantity, 510 - (index - 1) * 5);
      o = await repo.recordStageResult(o.id, o.revision, type, rows(510 - index * 5), []);
      assert.equal(stageState(o.product, type), '✓ Tamamlandı'); assert.equal(currentQuantity(o.product), 800 - index * 5);
    }
    assert.equal(orderProductionStatus(o), 'Tamamlandı');
    const raw = values.get('argent-tekstil.production.v1');
    await assert.rejects(repo.create({ ...input, product: { ...input.product, applicationPosition: position, enabledStages: ['Dikim', 'Kesim', 'Ütü & Paket'] } }), /rota/);
    assert.equal(values.get('argent-tekstil.production.v1'), raw);
  }
});

test('Akış düzeltmesi onay ister, geçmişi ve sonraki sonuçları korur; uyumsuz değişiklik atomik reddedilir', async () => {
  const { repo, input, values } = await fixture();
  let o = await repo.create({ ...input, product: { ...input.product, applicationCards: [{ id: 'technical', type: 'Baskı', notes: ['Logo'] }], applicationPosition: 'before', enabledStages: productionRoute(true) } });
  const rows = (count: number) => [{ color: 'Siyah', quantity: count }, { color: 'Beyaz', quantity: 290 }];
  for (const [type, count] of [['Kesim', 510], ['Uygulama', 505], ['Dikim', 500]] as const) {
    o = await repo.beginPlannedStage(o.id, o.revision, type, { type, companyId: type, plannedStart: input.date, dueDate: input.dueDate });
    o = await repo.recordStageResult(o.id, o.revision, type, rows(count), []);
  }
  const raw = values.get('argent-tekstil.production.v1');
  await assert.rejects(repo.saveRoute(o.id, o.revision, false, 'before'), /onaylayın/);
  await assert.rejects(repo.saveRoute(o.id, o.revision, true, 'after', true));
  assert.equal(values.get('argent-tekstil.production.v1'), raw);
  const sewing = structuredClone(o.product.stages.find((s) => s.type === 'Dikim'));
  o = await repo.saveRoute(o.id, o.revision, false, 'before', true);
  assert.deepEqual(activeStages(o.product), productionRoute(false));
  assert.deepEqual(o.product.stages.find((s) => s.type === 'Dikim'), sewing);
  assert.equal(o.routeHistory?.[0].product.stages.find((s) => s.type === 'Uygulama')?.result?.rows[0].quantity, 505);
  assert.equal(currentQuantity(o.product), 790); assert.ok(stageAvailable(o.product, 'Ütü & Paket'));
  o = await repo.saveApplicationCards(o.id, o.revision, [{ id: 'technical', type: 'Baskı', notes: ['Düzeltilen teknik not'] }]);
  assert.deepEqual(activeStages(o.product), productionRoute(false));
  assert.deepEqual(o.product.stages.find((s) => s.type === 'Dikim'), sewing);
});

test('Başlamış sipariş yalnız mevcut PIN ile düzenlenir; kritik değişiklik onay ister ve sonuçları korur', async () => {
  const { repo, input, values } = await fixture();
  let o = await repo.create({ ...input, product: { ...input.product, applicationPosition: 'before', enabledStages: productionRoute(false) } });
  await repo.deletionPin.setup('safe-pin', 'safe-pin');
  o = await repo.beginPlannedStage(o.id, o.revision, 'Kesim', { type: 'Kesim', companyId: 'Kesim', plannedStart: input.date, dueDate: input.dueDate });
  o = await repo.recordStageResult(o.id, o.revision, 'Kesim', [{ color: 'Siyah', quantity: 510 }, { color: 'Beyaz', quantity: 290 }], []);
  const next = { ...input, note: 'Düzeltilen sipariş', product: { ...o.product } };
  const raw = values.get('argent-tekstil.production.v1'), results = structuredClone(o.product.stages);
  await assert.rejects(repo.update(o.id, o.revision, next, 'wrong-pin'), /yanlış/);
  assert.equal(values.get('argent-tekstil.production.v1'), raw);
  o = await repo.update(o.id, o.revision, next, 'safe-pin'); assert.deepEqual(o.product.stages, results);
  const critical = { ...next, product: { ...next.product, colors: [{ color: 'Siyah', quantity: 550 }, { color: 'Beyaz', quantity: 300 }] } };
  await assert.rejects(repo.update(o.id, o.revision, critical, 'safe-pin'), /onaylayın/);
  o = await repo.update(o.id, o.revision, critical, 'safe-pin', true); assert.deepEqual(o.product.stages, results);
  assert.equal(o.product.colors[0].quantity, 550); assert.equal(o.routeHistory?.length, 1);
  const beforeRename = values.get('argent-tekstil.production.v1');
  await assert.rejects(repo.update(o.id, o.revision, { ...critical, product: { ...critical.product, colors: [{ color: 'Lacivert', quantity: 550 }, { color: 'Beyaz', quantity: 300 }] } }, 'safe-pin', true), /renkler/);
  assert.equal(values.get('argent-tekstil.production.v1'), beforeRename);
});
