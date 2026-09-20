import type { PaymentMethod } from './common';
export const expenseCategories = ['Temizlik', 'Kira', 'Elektrik / Su', 'İnternet / Telefon', 'Yemek', 'Akaryakıt', 'Kargo / Nakliye', 'Tamir / Bakım', 'Kırtasiye', 'Muhasebe', 'Diğer'] as const;
export interface MoneyMovement { id: string; companyId: string; responsibleId: string; direction: 'paid' | 'received'; amountMinor: number; date: string; method: PaymentMethod; description: string }
export interface ManualDebt { id: string; companyId: string; type: 'Alınan Borç' | 'Verilen Borç'; amountMinor: number; date: string; description: string; source: string }
export interface Expense { id: string; companyId: string; category: typeof expenseCategories[number]; date: string; description: string; amountMinor: number; method: PaymentMethod; note: string }
export interface AccountAdjustment { id: string; companyId: string; responsibleId: string; type: 'Mahsup' | 'Diğer'; direction: 'Borç' | 'Alacak'; amountMinor: number; date: string; description: string }
export interface FinanceStore { version: 1; moneyMovements: MoneyMovement[]; manualDebts: ManualDebt[]; expenses: Expense[]; adjustments?: AccountAdjustment[] }
export interface AccountEntry { id: string; sourceId: string; source: string; companyId: string; responsibleId: string; date: string; description: string; deltaMinor: number; href: string; productId?: string; stockId?: string }
export const accountKey = (companyId: string, responsibleId = '') => `${companyId}|${responsibleId}`;
export function accountBalances(entries: AccountEntry[]) {
  const balances = new Map<string, { companyId: string; responsibleId: string; balance: number }>();
  for (const entry of entries) { const key = accountKey(entry.companyId, entry.responsibleId); const item = balances.get(key) ?? { companyId: entry.companyId, responsibleId: entry.responsibleId, balance: 0 }; item.balance += entry.deltaMinor; balances.set(key, item); }
  return [...balances.values()];
}
// Karşı yönlü hareketler en eski açık kaynaktan düşülür; kalanlar türetilir, kaydedilmez.
export function outstandingEntries(entries: AccountEntry[]) {
  const accounts = new Map<string, { entry: AccountEntry; remaining: number }[]>();
  for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const key = accountKey(entry.companyId, entry.responsibleId); const queue = accounts.get(key) ?? []; let remaining = entry.deltaMinor;
    while (remaining && queue.length && Math.sign(queue[0].remaining) !== Math.sign(remaining)) {
      const first = queue[0]; const used = Math.min(Math.abs(first.remaining), Math.abs(remaining)); first.remaining -= Math.sign(first.remaining) * used; remaining -= Math.sign(remaining) * used; if (!first.remaining) queue.shift();
    }
    if (remaining) queue.push({ entry, remaining }); accounts.set(key, queue);
  }
  return [...accounts.values()].flat();
}
