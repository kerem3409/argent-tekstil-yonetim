import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalStorageContactRepository } from '../src/data/contacts/localStorageRepository.ts';
import { createProductRepository } from '../src/data/products/localStorageRepository.ts';
import { createInventoryRepositories } from '../src/data/inventory/repository.ts';
import { createProductionRepository } from '../src/data/production/repository.ts';
import { createCompletionService } from '../src/data/production/completion.ts';
import { createFinanceRepository } from '../src/data/finance/repository.ts';
import { emptyContact } from '../src/features/contacts/model.ts';
import { newStockInput } from '../src/features/products/model.ts';
import { selectAccountEntries } from '../src/domain/accountSelectors.ts';
import { accountBalances, outstandingEntries } from '../src/domain/finance.ts';
import { dashboardSummary, emptyFilters, stockReport } from '../src/domain/reportSelectors.ts';
import { OPEN_ACCOUNT_ID } from '../src/domain/sales.ts';
import type { StoreLock } from '../src/data/shared/store';
import type { WorkshopSnapshot } from '../src/data/reports/snapshot';

function fixture() {
  const values = new Map<string, string>(); let failKey = '';
  const storage = () => ({ getItem: (key: string) => values.get(key) ?? null, setItem(key: string, value: string) { if (key === failKey) throw new Error('QuotaExceededError'); values.set(key, value); } });
  const queues = new Map<string, Promise<unknown>>();
  const lock: StoreLock = (key, work) => { const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(work); queues.set(key, next); return next; };
  const contacts = createLocalStorageContactRepository(storage);
  const products = createProductRepository(storage, contacts, (work) => lock('products', work));
  const inventory = createInventoryRepositories(storage, contacts, lock);
  const production = createProductionRepository(storage, contacts, lock, async (id) => !!(await products.load()).productionReceipts?.some((r) => r.jobId === id));
  const complete = createCompletionService(production, products, lock);
  const finance = createFinanceRepository(storage, contacts, async (id) => !!(await products.load()).openResponsibles?.some((p) => p.id === id), lock);
  async function snapshot(): Promise<WorkshopSnapshot> { return { contacts: await contacts.list(), products: await products.load(), fabrics: await inventory.fabrics.load(), materials: await inventory.materials.load(), machines: await inventory.machines.load(), production: await production.load(), finance: await finance.load(), errors: [] }; }
  return { values, contacts, products, inventory, production, complete, finance, snapshot, fail: (key: string) => { failKey = key; } };
}
const date = '2026-09-21';
test('Uçtan uca: dört alım → üretim/fason → 493 stok → satış → ödeme/tahsilat → rapor', async () => {
  const f = fixture(); const supplier = await f.contacts.create({ ...emptyContact, name: 'Tedarikçi', roles: ['Hazır Giyim Tedarikçisi', 'Kumaş Tedarikçisi', 'Malzeme Tedarikçisi', 'Fasoncu'] });
  const customer = await f.contacts.create({ ...emptyContact, name: 'Müşteri', roles: ['Hazır Giyim Müşterisi'] });
  const stock = await f.products.create({ ...newStockInput(), name: 'Hazır Polo', color: 'Kırmızı', packSize: 5, packCount: 20, unitCost: 50, supplierId: supplier.id, postAccount: true, date });
  await f.inventory.fabrics.create({ name: 'Penye', grammage: '180', content: 'Pamuk', width: '180', lot: 'L-1', companyId: supplier.id, date, price: 100, account: 'Borç oluştur', note: '', colors: [{ color: 'Siyah', rolls: 4, kg: 96 }, { color: 'Beyaz', rolls: 3, kg: 71 }] });
  await f.inventory.materials.create({ name: 'Etiket', category: 'Etiket', feature: '', quantity: 100, unit: 'Adet', price: 0.29, companyId: supplier.id, date, account: 'Borç oluştur', note: '' });
  await f.inventory.machines.create({ name: 'Dikiş', type: 'Makine', model: '', quantity: 1, price: 40000, companyId: supplier.id, date, account: 'Borç oluştur', status: 'Aktif', note: '' });
  const plan = await f.production.createPlan({ name: 'Üretim Polo', brand: 'Argent', total: 500, colors: [{ color: 'Siyah', quantity: 300 }, { color: 'Beyaz', quantity: 200 }], startDate: date, deliveryDate: '', note: '', status: 'Planlandı' }); const job = await f.production.startPlan(plan.id, date);
  const stage = await f.production.addStage({ jobId: job.id, companyId: supplier.id, date, status: 'İşlemde', note: '', lines: [{ operation: 'Nakış', quantity: 500, returned: 0, priceType: 'Adet Fiyatı', price: 2 }] });
  const colors = plan.colors.map((c, i) => ({ colorId: c.id, good: c.quantity - (i === 0 ? 7 : 0) }));
  await assert.rejects(f.complete(job.id, colors, 7, date, ''), /aşamalarını tamamlayıp/);
  await f.production.receiveStage(stage.id, [500], 'Tamamlandı', date);
  await f.complete(job.id, colors, 7, date, '7 fire'); await f.complete(job.id, colors, 7, date, '7 fire');
  await assert.rejects(f.production.addStage({ jobId: job.id, companyId: '', date, status: 'İşlemde', note: '', lines: [{ operation: 'Dikim', quantity: 500, returned: 0, priceType: 'Adet Fiyatı', price: 0 }] }), /Tamamlanan/);
  await f.products.sell({ stockId: stock.id, companyId: customer.id, responsibleId: '', responsibleName: '', quantity: 50, quantityType: 'Adet', price: 75, date, note: '' });
  await f.finance.payment({ companyId: supplier.id, responsibleId: '', direction: 'paid', amount: 60000, date, method: 'Banka', description: 'Ödeme' });
  await f.finance.payment({ companyId: customer.id, responsibleId: '', direction: 'received', amount: 1000, date, method: 'Nakit', description: 'Tahsilat' });
  await f.finance.expense({ companyId: '', date, category: 'Kira', amount: 15000, method: 'Banka', description: 'Atölye kirası', note: '' });
  const data = await f.snapshot(); const entries = selectAccountEntries(data); const balances = accountBalances(entries);
  assert.equal(balances.find((b) => b.companyId === supplier.id)?.balance, -272900);
  assert.equal(balances.find((b) => b.companyId === customer.id)?.balance, 275000);
  const home = dashboardSummary(data); assert.deepEqual(home, { stock: 543, jobs: 0, subcontractJobs: 0, receivable: 275000, debt: 272900 });
  assert.equal(data.contacts.length, 2); assert.equal(data.products?.productionReceipts?.length, 1);
  assert.equal(entries.filter((e) => e.source === 'Fason İş Emri').length, 1);
  assert.equal(data.finance?.moneyMovements.length, 2); assert.equal(data.finance?.expenses.length, 1);
  const before = JSON.stringify(data); stockReport(data, emptyFilters); outstandingEntries(entries); assert.equal(JSON.stringify(data), before);
});

