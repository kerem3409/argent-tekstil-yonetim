import { amount, checkDate, quantity, requireText } from './common.ts';
import { activeStages, stageRecord } from './productionPlan.ts';
import { productionCosts } from './productionCosts.ts';
import { automaticCostSources, costSources } from './generalSheetCosts.ts';
import type { CostSourceData } from './generalSheetCosts';
import type { ProductionOrder } from './productionOrder';
import type { Material } from './inventory';

export const extraCostCategories = ['Aksesuar', 'Ütü / Paket Malzemeleri', 'Lojistik', 'Diğer'] as const;
export const accessoryUnits = ['Adet', 'Metre', 'Kg', 'Paket'] as const;
export interface OrderExtraCost { id: string; category: typeof extraCostCategories[number]; name: string; amountMinor: number; companyId: string; date: string }
export interface OrderAccessory { id: string; name: string; quantity: number; quantityText?: string; unit: typeof accessoryUnits[number]; materialId: string; companyId: string; priceMinor?: number }
export interface OrderCosting { version: 1; fabricCompanyId: string; extras: OrderExtraCost[]; accessories: OrderAccessory[] }
export const emptyOrderCosting = (): OrderCosting => ({ version: 1, fabricCompanyId: '', extras: [], accessories: [] });
export function validateOrderCosting(value: OrderCosting | undefined) {
  if (value === undefined) return;
  if (!value || value.version !== 1 || typeof value.fabricCompanyId !== 'string' || !Array.isArray(value.extras) || !Array.isArray(value.accessories) || value.extras.length > 100 || value.accessories.length > 100) throw new Error('Üretim maliyet bilgileri geçersiz.');
  const ids = new Set<string>();
  for (const r of [...value.extras, ...value.accessories]) { requireText(r.id, 'Kalem kimliği'); if (ids.has(r.id)) throw new Error('Maliyet kalemi tekrarlanamaz.'); ids.add(r.id); requireText(r.name, 'Kalem adı', 200); if (typeof r.companyId !== 'string') throw new Error('Firma seçimi geçersiz.'); }
  for (const r of value.extras) { checkDate(r.date); if (!extraCostCategories.includes(r.category) || !Number.isSafeInteger(r.amountMinor) || r.amountMinor < 0) throw new Error('Ek maliyet geçersiz.'); }
  for (const r of value.accessories) if (r.quantity > 0) quantity(r.quantity, 'Aksesuar miktarı', ['Adet', 'Paket'].includes(r.unit));
  for (const r of value.accessories) if (!accessoryUnits.includes(r.unit) || !Number.isFinite(r.quantity) || r.quantity < 0 || r.quantity > 1e9 || (r.quantity > 0 && ['Adet', 'Paket'].includes(r.unit) && !Number.isSafeInteger(r.quantity)) || (r.quantity === 0 && !r.quantityText) || (r.quantityText !== undefined && (typeof r.quantityText !== 'string' || r.quantityText.length > 100)) || typeof r.materialId !== 'string' || (r.priceMinor !== undefined && (!Number.isSafeInteger(r.priceMinor) || r.priceMinor < 0))) throw new Error('Aksesuar miktarı, birimi veya fiyatı geçersiz.');
}
function plannedQuantity(value: string) {
  const match = value.trim().match(/^(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+(?:\.\d+)?)/);
  if (!match) return { quantity: 0, unit: 'Adet' as const };
  const raw = match[0].includes('.') && match[0].includes(',') ? match[0].replaceAll('.', '').replace(',', '.') : match[0].includes('.') && /\.\d{3}(?:\D|$)/.test(match[0]) ? match[0].replaceAll('.', '') : match[0].replace(',', '.');
  const quantity = Number(raw), suffix = value.slice(match[0].length).trim().toLocaleLowerCase('tr-TR');
  const unit = suffix.includes('metre') || suffix.includes('mt') ? 'Metre' : suffix.includes('kg') ? 'Kg' : suffix.includes('paket') ? 'Paket' : 'Adet';
  return { quantity: Number.isFinite(quantity) ? quantity : 0, unit: unit as typeof accessoryUnits[number] };
}
export function seedPlanAccessories(order: ProductionOrder, costing: OrderCosting): OrderCosting {
  const rows = [...costing.accessories];
  for (const [index, material] of order.product.materials.entries()) {
    const name = material.name.trim();
    if (!name || rows.some((r) => r.name.trim().toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) continue;
    const parsed = plannedQuantity(material.quantity);
    rows.push({ id: `plan-material:${index}:${encodeURIComponent(name)}`, name, quantity: parsed.quantity, quantityText: material.quantity || 'Miktar belirtilmedi', unit: parsed.unit, materialId: '', companyId: '' });
  }
  return { ...costing, accessories: rows };
}
export function accessoryAvailability(rows: OrderAccessory[], materials: Material[]) {
  const available = new Map(materials.map((m) => [m.id, m.quantity]));
  return rows.map((r) => { const stock = r.materialId ? available.get(r.materialId) ?? 0 : 0; const allocated = Math.min(stock, r.quantity); if (r.materialId) available.set(r.materialId, stock - allocated); return { id: r.id, available: stock, missing: r.quantity - allocated }; });
}
export interface ProductionCostLine { id: string; name: string; category: string; total?: number; quantity?: number; companyId: string; date: string; payable: boolean; sourceId?: string }
export function actualProductionCosts(order: ProductionOrder, data?: CostSourceData) {
  const p = order.product, settings = order.costing, lines: ProductionCostLine[] = [];
  const all = data ? costSources(data) : [], auto = data ? automaticCostSources(order, data, all) : [];
  const selected = all.filter((s) => order.sheetCosts?.sources.includes(s.id) || auto.some((a) => a.id === s.id));
  const missing = (order.sheetCosts?.sources ?? []).filter((id) => !selected.some((s) => s.id === id));
  const cat = (s: string) => s === 'Nakış' || s === 'Baskı' || s === 'Nakış / Baskı' ? 'Uygulama' : s === 'Ütü & Paket' ? 'Ütü / Paket' : s === 'Etiket / Aksesuar / Malzeme' ? 'Aksesuar' : s === 'Diğer giderler' ? 'Diğer' : s;
  const fabricSources = selected.filter((s) => s.category === 'Kumaş');
  for (const s of selected) {
    const materialId = s.id.startsWith('material:') ? data?.materials.movements.find((m) => `material:${m.id}` === s.id)?.recordId : undefined;
    const material = data?.materials.records.find((m) => m.id === materialId);
    lines.push({ id: s.id, sourceId: s.id, name: s.description, category: material?.category === 'Ütü & Paket Malzemeleri' ? 'Ütü / Paket Malzemeleri' : cat(s.category), quantity: s.quantity, total: s.category === 'Kumaş' && order.costPricesMinor?.Kumaş !== undefined ? amount(s.quantity, order.costPricesMinor.Kumaş) : s.total, companyId: '', date: s.date, payable: false });
  }
  for (const r of productionCosts(order).rows) {
    if (r.key === 'Kumaş' ? fabricSources.length : selected.some((s) => s.operation === r.key || (s.category === cat(r.key) && !s.operation))) continue;
    const stage = r.key === 'Kumaş' ? stageRecord(p, 'Kesim') : stageRecord(p, r.key);
    lines.push({ id: `price:${r.key}`, name: r.key, category: cat(r.key), quantity: r.quantity, total: order.costPricesMinor?.[r.key] === undefined ? undefined : r.total, companyId: r.key === 'Kumaş' ? settings?.fabricCompanyId ?? '' : stage?.companyId ?? '', date: stage?.result?.date ?? order.date, payable: !!settings && !!stage?.result });
  }
  for (const r of settings?.accessories ?? []) {
    const material = data?.materials.records.find((m) => m.id === r.materialId);
    if (r.materialId && selected.some((s) => s.id.startsWith('material:') && data?.materials.movements.some((m) => `material:${m.id}` === s.id && m.recordId === r.materialId))) continue;
    const price = r.materialId ? material?.priceMinor : r.priceMinor;
    if (r.materialId && !material) missing.push(`material:${r.materialId}`);
    if (r.quantity <= 0 || (r.materialId ? material?.priceMinor : r.priceMinor) === undefined) missing.push(`accessory:${r.id}`);
    lines.push({ id: `accessory:${r.id}`, name: r.name, category: material?.category === 'Ütü & Paket Malzemeleri' ? 'Ütü / Paket Malzemeleri' : 'Aksesuar', quantity: r.quantity, total: price === undefined ? undefined : amount(r.quantity, price), companyId: r.materialId ? '' : r.companyId, date: order.date, payable: !r.materialId });
  }
  for (const r of settings?.extras ?? []) lines.push({ id: `extra:${r.id}`, name: r.name, category: r.category, total: r.amountMinor, companyId: r.companyId, date: r.date, payable: true });
  const final = stageRecord(p, 'Ütü & Paket')?.result?.rows.reduce((n,r) => n+r.quantity,0) ?? 0;
  const complete = activeStages(p).every((s) => !!stageRecord(p,s)?.result);
  const total = lines.reduce((n,r) => n+(r.total ?? 0),0);
  if (!Number.isSafeInteger(total)) throw new Error('Üretim maliyeti sınırı aşıldı.');
  const denominator = complete && final > 0 && !missing.length ? final : undefined;
  const categories = ['Kumaş', 'Kesim', 'Uygulama', 'Dikim', 'Ütü / Paket', 'Aksesuar', 'Ütü / Paket Malzemeleri', 'Lojistik', 'Diğer'];
  const rows = categories.map((name) => { const entries = lines.filter((r) => r.category === name); const value = entries.some((r) => r.total !== undefined) ? entries.reduce((n,r) => n+(r.total ?? 0),0) : undefined; return { name, total: value, unit: value !== undefined && denominator ? Math.round(value/denominator) : undefined }; });
  return { lines, rows, total, unit: denominator ? Math.round(total/denominator) : undefined, completed: final, missing, fabricKg: fabricSources.length ? fabricSources.reduce((n,s) => n+s.quantity,0) : productionCosts(order).rows.find((r) => r.key === 'Kumaş')?.quantity };
}
