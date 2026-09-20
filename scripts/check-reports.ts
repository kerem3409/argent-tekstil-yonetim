import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardSummary, emptyFilters, financeReport, salesReport, stockReport } from '../src/domain/reportSelectors.ts';
import type { WorkshopSnapshot } from '../src/data/reports/snapshot';
test('Finans raporu açılış bakiyesini korur, tarih aralığı yalnızca dönem hareketlerini süzer', () => {
  const data: WorkshopSnapshot = { contacts: [], errors: [], finance: { version: 1, manualDebts: [{ id: 'd', companyId: 'c', type: 'Alınan Borç', amountMinor: 10000, date: '2026-08-01', description: 'Borç', source: 'Elden' }], moneyMovements: [{ id: 'p', companyId: 'c', responsibleId: '', direction: 'paid', amountMinor: 3000, date: '2026-09-01', method: 'Nakit', description: 'Ödeme' }], expenses: [] } };
  const before = JSON.stringify(data); const report = financeReport(data, { ...emptyFilters, companyId: 'c', from: '2026-09-01', to: '2026-09-30' }, true);
  assert.match(report[0].title, /70/); assert.match(report[1].title, /100/); assert.equal(report[1].rows.length, 1); assert.equal(JSON.stringify(data), before);
  assert.equal(salesReport(data, emptyFilters)[0].rows.length, 0); assert.equal(stockReport(data, emptyFilters)[0].rows.length, 0);
  const summary = dashboardSummary(data); assert.equal(summary.debt, 7000); assert.equal(summary.receivable, 0); assert.equal(summary.stock, 0);
});
