import { amount } from './common.ts';
import { activeStages, itemStatus, stageRecord } from './productionPlan.ts';
import type { PlanStage } from './productionPlan';
import type { ProductionOrder } from './productionOrder';

export const costKeys = ['Kumaş', 'Kesim', 'Nakış', 'Baskı', 'Dikim', 'Ütü & Paket'] as const;
export type CostKey = typeof costKeys[number];
export type CostPrices = Partial<Record<CostKey, number>>;
export function validateCostPrices(prices: CostPrices) {
  if (!prices || typeof prices !== 'object' || Array.isArray(prices) || Object.entries(prices).some(([k, v]) => !costKeys.includes(k as CostKey) || !Number.isSafeInteger(v) || v < 0)) throw new Error('Maliyet fiyatları geçersiz.');
}
export function productionCosts(order: ProductionOrder, prices = order.costPricesMinor ?? {}) {
  validateCostPrices(prices);
  const cut = stageRecord(order.product, 'Kesim')?.result;
  const cutQuantity = cut?.rows.reduce((n, r) => n + r.quantity, 0);
  const kg = cut && cut.rows.every((r) => r.kg !== undefined) ? cut.rows.reduce((n, r) => n + (r.kg ?? 0), 0) : undefined;
  const rows = (['Kumaş', ...activeStages(order.product)] as CostKey[]).map((key) => {
    const result = key === 'Kumaş' ? undefined : stageRecord(order.product, key as PlanStage)?.result;
    const quantity = key === 'Kumaş' ? kg : result?.rows.reduce((n, r) => n + r.quantity, 0);
    const total = quantity === undefined ? undefined : amount(quantity, prices[key] ?? 0);
    const denominator = key === 'Kumaş' ? cutQuantity : quantity;
    return { key, quantity, price: prices[key] ?? 0, total, perUnit: total !== undefined && denominator ? Math.round(total / denominator) : undefined };
  });
  const total = rows.reduce((n, r) => n + (r.total ?? 0), 0);
  if (!Number.isSafeInteger(total)) throw new Error('Toplam maliyet sınırı aşıldı.');
  const final = stageRecord(order.product, 'Ütü & Paket')?.result?.rows.reduce((n, r) => n + r.quantity, 0);
  return { rows, total, perUnit: itemStatus(order.product) === 'Tamamlandı' && final && rows.every((r) => r.total !== undefined) ? Math.round(total / final) : undefined };
}
export const costMoney = (minor: number) => `${(minor / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
