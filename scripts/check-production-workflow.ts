import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkflowRepository, PRODUCTION_STORAGE_KEY } from '../src/data/production/workflowRepository.ts';
import { createProductionRepository } from '../src/data/production/repository.ts';
import { createProductRepository, PRODUCTS_STORAGE_KEY } from '../src/data/products/localStorageRepository.ts';
import { createProductDefinitionRepository } from '../src/data/productDefinitions/repository.ts';
import { cuttingTotal, normalizeProductions, projectWorkflow, sizeSeries, stageRemainingQuantity, subcontractRows } from '../src/domain/productionWorkflow.ts';
import type { BrandSection, NewProductionInput, ProductionRecord } from '../src/domain/productionWorkflow.ts';
import { emptyContact } from '../src/features/contacts/model.ts';
import { selectAccountEntries } from '../src/domain/accountSelectors.ts';
import { productionReport, emptyFilters } from '../src/domain/reportSelectors.ts';

async function setup() {
  const values = new Map<string, string>(); let failKey = '';
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem(key: string, value: string) { if (key === failKey) throw new Error('Quota'); values.set(key, value); } };
  const pending = new Map<string, Promise<unknown>>();
  const lock = <T>(key: string, work: () => Promise<T>) => { const result = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(work); pending.set(key, result); return result; };
  const person = { ...emptyContact, id: 'workshop', name: 'Ahmet Nakış', createdAt: '', updatedAt: '' };
  const contacts = { async get(id: string) { return id === person.id ? person : id === 'workshop-2' ? { ...person, id, name: 'Mehmet Nakış' } : null; } };
  const definitions = createProductDefinitionRepository(() => storage, lock);
  const definition = await definitions.save({ name: 'Polo Yaka Tişört', note: '', status: 'Aktif' });
  const products = createProductRepository(() => storage, contacts, (work) => lock(PRODUCTS_STORAGE_KEY, work), definitions);
  const deps = { contacts, definitions, products, fabrics: { async load() { return { records: [] }; } } };
  const repository = createWorkflowRepository(() => storage, deps, lock);
  const input: NewProductionInput = { productDefinitionId: definition.id, fabricId: '', fabricName: 'Penye', gsm: '180', sizeSeries: 'Yetişkin', cuttingMode: 'Kumaştan Çıktığı Kadar', targetQuantity: null, cutterCompanyId: person.id, date: '2026-09-21', productInstructions: 'Dikiş payı 1 cm', note: 'Test' };
  const get = async (id: string) => (await repository.list()).find((p) => p.id === id)!;
  return { values, storage, repository, products, contacts, definitions, definition, deps, input, get, person, fail: (key: string) => { failKey = key; } };
}
function sheet(results = true): BrandSection[] {
  return [{ id: 'palo', brandName: 'PALO', rows: [{ id: 'black', color: 'Siyah', rollCount: 4, kg: results ? 91 : null, quantity: results ? 410 : null }, { id: 'white', color: 'Beyaz', rollCount: 3, kg: results ? 68 : null, quantity: results ? 305 : null }] }, { id: 'argent', brandName: 'ARGENT', rows: [{ id: 'navy', color: 'Lacivert', rollCount: 2, kg: results ? 44 : null, quantity: results ? 200 : null }] }];
}
async function cut(f: Awaited<ReturnType<typeof setup>>) {
  const p = await f.repository.create(f.input); await f.repository.saveCutting(p.id, p.revision, sheet(), true); return f.get(p.id);
}
async function sized(f: Awaited<ReturnType<typeof setup>>) {
  const p = await cut(f); await f.repository.saveSizes(p.id, p.revision, [{ rowId: 'black', sizes: { S: 100, M: 310 } }, { rowId: 'white', sizes: { M: 305 } }, { rowId: 'navy', sizes: { XL: 200 } }]); return f.get(p.id);
}
function stage(overrides = {}) { return { processType: 'Nakış' as const, companyId: 'workshop', rowId: 'black', sentQuantity: 300, returnedQuantity: 280, priceType: 'Adet Fiyatı' as const, price: 2, sentDate: '2026-09-21', returnDate: '2026-09-21', status: 'Kısmi Geldi' as const, note: '', ...overrides }; }
const completion = [{ rowId: 'black', size: 'S', good: 98, waste: 2 }, { rowId: 'black', size: 'M', good: 310, waste: 0 }, { rowId: 'white', size: 'M', good: 300, waste: 5 }, { rowId: 'navy', size: 'XL', good: 200, waste: 0 }];

