import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductionRepository } from '../src/data/production/repository.ts';
import { emptyContact } from '../src/features/contacts/model.ts';
import { operationTotals } from '../src/domain/production.ts';
import { createProductRepository } from '../src/data/products/localStorageRepository.ts';
import { createCompletionService } from '../src/data/production/completion.ts';
test('500 üretimde 493 sağlam/7 fire tek kez stoğa aktarılır', async () => {
  const { repository, data } = setup(); const products = createProductRepository(() => ({ getItem: (k) => data.get(k) ?? null, setItem(k, v) { data.set(k, v); } }), { async get() { return null; } }); const complete = createCompletionService(repository, products);
  const p = await repository.createPlan(planInput); const job = await repository.startPlan(p.id, p.startDate);
  const colors = p.colors.map((c, i) => ({ colorId: c.id, good: c.quantity - (i === 0 ? 7 : 0) }));
  await assert.rejects(complete(job.id, colors, 6, p.startDate, 'Fire'));
  await complete(job.id, colors, 7, p.startDate, 'Fire'); await complete(job.id, colors, 7, p.startDate, 'Fire');
  const stock = await products.load(); assert.equal(stock.records.reduce((s, r) => s + r.quantity, 0), 493); assert.equal(stock.productionReceipts?.length, 1); assert.equal(stock.movements.length, 2); assert.ok(stock.records.every((r) => r.entryType === 'Üretimden Gelen'));
});
test('Fason dönüşü tamamlanmadan onaylanmaz; onay tek kaynak üzerinde kilitlenir', async () => {
  const { repository } = setup(); const p = await repository.createPlan(planInput); const j = await repository.startPlan(p.id, p.startDate);
  const stage = await repository.addStage({ jobId: j.id, companyId: 'c1', date: p.startDate, status: 'İşlemde', note: '', lines: [{ operation: 'Dikim', quantity: 500, returned: 0, priceType: 'Toplam Fiyat', price: 5000 }] });
  await assert.rejects(repository.receiveStage(stage.id, [400], 'Tamamlandı', p.startDate));
  await repository.receiveStage(stage.id, [400], 'Kısmi Geldi', p.startDate);
  await repository.receiveStage(stage.id, [500], 'Tamamlandı', p.startDate);
  await assert.rejects(repository.receiveStage(stage.id, [500], 'Tamamlandı', p.startDate), /Onaylanmış/);
  assert.equal((await repository.load()).stages.length, 1);
});
test('500 adetlik işte nakış 400+100 ile sınırlanır, kesim ayrı 500 olabilir', async () => {
  const { repository } = setup(); const p = await repository.createPlan(planInput); const j = await repository.startPlan(p.id, p.startDate);
  const base = { jobId: j.id, companyId: 'c1', date: p.startDate, status: 'İşlemde' as const, note: '' };
  const line = { operation: 'Nakış' as const, quantity: 400, returned: 0, priceType: 'Adet Fiyatı' as const, price: 2 };
  await repository.addStage({ ...base, lines: [line] });
  await assert.rejects(repository.addStage({ ...base, lines: [{ ...line, quantity: 101 }] }), /en fazla 100/);
  await repository.addStage({ ...base, lines: [{ ...line, quantity: 100 }, { ...line, operation: 'Kesim', quantity: 500 }] });
  const totals = operationTotals(await repository.load(), j.id); assert.equal(totals.find((t) => t.operation === 'Nakış')?.remaining, 0); assert.equal(totals.find((t) => t.operation === 'Dikim')?.remaining, 500);
});
export function setup() { const data = new Map<string, string>(); const repository = createProductionRepository(() => ({ getItem: (key) => data.get(key) ?? null, setItem(key, value) { data.set(key, value); } }), { async get(id) { return { ...emptyContact, id, name: 'Atölye', createdAt: '', updatedAt: '' }; } }); return { repository, data }; }
export const planInput = { name: 'Polo', brand: 'Argent', total: 500, colors: [{ color: 'Siyah', quantity: 300 }, { color: 'Beyaz', quantity: 200 }], startDate: '2026-09-20', deliveryDate: '', note: '', status: 'Planlandı' as const };
test('Plan rengi toplamı doğrulanır, aynı plan bir kez başlatılır', async () => { const { repository } = setup(); await assert.rejects(repository.createPlan({ ...planInput, total: 501 })); const plan = await repository.createPlan(planInput); assert.equal(plan.number, 'PL-0001'); const job = await repository.startPlan(plan.id, plan.startDate); assert.deepEqual(await repository.startPlan(plan.id, plan.startDate), job); assert.equal((await repository.load()).jobs.length, 1); });
