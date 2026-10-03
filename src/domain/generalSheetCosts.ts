import { productionCosts } from './productionCosts.ts';
import { amount } from './common.ts';
import { itemStatus, stageRecord } from './productionPlan.ts';
import type { ProductionOrder } from './productionOrder';
import type { Fabric, Material, InventoryStore } from './inventory';
import type { ProductionStore } from './production';
import type { FinanceStore } from './finance';

export const sheetCostCategories = ['Kumaş', 'Kesim', 'Nakış / Baskı', 'Dikim', 'Ütü / Paket', 'Etiket / Aksesuar / Malzeme', 'Diğer giderler'] as const;
export type SheetCostCategory = typeof sheetCostCategories[number];
export interface SheetCostSettings { estimated: Partial<Record<SheetCostCategory, number>>; sources: string[] }
export interface CostSource { id: string; category: SheetCostCategory; description: string; date: string; total: number; quantity: number; unit: string; href: string; jobId?: string; operation?: string }
export interface CostSourceData { fabrics: InventoryStore<Fabric>; materials: InventoryStore<Material>; production: ProductionStore; finance: FinanceStore }
export function validateSheetCosts(value: SheetCostSettings) {
  if (!value || !Array.isArray(value.sources) || value.sources.some((s) => typeof s !== 'string' || !s) || new Set(value.sources).size !== value.sources.length || !value.estimated || typeof value.estimated !== 'object' || Array.isArray(value.estimated) || Object.entries(value.estimated).some(([k, v]) => !sheetCostCategories.includes(k as SheetCostCategory) || !Number.isSafeInteger(v) || v < 0)) throw new Error('Föy maliyet bilgileri geçersiz.');
}
export function costSources(data: CostSourceData): CostSource[] {
  const sources: CostSource[] = [];
  for (const [store, prefix, category, unit] of [[data.fabrics, 'fabric', 'Kumaş', 'kg'], [data.materials, 'material', 'Etiket / Aksesuar / Malzeme', 'birim']] as const) {
    for (const movement of store.movements.filter((m) => m.type === 'Çıkış' && m.outgoing > 0)) {
      const record = store.records.find((r) => r.id === movement.recordId); if (!record) continue;
      sources.push({ id: `${prefix}:${movement.id}`, category, description: `${record.name} · ${movement.description}`, date: movement.date, total: amount(movement.outgoing, record.priceMinor), quantity: movement.outgoing, unit, href: prefix === 'fabric' ? '/stok/kumaslar' : '/stok/malzemeler' });
    }
  }
  for (const s of data.production.stages) for (const [index, line] of s.lines.entries()) {
    const category: SheetCostCategory = line.operation === 'Nakış' || line.operation === 'Baskı' ? 'Nakış / Baskı' : ['Ütü', 'Paketleme', 'Ütü & Paket'].includes(line.operation) ? 'Ütü / Paket' : line.operation === 'Kesim' || line.operation === 'Dikim' ? line.operation : 'Diğer giderler';
    sources.push({ id: `stage:${s.id}:${index}`, category, operation: line.operation, description: `${s.number} · ${line.operation}`, date: s.date, total: line.priceType === 'Toplam Fiyat' ? line.priceMinor : amount(line.quantity, line.priceMinor), quantity: line.quantity, unit: 'adet', href: `/uretim/siparisler?id=${s.jobId}`, jobId: s.jobId });
  }
  for (const e of data.finance.expenses) sources.push({ id: `expense:${e.id}`, category: 'Diğer giderler', description: `${e.category} · ${e.description}`, date: e.date, total: e.amountMinor, quantity: 1, unit: 'gider', href: '/finans/genel-giderler' });
  return sources;
}
export function automaticCostSources(order: ProductionOrder, data: CostSourceData, sources = costSources(data)) {
  const ids = new Set([order.id, order.stockSourceId, ...(order.product.legacy?.productionIds ?? [])]);
  // A legacy plan can contain multiple products. Only exact job/production identities
  // are automatic; plan-name or shared-plan matches need an explicit association.
  return sources.filter((s) => s.jobId && ids.has(s.jobId));
}
export function generalSheetCosts(order: ProductionOrder, sources: CostSource[], automatic: CostSource[] = [], settings = order.sheetCosts ?? { estimated: {}, sources: [] }) {
  validateSheetCosts(settings);
  const selected = sources.filter((s) => settings.sources.includes(s.id) || automatic.some((a) => a.id === s.id));
  const fallback = productionCosts(order);
  const category = (key: string) => key === 'Nakış' || key === 'Baskı' || key === 'Uygulama' ? 'Nakış / Baskı' : key === 'Ütü & Paket' ? 'Ütü / Paket' : key;
  const rows = sheetCostCategories.map((name) => {
    const linked = selected.filter((s) => s.category === name), manual = fallback.rows.filter((r) => order.costPricesMinor?.[r.key] !== undefined && category(r.key) === name && !linked.some((s) => name !== 'Nakış / Baskı' || r.key === 'Uygulama' || s.operation === r.key));
    const actual = linked.length || manual.some((r) => r.total !== undefined) ? linked.reduce((n, s) => n + s.total, 0) + manual.reduce((n, r) => n + (r.total ?? 0), 0) : undefined;
    const estimated = settings.estimated[name];
    return { name, actual, estimated, difference: actual !== undefined && estimated !== undefined ? actual - estimated : undefined, source: linked.length ? `${linked.length} bağlı kayıt` : manual.length ? 'Üretim miktarı × kayıtlı birim fiyat' : 'Kayıt bağlanmadı' };
  });
  const actual = rows.reduce((n, r) => n + (r.actual ?? 0), 0), estimated = rows.reduce((n, r) => n + (r.estimated ?? 0), 0);
  if (![actual, estimated].every(Number.isSafeInteger)) throw new Error('Maliyet toplamı sınırı aşıldı.');
  const complete = stageRecord(order.product, 'Ütü & Paket')?.result?.rows.reduce((n, r) => n + r.quantity, 0) ?? 0;
  const missing = settings.sources.filter((id) => !sources.some((s) => s.id === id));
  return { rows, selected, actual, estimated: rows.some((r) => r.estimated !== undefined) ? estimated : undefined, perUnit: itemStatus(order.product) === 'Tamamlandı' && complete > 0 && !missing.length && rows.some((r) => r.actual !== undefined) ? Math.round(actual / complete) : undefined, missing };
}
