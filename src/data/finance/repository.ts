import { createStore } from '../shared/store.ts';
import type { StoragePort, StoreLock } from '../shared/store';
import type { ContactRepository } from '../contacts/repository';
import type { AccountAdjustment, Expense, FinanceStore, ManualDebt, MoneyMovement } from '../../domain/finance';
import { expenseCategories } from '../../domain/finance.ts';
import { checkDate, minor, paymentMethods, requireText, uid } from '../../domain/common.ts';
import { OPEN_ACCOUNT_ID } from '../../domain/sales.ts';
export function createFinanceRepository(storage: () => StoragePort, contacts: Pick<ContactRepository, 'get'>, responsibleExists: (id: string) => Promise<boolean> = async () => false, lock?: StoreLock) {
  const store = createStore<FinanceStore>('argent-tekstil.finance.v1', () => ({ version: 1, moneyMovements: [], manualDebts: [], expenses: [] }), (value) => {
    const data = value as FinanceStore;
    if (!data || data.version !== 1 || !Array.isArray(data.moneyMovements) || !Array.isArray(data.manualDebts) || !Array.isArray(data.expenses) || (data.adjustments !== undefined && !Array.isArray(data.adjustments))) throw new Error();
    const all = [...data.moneyMovements, ...data.manualDebts, ...data.expenses, ...(data.adjustments ?? [])];
    if (new Set(all.map((item) => item.id)).size !== all.length) throw new Error();
    for (const item of all) { if (!item.id || typeof item.companyId !== 'string' || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0) throw new Error(); checkDate(item.date); requireText(item.description, 'Açıklama'); }
    for (const item of data.moneyMovements) if (!['paid', 'received'].includes(item.direction) || !paymentMethods.includes(item.method) || !item.companyId || typeof item.responsibleId !== 'string') throw new Error();
    for (const item of data.manualDebts) if (!['Alınan Borç', 'Verilen Borç'].includes(item.type) || !item.companyId || !item.source) throw new Error();
    for (const item of data.expenses) if (!expenseCategories.includes(item.category) || !paymentMethods.includes(item.method)) throw new Error();
    for (const item of data.adjustments ?? []) if (!['Mahsup', 'Diğer'].includes(item.type) || !['Borç', 'Alacak'].includes(item.direction) || !item.companyId || typeof item.responsibleId !== 'string') throw new Error();
  }, storage, lock);
  async function company(id: string, responsibleId = '', optional = false) {
    if (!id && optional) return;
    if (id === OPEN_ACCOUNT_ID) { if (!responsibleId || !await responsibleExists(responsibleId)) throw new Error('Açığa satış sorumlusu seçin.'); return; }
    if (!id || !(await contacts.get(id))) throw new Error('Kayıtlı firma / kişi seçin.');
  }
  return {
    load: store.load,
    async adjustment(input: Omit<AccountAdjustment, 'id' | 'amountMinor'> & { amount: number }) {
      await company(input.companyId, input.responsibleId); checkDate(input.date); requireText(input.description, 'Açıklama');
      if (!['Mahsup', 'Diğer'].includes(input.type) || !['Borç', 'Alacak'].includes(input.direction)) throw new Error('Cari hareket türü ve etkisi seçin.');
      const amountMinor = minor(input.amount, false);
      return store.transact((data) => { const item: AccountAdjustment = { id: uid(), companyId: input.companyId, responsibleId: input.companyId === OPEN_ACCOUNT_ID ? input.responsibleId : '', type: input.type, direction: input.direction, amountMinor, date: input.date, description: input.description }; (data.adjustments ??= []).push(item); return item; });
    },
    async payment(input: Omit<MoneyMovement, 'id' | 'amountMinor'> & { amount: number }) {
      await company(input.companyId, input.responsibleId); checkDate(input.date); requireText(input.description, 'Açıklama'); if (!paymentMethods.includes(input.method) || !['paid', 'received'].includes(input.direction)) throw new Error('Ödeme yönü ve şekli seçin.'); const amountMinor = minor(input.amount, false);
      return store.transact((data) => { const item: MoneyMovement = { id: uid(), companyId: input.companyId, responsibleId: input.companyId === OPEN_ACCOUNT_ID ? input.responsibleId : '', direction: input.direction, amountMinor, date: input.date, method: input.method, description: input.description }; data.moneyMovements.push(item); return item; });
    },
    async loan(input: Omit<ManualDebt, 'id' | 'amountMinor'> & { amount: number }) {
      await company(input.companyId); checkDate(input.date); requireText(input.description, 'Açıklama'); requireText(input.source, 'Kaynak'); if (!['Alınan Borç', 'Verilen Borç'].includes(input.type)) throw new Error('Borç türü seçin.'); const amountMinor = minor(input.amount, false);
      return store.transact((data) => { const item: ManualDebt = { id: uid(), companyId: input.companyId, type: input.type, amountMinor, date: input.date, description: input.description, source: input.source }; data.manualDebts.push(item); return item; });
    },
    async expense(input: Omit<Expense, 'id' | 'amountMinor'> & { amount: number }) {
      await company(input.companyId, '', true); checkDate(input.date); requireText(input.description, 'Açıklama'); if (!expenseCategories.includes(input.category) || !paymentMethods.includes(input.method)) throw new Error('Gider türü ve ödeme şekli seçin.'); const amountMinor = minor(input.amount, false);
      return store.transact((data) => { const item: Expense = { id: uid(), companyId: input.companyId, category: input.category, amountMinor, date: input.date, method: input.method, description: input.description, note: input.note }; data.expenses.push(item); return item; });
    },
  };
}