test('Yeni üretim benzersiz numara, ürün bağlantısı ve Kesim Bekliyor durumuyla kalıcı açılır', async () => {
  const f = await setup(); const p = await f.repository.create(f.input); const p2 = await f.repository.create({ ...f.input, cuttingMode: 'Hedef Adet', targetQuantity: 487 });
  assert.equal(p.productionNo, 'UR-00001'); assert.equal(p2.productionNo, 'UR-00002'); assert.equal(p.status, 'Kesim Bekliyor'); assert.equal(p.productName, 'Polo Yaka Tişört');
  assert.equal(p.productDefinitionId, f.definition.id); assert.equal(p.cuttingSheet.brandSections.length, 0);
  assert.deepEqual((await createWorkflowRepository(() => f.storage, f.deps).list())[0], p);
  await assert.rejects(f.repository.create({ ...f.input, cuttingMode: 'Hedef Adet', targetQuantity: 0 }), /Hedef adet/);
  await f.definitions.setStatus(f.definition.id, 'Pasif'); await assert.rejects(f.repository.create(f.input), /Aktif/);
});
test('Çocuk, yetişkin ve battal boy beden serileri sabittir', () => {
  assert.deepEqual(sizeSeries['Çocuk'], ['2 Yaş', '4 Yaş', '6 Yaş', '8 Yaş', '10 Yaş', '12 Yaş', '14 Yaş']);
  assert.deepEqual(sizeSeries['Yetişkin'], ['S', 'M', 'L', 'XL', '2XL', '3XL']);
  assert.deepEqual(sizeSeries['Battal Boy'], ['4XL', '5XL', '6XL']);
});
test('Birden çok marka ve renkli föyde kg/adet boş tutulur; aynı föye sonuç girilir', async () => {
  const f = await setup(); let p = await f.repository.create(f.input);
  await f.repository.saveCutting(p.id, p.revision, sheet(false), false); p = await f.get(p.id);
  assert.equal(p.cuttingSheet.brandSections.length, 2); assert.equal(p.cuttingSheet.brandSections[0].rows.length, 2); assert.equal(p.cuttingSheet.brandSections[0].rows[0].kg, null);
  assert.equal(p.status, 'Kesim Bekliyor');
  await f.repository.saveCutting(p.id, p.revision, sheet(), true); p = await f.get(p.id);
  assert.equal(p.status, 'Kesim Tamamlandı'); assert.equal(cuttingTotal(p), 915);
  assert.equal(p.cuttingSheet.brandSections[0].rows[0].kg, 91);
  await assert.rejects(f.repository.saveCutting(p.id, p.revision, sheet(), true), /değiştirilemez/);
});
test('Kesim föyünde tekrarlı marka/renk, boş sonuç ve kesirli adet engellenir', async () => {
  const f = await setup(); const p = await f.repository.create(f.input);
  await assert.rejects(f.repository.saveCutting(p.id, 0, [], false), /marka/);
  await assert.rejects(f.repository.saveCutting(p.id, 0, sheet(false), true), /Kg/);
  const dup = sheet(); dup[0].rows[1].color = 'SİYAH'; await assert.rejects(f.repository.saveCutting(p.id, 0, dup, true), /tekrarlanamaz/);
  const fraction = sheet(); fraction[0].rows[0].quantity = 1.5; await assert.rejects(f.repository.saveCutting(p.id, 0, fraction, true), /tam sayı/);
  assert.equal((await f.get(p.id)).revision, 0);
});
test('Beden dağılımında renk toplamı ve yalnızca seçilen serinin bedenleri doğrulanır', async () => {
  const f = await setup(); const p = await cut(f);
  const distributions = [{ rowId: 'black', sizes: { M: 410 } }, { rowId: 'white', sizes: { M: 305 } }, { rowId: 'navy', sizes: { M: 200 } }];
  await assert.rejects(f.repository.saveSizes(p.id, p.revision, [{ rowId: 'black', sizes: { M: 400 } }, ...distributions.slice(1)]), /beden toplamı/);
  await assert.rejects(f.repository.saveSizes(p.id, p.revision, [{ rowId: 'black', sizes: { '4XL': 410 } }, ...distributions.slice(1)]), /serisi/);
  await f.repository.saveSizes(p.id, p.revision, distributions); assert.equal((await f.get(p.id)).sizeDistributions.length, 3);
});
test('Aynı işlem atölyelere bölünür; gönderilen-gelen-kalan ve fason görünümü tek kaynaktan gelir', async () => {
  const f = await setup(); let p = await cut(f);
  await f.repository.addStage(p.id, p.revision, stage()); p = await f.get(p.id);
  await f.repository.addStage(p.id, p.revision, stage({ companyId: 'workshop-2', sentQuantity: 110, returnedQuantity: 110, status: 'Tamamlandı' })); p = await f.get(p.id);
  assert.equal(p.productionStages.length, 2); assert.equal(stageRemainingQuantity(p.productionStages[0]), 20);
  const rows = subcontractRows([p]); assert.equal(rows.length, 2); assert.equal(rows.reduce((n, r) => n + r.remaining, 0), 20);
  assert.equal(new Set(rows.map((r) => r.stage.companyId)).size, 2);
});
test('İşlem toplamı ve marka/renk miktarı aşılamaz; kesim sonrası listesinde Kesim yoktur', async () => {
  const f = await setup(); let p = await cut(f);
  await assert.rejects(f.repository.addStage(p.id, p.revision, stage({ sentQuantity: 916, returnedQuantity: 0, status: 'İşlemde' })), /kesim miktarından fazla/);
  await assert.rejects(f.repository.addStage(p.id, p.revision, stage({ sentQuantity: 411, returnedQuantity: 0, status: 'İşlemde' })), /renk/);
  await assert.rejects(f.repository.addStage(p.id, p.revision, stage({ processType: 'Kesim' as 'Nakış' })), /Kesim sonrası/);
  await f.repository.addStage(p.id, p.revision, stage()); p = await f.get(p.id);
  await assert.rejects(f.repository.addStage(p.id, p.revision, stage({ sentQuantity: 111, returnedQuantity: 0, status: 'İşlemde' })), /renk/);
});
test('Fason onayı cariye bir kez yansır; kendi atölyemiz cari oluşturmaz', async () => {
  const f = await setup(); let p = await cut(f);
  const s = await f.repository.addStage(p.id, p.revision, stage()); p = await f.get(p.id);
  const snapshot = async () => ({ contacts: [f.person], products: await f.products.load(), production: projectWorkflow(JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!)), errors: [] });
  assert.equal(selectAccountEntries(await snapshot()).length, 0);
  await f.repository.receiveStage(p.id, p.revision, s.id, 300, p.date, 'Tamamlandı'); p = await f.get(p.id);
  assert.equal(selectAccountEntries(await snapshot()).length, 1); assert.equal(selectAccountEntries(await snapshot())[0].deltaMinor, -60000);
  await assert.rejects(f.repository.receiveStage(p.id, p.revision, s.id, 300, p.date, 'Tamamlandı'), /Onaylanmış/);
  await f.repository.addStage(p.id, p.revision, stage({ companyId: '', processType: 'Dikim', sentQuantity: 100, returnedQuantity: 100, status: 'Tamamlandı' }));
  assert.equal(selectAccountEntries(await snapshot()).length, 1);
});
test('Tamamlama beden toplamını ve açık aşamaları kontrol eder; stok ayrı işlemle oluşturulur', async () => {
  const f = await setup(); let p = await sized(f);
  await assert.rejects(f.repository.complete(p.id, p.revision, completion.slice(1), p.date, ''), /Her marka/);
  const s = await f.repository.addStage(p.id, p.revision, stage()); p = await f.get(p.id);
  await assert.rejects(f.repository.complete(p.id, p.revision, completion, p.date, ''), /bütün üretim/);
  await f.repository.receiveStage(p.id, p.revision, s.id, 300, p.date, 'Tamamlandı'); p = await f.get(p.id);
  await f.repository.complete(p.id, p.revision, completion, p.date, 'Bitti'); p = await f.get(p.id);
  assert.equal(p.status, 'Stoğa Aktarım Bekliyor'); assert.equal(p.completion?.good, 908); assert.equal(p.completion?.waste, 7);
  assert.equal((await f.products.load()).records.length, 0);
  await assert.rejects(f.repository.addStage(p.id, p.revision, stage()), /Tamamlanan/);
});
test('Sağlam ürünler marka/renk/beden ve üretim no bağlantısıyla bir kez stoğa aktarılır', async () => {
  const f = await setup(); let p = await sized(f); await f.repository.complete(p.id, p.revision, completion, p.date, '');
  const first = await f.repository.transfer(p.id); const second = await f.repository.transfer(p.id); assert.deepEqual(second, first);
  p = await f.get(p.id); const stock = await f.products.load();
  assert.equal(p.status, 'Tamamlandı'); assert.equal(stock.records.length, 4); assert.equal(stock.records.reduce((n, r) => n + r.quantity, 0), 908);
  assert.equal(stock.productionReceipts?.length, 1); assert.equal(new Set(stock.records.map((r) => r.batch)).size, 1);
  assert.deepEqual(stock.records.map((r) => [r.brand, r.color, r.size, r.quantity]), [['PALO', 'Siyah', 'S', 98], ['PALO', 'Siyah', 'M', 310], ['PALO', 'Beyaz', 'M', 300], ['ARGENT', 'Lacivert', 'XL', 200]]);
  for (const r of stock.records) { assert.equal(r.productDefinitionId, f.definition.id); assert.equal(r.productionNo, p.productionNo); assert.equal(r.entryType, 'Üretimden Gelen'); }
  const production = projectWorkflow(JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!));
  assert.ok(productionReport({ contacts: [], products: stock, production, errors: [] }, emptyFilters)[0].rows.length);
});
test('Stok yazımı sonrası üretim yazımı hata verirse tekrar aktarım stok çoğaltmaz', async () => {
  const f = await setup(); const p = await sized(f); await f.repository.complete(p.id, p.revision, completion, p.date, '');
  f.fail(PRODUCTION_STORAGE_KEY); await assert.rejects(f.repository.transfer(p.id), /kaydedilemedi/);
  assert.equal((await f.get(p.id)).status, 'Tamamlandı'); assert.equal((await f.products.load()).records.length, 4);
  f.fail(''); await f.repository.transfer(p.id); assert.equal((await f.products.load()).records.length, 4);
});
test('Eski üretim localStorage belgesi okumada değişmez; eski cari kimliği ve bilinmeyen alanlar korunur', async () => {
  const f = await setup(); const old = createProductionRepository(() => f.storage, f.contacts);
  const plan = await old.createPlan({ name: 'Eski Model', brand: 'Eski Marka', total: 10, colors: [{ color: 'Siyah', quantity: 10 }], startDate: f.input.date, deliveryDate: '', status: 'Planlandı', note: 'Eski not' });
  const job = await old.startPlan(plan.id, f.input.date);
  const stage = await old.addStage({ jobId: job.id, companyId: 'workshop', date: f.input.date, status: 'Tamamlandı', note: 'Eski fason', lines: [{ operation: 'Nakış', quantity: 10, returned: 10, priceType: 'Adet Fiyatı', price: 3 }] });
  const raw = JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!); raw.futureField = { retained: true }; f.values.set(PRODUCTION_STORAGE_KEY, JSON.stringify(raw));
  const before = f.values.get(PRODUCTION_STORAGE_KEY); let p = (await f.repository.list())[0];
  assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), before); assert.equal(p.productionNo, job.number); assert.equal(p.productionStages[0].id, stage.id); assert.equal(p.cuttingSheet.brandSections[0].rows[0].kg, null);
  await f.repository.complete(p.id, p.revision, [{ rowId: plan.colors[0].id, size: '', good: 9, waste: 1 }], f.input.date, ''); p = await f.get(p.id);
  const after = JSON.parse(f.values.get(PRODUCTION_STORAGE_KEY)!); assert.deepEqual(after.plans, raw.plans); assert.deepEqual(after.stages, raw.stages); assert.deepEqual(after.futureField, { retained: true });
  const projected = await old.load(); assert.equal(projected.stages.length, 1); assert.equal(projected.stages[0].id, stage.id);
  const entries = selectAccountEntries({ contacts: [f.person], production: projected, errors: [] }); assert.equal(entries.length, 1); assert.equal(entries[0].id, `stage:${stage.id}`);
  await f.repository.transfer(p.id); assert.equal((await f.products.load()).productionReceipts?.[0].jobId, job.id);
});
test('Bozuk depolama silinmez; eski boş belge güvenli açılır', async () => {
  const f = await setup(); assert.deepEqual(await f.repository.list(), []);
  f.values.set(PRODUCTION_STORAGE_KEY, '{broken'); await assert.rejects(f.repository.list(), /korunuyor/); await assert.rejects(f.repository.create(f.input), /korunuyor/);
  assert.equal(f.values.get(PRODUCTION_STORAGE_KEY), '{broken');
  assert.deepEqual(normalizeProductions({ version: 1, plans: [], jobs: [], stages: [], nextPlan: 1, nextJob: 1, nextStage: 1 }), []);
});
test('Eşzamanlı / eski ekran yazımı veri kaybetmez, limitler aşılmaz', async () => {
  const f = await setup(); const p = await cut(f);
  const results = await Promise.allSettled([f.repository.addStage(p.id, p.revision, stage()), f.repository.addStage(p.id, p.revision, stage())]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1); assert.equal((await f.get(p.id)).productionStages.length, 1);
});
