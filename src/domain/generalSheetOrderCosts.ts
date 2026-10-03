import { productionCosts } from './productionCosts.ts';
import { generalSheetCosts, sheetCostCategories } from './generalSheetCosts.ts';
import type { CostSource } from './generalSheetCosts';
import type { ProductionOrder } from './productionOrder';
import { stageRecord } from './productionPlan.ts';

// Presentation-only order costing. Existing actual costs and source records are unchanged.
export function generalSheetOrderCosts(order: ProductionOrder, sources: CostSource[], automatic: CostSource[] = []) {
  const existing = generalSheetCosts(order, sources, automatic), fallback = productionCosts(order);
  const quantity = order.product.colors.reduce((sum, row) => sum + row.quantity, 0);
  const cut = stageRecord(order.product, 'Kesim')?.result?.rows.reduce((sum, row) => sum + row.quantity, 0);
  const category = (key: string) => key === 'Nakış' || key === 'Baskı' || key === 'Uygulama' ? 'Nakış / Baskı' : key === 'Ütü & Paket' ? 'Ütü / Paket' : key;
  const rows = sheetCostCategories.map((name) => {
    const linked = existing.selected.filter((s) => s.category === name);
    const manual = fallback.rows.filter((r) => category(r.key) === name && order.costPricesMinor?.[r.key] !== undefined && !linked.some((s) => name !== 'Nakış / Baskı' || r.key === 'Uygulama' || s.operation === r.key));
    const units = [
      ...linked.map((s) => {
        const denominator = name === 'Kumaş' ? cut : ['Etiket / Aksesuar / Malzeme', 'Diğer giderler'].includes(name) ? quantity : s.quantity;
        return denominator && denominator > 0 ? s.total / denominator : undefined;
      }),
      ...manual.map((r) => r.key === 'Kumaş' ? r.perUnit : r.price),
    ];
    const unit = units.length && units.every((v) => v !== undefined) ? Math.round(units.reduce<number>((sum, v) => sum + (v ?? 0), 0)) : undefined;
    const total = unit === undefined || quantity <= 0 ? undefined : unit * quantity;
    if ((unit !== undefined && !Number.isSafeInteger(unit)) || (total !== undefined && !Number.isSafeInteger(total))) throw new Error('Maliyet toplamı sınırı aşıldı.');
    return { name, unit, total };
  });
  const unit = rows.reduce((sum, r) => sum + (r.unit ?? 0), 0), total = rows.reduce((sum, r) => sum + (r.total ?? 0), 0);
  if (![unit, total].every(Number.isSafeInteger)) throw new Error('Maliyet toplamı sınırı aşıldı.');
  return { rows, unit, total, quantity, missing: existing.missing };
}
