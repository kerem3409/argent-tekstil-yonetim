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
