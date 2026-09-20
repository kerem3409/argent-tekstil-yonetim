import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFinanceRepository } from '../src/data/finance/repository.ts';
import { createInventoryRepositories } from '../src/data/inventory/repository.ts';
import { createProductRepository } from '../src/data/products/localStorageRepository.ts';
import { createProductionRepository } from '../src/data/production/repository.ts';
import { selectAccountEntries } from '../src/domain/accountSelectors.ts';
import { accountBalances, outstandingEntries } from '../src/domain/finance.ts';
import { emptyContact } from '../src/features/contacts/model.ts';
import { newStockInput } from '../src/features/products/model.ts';
import type { Contact } from '../src/features/contacts/model';
import type { WorkshopSnapshot } from '../src/data/reports/snapshot';

test('Alım, fason, satış, ödeme ve tahsilat tek kaynaklardan cariye yansır; gider ayrıdır', async () => {
  const values = new Map<string, string>(); const storage = () => ({ getItem: (k: string) => values.get(k) ?? null, setItem(k: string, v: string) { values.set(k, v); } });
  const company: Contact = { ...emptyContact, id: 'c1', name: 'Firma', roles: ['Hazır Giyim Müşterisi', 'Fasoncu'], createdAt: '', updatedAt: '' }; const contacts = { async get() { return company; } };
  const finance = createFinanceRepository(storage, contacts); const products = createProductRepository(storage, contacts); const inventory = createInventoryRepositories(storage, contacts); const production = createProductionRepository(storage, contacts);
  const stock = await products.create({ ...newStockInput(), name: 'Polo', color: 'Beyaz', packSize: 1, packCount: 100, unitCost: 50, supplierId: 'c1', postAccount: true, date: '2026-09-20' });
  await products.sell({ stockId: stock.id, companyId: 'c1', responsibleId: '', responsibleName: '', quantity: 50, quantityType: 'Adet', price: 75, date: '2026-09-20', note: '' });
  await finance.payment({ companyId: 'c1', responsibleId: '', direction: 'paid', amount: 500, date: '2026-09-21', method: 'Nakit', description: 'Ödeme' });
  await finance.payment({ companyId: 'c1', responsibleId: '', direction: 'received', amount: 100, date: '2026-09-21', method: 'Banka', description: 'Tahsilat' });
  await finance.expense({ companyId: 'c1', date: '2026-09-21', category: 'Kira', amount: 10000, method: 'Banka', description: 'Kira', note: '' });
  const plan = await production.createPlan({ name: 'Üretim', brand: '', total: 10, colors: [{ color: 'Siyah', quantity: 10 }], startDate: '2026-09-20', deliveryDate: '', note: '', status: 'Planlandı' }); const job = await production.startPlan(plan.id, plan.startDate);
  await production.addStage({ jobId: job.id, companyId: 'c1', date: plan.startDate, status: 'Tamamlandı', note: '', lines: [{ operation: 'Nakış', quantity: 10, returned: 10, priceType: 'Adet Fiyatı', price: 10 }] });
  await production.addStage({ jobId: job.id, companyId: '', date: plan.startDate, status: 'Tamamlandı', note: '', lines: [{ operation: 'Kesim', quantity: 10, returned: 10, priceType: 'Adet Fiyatı', price: 10 }] });
  const snapshot: WorkshopSnapshot = { contacts: [company], products: await products.load(), production: await production.load(), finance: await finance.load(), fabrics: await inventory.fabrics.load(), materials: await inventory.materials.load(), machines: await inventory.machines.load(), errors: [] };
  const entries = selectAccountEntries(snapshot); assert.equal(entries.length, 5); assert.equal(entries.filter((e) => e.source === 'Fason İş Emri').length, 1);
  assert.equal(accountBalances(entries)[0].balance, -95000); // -5000 +3750 +500 -100 -100
  assert.equal(outstandingEntries(entries).reduce((s, e) => s + e.remaining, 0), -95000);
  assert.deepEqual(selectAccountEntries(snapshot), entries); assert.equal(snapshot.finance?.moneyMovements.length, 2); assert.equal(snapshot.finance?.expenses.length, 1);
  await finance.loan({ companyId: 'c1', type: 'Verilen Borç', amount: 1000, date: '2026-09-22', description: 'Borç', source: 'Elden' }); snapshot.finance = await finance.load(); assert.equal(accountBalances(selectAccountEntries(snapshot))[0].balance, 5000);
});
