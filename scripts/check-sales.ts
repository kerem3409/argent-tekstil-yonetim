import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductRepository } from '../src/data/products/localStorageRepository.ts';
import { newStockInput } from '../src/features/products/model.ts';
import { emptyContact } from '../src/features/contacts/model.ts';
import { OPEN_ACCOUNT_ID } from '../src/domain/sales.ts';
test('Satış stoktan düşer, maliyet partiden gelir, fazla satış reddedilir', async () => {
  const values = new Map<string, string>(); const repo = createProductRepository(() => ({ getItem: (k) => values.get(k) ?? null, setItem(k, v) { values.set(k, v); } }), { async get(id) { return { ...emptyContact, id, name: 'Müşteri', roles: ['Hazır Giyim Müşterisi'], createdAt: '', updatedAt: '' }; } });
  const r = await repo.create({ ...newStockInput(), name: 'Polo', color: 'Kırmızı', packSize: 5, packCount: 20, unitCost: 50, date: '2026-09-20' });
  const input = { stockId: r.id, companyId: 'c1', responsibleId: '', responsibleName: '', quantity: 50, quantityType: 'Adet' as const, price: 75, date: '2026-09-20', note: '' };
  const s = await repo.sell(input); assert.equal(s.quantity * s.unitPriceMinor, 375000); assert.equal(s.unitCostMinor, 5000); assert.equal((await repo.load()).records[0].quantity, 50);
  await assert.rejects(repo.sell({ ...input, quantity: 51 }), /Stok yetersiz/);
  await repo.sell({ ...input, companyId: OPEN_ACCOUNT_ID, responsibleName: 'Ahmet', quantity: 2, quantityType: 'Paket' });
  await repo.sell({ ...input, companyId: OPEN_ACCOUNT_ID, responsibleName: 'ahmet', quantity: 1 });
  const data = await repo.load(); assert.equal(data.records[0].quantity, 39); assert.equal(data.openResponsibles?.length, 1); assert.equal(data.sales?.length, 3); assert.equal(data.movements.at(-1)?.type, 'Satış');
  await assert.rejects(repo.sell({ ...input, quantity: 1, companyId: OPEN_ACCOUNT_ID, responsibleName: '' }), /Sorumlu/);
});