test('Açığa satış sorumlu bakiyesi, tahsilat ve diğer cari düzeltme tek hesapta birleşir', async () => {
  const f = fixture(); const stock = await f.products.create({ ...newStockInput(), name: 'Polo', color: 'Beyaz', packCount: 100, date });
  const sale = await f.products.sell({ stockId: stock.id, companyId: OPEN_ACCOUNT_ID, responsibleId: '', responsibleName: 'Ahmet', quantity: 10, quantityType: 'Adet', price: 100, date, note: '' });
  await f.finance.payment({ companyId: OPEN_ACCOUNT_ID, responsibleId: sale.responsibleId, direction: 'received', amount: 200, date, method: 'Nakit', description: 'Ahmet tahsilat' });
  await f.finance.adjustment({ companyId: OPEN_ACCOUNT_ID, responsibleId: sale.responsibleId, type: 'Mahsup', direction: 'Borç', amount: 50, date, description: 'Mahsup' });
  assert.equal(accountBalances(selectAccountEntries(await f.snapshot()))[0].balance, 75000);
  assert.equal((await f.contacts.list()).length, 0);
});

test('Başarısız satış ve üretim aktarımı hiçbir kısmi kayıt bırakmaz; tekrar güvenlidir', async () => {
  const f = fixture(); const stock = await f.products.create({ ...newStockInput(), name: 'Polo', color: 'Beyaz', packCount: 10, date });
  const before = f.values.get('argent-tekstil.products.v1'); f.fail('argent-tekstil.products.v1');
  await assert.rejects(f.products.sell({ stockId: stock.id, companyId: OPEN_ACCOUNT_ID, responsibleId: '', responsibleName: 'Ahmet', quantity: 1, quantityType: 'Adet', price: 10, date, note: '' }), /kaydedilemedi/);
  assert.equal(f.values.get('argent-tekstil.products.v1'), before);
  const plan = await f.production.createPlan({ name: 'İş', brand: '', total: 10, colors: [{ color: 'Beyaz', quantity: 10 }], startDate: date, deliveryDate: '', note: '', status: 'Planlandı' }); const job = await f.production.startPlan(plan.id, date);
  await assert.rejects(f.complete(job.id, [{ colorId: plan.colors[0].id, good: 9 }], 1, date, ''), /kaydedilemedi/);
  assert.equal(f.values.get('argent-tekstil.products.v1'), before); f.fail('');
  await f.complete(job.id, [{ colorId: plan.colors[0].id, good: 9 }], 1, date, ''); assert.equal((await f.products.load()).productionReceipts?.length, 1);
});

test('Eşzamanlı fason kayıtları aynı işlem limitini aşamaz; bozuk kumaş diğer depoları bozmaz', async () => {
  const f = fixture(); const p = await f.production.createPlan({ name: 'İş', brand: '', total: 500, colors: [{ color: 'Beyaz', quantity: 500 }], startDate: date, deliveryDate: '', note: '', status: 'Planlandı' }); const j = await f.production.startPlan(p.id, date);
  const input = { jobId: j.id, companyId: '', date, status: 'İşlemde' as const, note: '', lines: [{ operation: 'Nakış' as const, quantity: 400, returned: 0, priceType: 'Adet Fiyatı' as const, price: 0 }] };
  const results = await Promise.allSettled([f.production.addStage(input), f.production.addStage(input)]); assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1); assert.equal((await f.production.load()).stages.length, 1);
  f.values.set('argent-tekstil.fabrics.v1', '{bozuk'); await assert.rejects(f.inventory.fabrics.load()); assert.equal((await f.inventory.materials.load()).records.length, 0); assert.equal((await f.production.load()).jobs.length, 1); assert.equal((await f.contacts.list()).length, 0);
});
