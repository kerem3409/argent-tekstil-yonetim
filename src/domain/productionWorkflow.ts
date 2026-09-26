import { amount, checkDate, quantity, requireText } from './common.ts';
import type { ProductionStore, StageLine } from './production';
import type { ProductionReceipt } from '../features/products/model';

export const sizeSeries = {
  'Çocuk': ['2 Yaş', '4 Yaş', '6 Yaş', '8 Yaş', '10 Yaş', '12 Yaş', '14 Yaş'],
  'Yetişkin': ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  'Battal Boy': ['4XL', '5XL', '6XL'],
} as const;
export type SizeSeries = keyof typeof sizeSeries;
export const defaultSizeDistribution = (series: SizeSeries): CommonSizeDistribution => Object.fromEntries(sizeSeries[series].map((size) => [size, 1]));
export const processes = ['Nakış', 'Baskı', 'Dikim', 'Ütü & Paket', 'Diğer'] as const;
export type Process = typeof processes[number];
export const productionStatuses = ['Kesim Bekliyor', 'Kesim Tamamlandı', 'Üretimde', 'Stoğa Aktarım Bekliyor', 'Tamamlandı'] as const;
export interface CuttingRow { id: string; color: string; rollCount: number | null; kg: number | null; quantity: number | null }
export interface BrandSection { id: string; brandName: string; rows: CuttingRow[] }
export interface SizeDistribution { rowId: string; sizes: Record<string, number> }
export interface PlannedSizeDistribution { color: string; sizes: Record<string, number> }
export type CommonSizeDistribution = Record<string, number>;
export interface WorkflowStage {
  id: string; processType: string; companyId: string; rowId: string;
  sentQuantity: number; returnedQuantity: number; priceType: 'Adet Fiyatı' | 'Toplam Fiyat'; priceMinor: number;
  sentDate: string; returnDate: string; status: 'İşlemde' | 'Kısmi Geldi' | 'Tamamlandı'; note: string;
  legacyLines?: StageLine[]; legacyNumber?: string; legacyStatus?: string;
}
export interface CompletionLine { rowId: string; size: string; good: number; waste: number }
export interface ProductionRecord {
  workflowVersion?: 2; cuttingOrderId?: string; productionDueDate?: string;
  productionName?: string;
  archived?: boolean; archivedAt?: string | null; archivedByOrderId?: string | null;
  deleted?: boolean; deletedAt?: string | null; deletedByOrderId?: string | null;
  id: string; productionNo: string; productDefinitionId: string; productId: string; productName: string;
  fabricId: string; fabricName: string; gsm: string; sizeSeries: SizeSeries;
  cuttingMode: 'Kumaştan Çıktığı Kadar' | 'Hedef Adet'; targetQuantity: number | null;
  cutterCompanyId: string; date: string; productInstructions: string; note: string;
  status: typeof productionStatuses[number]; cuttingSheet: { brandSections: BrandSection[]; completedAt: string };
  sizeDistributions: SizeDistribution[]; productionStages: WorkflowStage[];
  completion: { lines: CompletionLine[]; good: number; waste: number; date: string; note: string } | null;
  stockTransfer: { stockIds: string[]; date: string } | null;
  createdAt: string; updatedAt: string; revision: number;
  /** Yeni model: kart tek bir sipariş kartına ve tek markaya bağlıdır. */
  orderCardId?: string; orderItemId?: string; brand?: string; singleBrand?: boolean;
  selectedColorQuantities?: { color: string; quantity: number }[];
  fabricProperties?: string;
  modelName?: string; plannedSizeDistributions?: PlannedSizeDistribution[];
  sizeDistribution?: CommonSizeDistribution;
  sewingCompanyId?: string; cuttingCompanyId?: string; embroideryCompanyId?: string; printingCompanyId?: string; ironingPackagingCompanyId?: string;
  legacy?: { planId: string; jobId: string; planStatus: string; missingSizes: boolean };
}
export interface NewProductionInput {
  productionName?: string;
  plannedSizeDistributions?: PlannedSizeDistribution[];
  sizeDistribution?: CommonSizeDistribution;
  embroideryCompanyId?: string; printingCompanyId?: string; ironingPackagingCompanyId?: string;
  productDefinitionId: string; brand?: string; orderCardId?: string; orderItemId?: string; selectedColorQuantities?: { color: string; quantity: number }[]; sewingCompanyId?: string; fabricId: string; fabricName: string; gsm: string; fabricProperties?: string; sizeSeries: SizeSeries;
  cuttingMode: ProductionRecord['cuttingMode']; targetQuantity: number | null; cutterCompanyId: string;
  date: string; productInstructions: string; note: string;
}
export type OrderType = 'Ön Sipariş' | 'Stok İçin Üretim';
export interface ProductionOrderCard {
  workflowVersion?: 2; orderName?: string;
  revision?: number;
  archived?: boolean; archivedAt?: string | null; dueDate?: string | null;
  deleted?: boolean; deletedAt?: string | null;
  id: string; orderNo: string; orderType: OrderType; customerId?: string; date: string; note: string;
  items: ProductionOrderItem[]; productionCardIds: string[]; createdAt: string; updatedAt: string; legacy?: boolean;
}
export interface ProductionOrderItem {
  instructions?: string[];
  modelName?: string;
  id: string; productDefinitionId: string; productName: string;
  colorQuantities: { color: string; quantity: number }[]; totalQuantity: number;
  fabricName: string; gsm: string; fabricProperties: string; productDetails: string;
}
export type ProductionLifecycle = Pick<ProductionRecord, 'archived' | 'archivedAt' | 'archivedByOrderId' | 'deleted' | 'deletedAt' | 'deletedByOrderId' | 'revision' | 'updatedAt'>;
export interface WorkflowStore extends ProductionStore { unifiedPlans?: import('./productionPlan').ProductionPlan[]; nextUnifiedPlan?: number; cuttingOrders?: import('./cuttingWorkflow').CuttingOrder[]; nextCuttingOrder?: number; productions?: ProductionRecord[]; nextProduction?: number; orderCards?: ProductionOrderCard[]; nextOrder?: number; productionLifecycle?: Record<string, ProductionLifecycle> }
export const cutRows = (p: ProductionRecord) => p.cuttingSheet.brandSections.flatMap((b) => b.rows.map((r) => ({ ...r, brandName: b.brandName })));
export const cuttingTotal = (p: ProductionRecord) => cutRows(p).reduce((sum, r) => sum + (r.quantity ?? 0), 0);
export const stageRemainingQuantity = (s: WorkflowStage) => s.sentQuantity - s.returnedQuantity;
export const workflowStageAmount = (s: WorkflowStage) => s.legacyLines ? s.legacyLines.reduce((sum, l) => sum + amount(l.priceType === 'Adet Fiyatı' ? l.quantity : 1, l.priceMinor), 0) : amount(s.priceType === 'Adet Fiyatı' ? s.sentQuantity : 1, s.priceMinor);
export const subcontractRows = (records: ProductionRecord[]) => records.flatMap((p) => p.productionStages.filter((s) => s.companyId).map((s) => ({ production: p, stage: s, remaining: stageRemainingQuantity(s), total: workflowStageAmount(s) })));
const normalized = (s: string) => s.trim().toLocaleLowerCase('tr-TR');
export const productionOrderId = (p: ProductionRecord) => p.orderCardId ?? `legacy-order:${p.legacy?.planId ?? p.id}`;
export const pastalLocked = (p: ProductionRecord) => !!p.cuttingSheet.completedAt || p.productionStages.length > 0 || !!p.completion || !!p.stockTransfer;
// A completed physical operation remains consumed even when its card is in Trash.
export const reservesOrderQuantity = (p: ProductionRecord) => !p.deleted || (p.workflowVersion === 2 ? p.productionStages.length > 0 || !!p.completion || !!p.stockTransfer : pastalLocked(p));
export const productionDisplayName = (p: ProductionRecord) => p.productionName?.trim() || 'Üretim adı belirtilmemiş';
export function orderAllocation(item: ProductionOrderItem, records: ProductionRecord[]) {
  return item.colorQuantities.map((row) => {
    const allocated = records.filter((p) => p.orderItemId === item.id && reservesOrderQuantity(p)).flatMap((p) => p.selectedColorQuantities ?? []).filter((r) => normalized(r.color) === normalized(row.color)).reduce((sum, r) => sum + r.quantity, 0);
    return { ...row, allocated, remaining: row.quantity - allocated };
  });
}
// Historical size keys remain readable and editable without rewriting stored documents.
export function productionSizes(p: ProductionRecord): string[] {
  const historical = p.sizeDistributions.flatMap((d) => Object.keys(d.sizes));
  return [...new Set([...sizeSeries[p.sizeSeries], ...historical.filter((s) => p.sizeSeries === 'Yetişkin' ? s === 'XS' : p.sizeSeries === 'Çocuk' && ['02 Yaş', '04 Yaş', '06 Yaş', '08 Yaş'].includes(s))])];
}
export function validatePlannedSizes(series: SizeSeries, selected: { color: string; quantity: number }[], distributions: PlannedSizeDistribution[]) {
  const allowed: readonly string[] = sizeSeries[series];
  if (!allowed || distributions.length !== selected.length || new Set(distributions.map((d) => normalized(d.color))).size !== selected.length) throw new Error('Her seçilen renk için beden dağılımı girin.');
  for (const row of selected) {
    const d = distributions.find((d) => normalized(d.color) === normalized(row.color));
    if (!d || Object.keys(d.sizes).some((s) => !allowed.includes(s))) throw new Error('Seçilen beden serisi veya renk geçersiz.');
    const total = Object.values(d.sizes).reduce((sum, q) => { quantity(q, 'Beden adedi', true, true); return sum + q; }, 0);
    if (total !== row.quantity) throw new Error(`${row.color}: beden toplamı ${total}, bu üretime ayrılan ${row.quantity} adet ile eşleşmelidir.`);
  }
}
export function validateCommonSizeDistribution(series: SizeSeries, distribution: CommonSizeDistribution) {
  const allowed = sizeSeries[series];
  if (!distribution || Object.keys(distribution).some((size) => !(allowed as readonly string[]).includes(size))) throw new Error('Seçilen beden serisi veya beden geçersiz.');
  let total = 0;
  for (const size of allowed) { const value = distribution[size] ?? 0; quantity(value, `${size} adedi`, true, true); total += value; }
  if (total <= 0) throw new Error('En az bir beden adedi 0’dan büyük olmalıdır.');
  return total;
}
export function commonSizeDistribution(p: ProductionRecord): CommonSizeDistribution | undefined {
  return p.sizeDistribution ?? p.sizeDistributions.find((row) => Object.keys(row.sizes).length > 0)?.sizes;
}
export function validateNewProduction(input: NewProductionInput) {
  if (input.productionName !== undefined) requireText(input.productionName, 'Üretim Adı', 200);
  requireText(input.productDefinitionId, 'Ürün'); checkDate(input.date);
  if (!Object.hasOwn(sizeSeries, input.sizeSeries)) throw new Error('Beden serisi seçin.');
  if (!['Kumaştan Çıktığı Kadar', 'Hedef Adet'].includes(input.cuttingMode)) throw new Error('Kesim şekli seçin.');
  if (input.cuttingMode === 'Hedef Adet') quantity(input.targetQuantity!, 'Hedef adet', true);
  if (input.brand !== undefined) requireText(input.brand, 'Marka', 200);
  if (input.sizeDistribution) validateCommonSizeDistribution(input.sizeSeries, input.sizeDistribution);
  for (const v of [input.fabricName, input.gsm, input.fabricProperties ?? '', input.productInstructions, input.note]) if (typeof v !== 'string' || v.length > 2000) throw new Error('Metin alanları en fazla 2000 karakter olabilir.');
  if (input.orderItemId && input.selectedColorQuantities) {
    const colors = new Set<string>();
    for (const row of input.selectedColorQuantities) { requireText(row.color, 'Renk', 100); quantity(row.quantity, 'Sipariş adedi', true); const key = normalized(row.color); if (colors.has(key)) throw new Error('Aynı renk bir kez seçilebilir.'); colors.add(key); }
  }
}
export function validateCutting(sections: BrandSection[], results: boolean) {
  if (!sections.length) throw new Error('En az bir marka ekleyin.');
  const brands = new Set<string>(); const ids = new Set<string>(); let total = 0;
  for (const b of sections) {
    requireText(b.id, 'Marka kimliği'); requireText(b.brandName, 'Marka', 200);
    if (ids.has(b.id) || brands.has(normalized(b.brandName))) throw new Error('Aynı marka bir kez eklenebilir.');
    ids.add(b.id); brands.add(normalized(b.brandName));
    if (!b.rows.length) throw new Error('Her markada en az bir renk olmalı.');
    const colors = new Set<string>();
    for (const r of b.rows) {
      requireText(r.id, 'Renk kimliği'); requireText(r.color, 'Renk', 100);
      if (ids.has(r.id) || colors.has(normalized(r.color))) throw new Error('Aynı markada renk tekrarlanamaz.');
      ids.add(r.id); colors.add(normalized(r.color));
      if (results || r.rollCount !== null) quantity(r.rollCount!, 'Top sayısı', true);
      if (results || r.kg !== null) quantity(r.kg!, 'Kg', false, true);
      if (results || r.quantity !== null) quantity(r.quantity!, 'Kesim adedi', true, true);
      total += r.quantity ?? 0;
    }
  }
  quantity(total, 'Toplam kesim adedi', true, !results);
}
export function validateSizes(p: ProductionRecord, distributions: SizeDistribution[]) {
  const rows = cutRows(p); const allowed = productionSizes(p);
  if (distributions.length !== rows.length || new Set(distributions.map((d) => d.rowId)).size !== rows.length) throw new Error('Her marka / renk için beden dağılımı girin.');
  for (const d of distributions) {
    const row = rows.find((r) => r.id === d.rowId);
    if (!row || Object.keys(d.sizes).some((size) => !allowed.includes(size))) throw new Error('Seçilen beden serisi veya renk geçersiz.');
    const total = allowed.reduce((sum, size) => { quantity(d.sizes[size] ?? 0, `${size} adedi`, true, true); return sum + (d.sizes[size] ?? 0); }, 0);
    if (total !== row.quantity) throw new Error(`${row.brandName} / ${row.color}: beden toplamı ${total}, kesim adedi ${row.quantity} olmalıdır.`);
  }
}
export function completionTargets(p: ProductionRecord) {
  return cutRows(p).flatMap((r) => {
    const d = p.sizeDistributions.find((d) => d.rowId === r.id);
    return d ? Object.entries(d.sizes).filter(([, qty]) => qty > 0).map(([size, qty]) => ({ rowId: r.id, size, quantity: qty, brandName: r.brandName, color: r.color })) : [{ rowId: r.id, size: '', quantity: r.quantity ?? 0, brandName: r.brandName, color: r.color }];
  });
}

// Eski belgeler değiştirilmez. Kimlikler deterministiktir; eski cari/stoğa giriş kaynakları korunur.
export function normalizeProductions(data: WorkflowStore, receipts: ProductionReceipt[] = []): ProductionRecord[] {
  const saved = data.productions ?? [];
  const records: ProductionRecord[] = [];
  // Yeni modelde çok markalı eski kartlar, aynı legacy sipariş altında marka bazında ayrılır.
  for (const p of saved) {
    // Raw records created by the pre-card workflow remain addressable by their
    // original id. Records already marked as legacy are normalized into one
    // card per brand so migration is deterministic and repeatable.
    if (p.orderCardId || p.cuttingSheet.brandSections.length <= 1 || !p.legacy) { records.push(p); continue; }
    for (const section of p.cuttingSheet.brandSections) {
      if (saved.some((record) => record.id === `${p.id}:brand:${section.id}`)) continue;
      records.push({ ...p, id: `${p.id}:brand:${section.id}`, productionNo: `${p.productionNo}-${section.brandName}`, brand: section.brandName, orderCardId: `legacy-order:${p.id}`, productName: p.productName, cuttingSheet: { ...p.cuttingSheet, brandSections: [section] }, sizeDistributions: p.sizeDistributions.filter((d) => section.rows.some((r) => r.id === d.rowId)), productionStages: p.productionStages.map((s) => ({ ...s, rowId: section.rows.some((r) => r.id === s.rowId) ? s.rowId : '' })), legacy: { ...(p.legacy ?? { planId: p.id, jobId: '', planStatus: p.status }), missingSizes: p.legacy?.missingSizes ?? false } });
    }
  }
  for (const plan of data.plans) {
    if (records.some((p) => p.legacy?.planId === plan.id)) continue;
    const job = data.jobs.find((j) => j.planId === plan.id);
    const stages = data.stages.filter((s) => s.jobId === job?.id);
    const cut = !!job;
    records.push({ id: `legacy:${plan.id}`, productionNo: job?.number ?? plan.number, productDefinitionId: plan.productDefinitionId ?? '', productId: plan.productId, productName: plan.name,
      fabricId: '', fabricName: '', gsm: '', sizeSeries: 'Yetişkin', cuttingMode: 'Hedef Adet', targetQuantity: plan.colors.reduce((s, c) => s + c.quantity, 0),
      cutterCompanyId: stages.find((s) => s.lines.some((l) => l.operation === 'Kesim'))?.companyId ?? '', date: job?.startDate ?? plan.startDate, productInstructions: '', note: plan.note,
      status: cut ? 'Üretimde' : 'Kesim Bekliyor', brand: plan.brand || 'Marka belirtilmemiş', orderCardId: `legacy-order:${plan.id}`, cuttingSheet: { completedAt: cut ? job!.startDate : '', brandSections: [{ id: `brand:${plan.id}`, brandName: plan.brand || 'Marka belirtilmemiş', rows: plan.colors.map((c) => ({ id: c.id, color: c.color, rollCount: null, kg: null, quantity: c.quantity })) }] }, sizeDistributions: [],
      productionStages: stages.map((s) => { const sent = Math.max(...s.lines.map((l) => l.quantity)); const remaining = Math.max(...s.lines.map((l) => l.quantity - l.returned)); return { id: s.id, legacyNumber: s.number, legacyStatus: s.status, legacyLines: s.lines, processType: s.lines.map((l) => l.operation).join(' / '), companyId: s.companyId, rowId: '', sentQuantity: sent, returnedQuantity: sent - remaining, priceType: 'Toplam Fiyat', priceMinor: 0, sentDate: s.date, returnDate: s.approvedDate, status: s.status === 'Tamamlandı' ? 'Tamamlandı' : remaining < sent ? 'Kısmi Geldi' : 'İşlemde', note: s.note }; }),
      completion: null, stockTransfer: null, createdAt: `${plan.startDate}T00:00:00.000Z`, updatedAt: `${plan.startDate}T00:00:00.000Z`, revision: 0,
      legacy: { planId: plan.id, jobId: job?.id ?? '', planStatus: plan.status, missingSizes: true },
    });
  }
  return records.map((p) => {
    const lifecycle = data.productionLifecycle?.[p.id];
    if (lifecycle) p = { ...p, ...lifecycle };
    // Old archived orders predate cascading flags. Inherit their state without writing a migration.
    const order = data.orderCards?.find((o) => o.id === productionOrderId(p));
    if (order?.archived && !p.archived) p = { ...p, archived: true, archivedAt: order.archivedAt, archivedByOrderId: order.id };
    if (order?.deleted && !p.deleted) p = { ...p, deleted: true, deletedAt: order.deletedAt, deletedByOrderId: order.id };
    const receipt = receipts.find((r) => r.jobId === (p.legacy?.jobId || p.id));
    return receipt ? { ...p, status: 'Tamamlandı', stockTransfer: { stockIds: receipt.stockIds, date: receipt.date }, completion: p.completion ?? { lines: [], good: receipt.good, waste: receipt.waste, date: receipt.date, note: receipt.note } } : p;
  });
}

export function normalizeOrderCards(data: WorkflowStore, records = normalizeProductions(data)): ProductionOrderCard[] {
  const stored = ((data as WorkflowStore & { orderCards?: ProductionOrderCard[] }).orderCards ?? []).map((order) => ({ ...order, items: order.items ?? [] }));
  const result = [...stored]; const ids = new Set(result.map((o) => o.id));
  const groups = new Map<string, ProductionRecord[]>();
  for (const p of records) { const id = p.orderCardId ?? `legacy-order:${p.legacy?.planId ?? p.id}`; const list = groups.get(id) ?? []; list.push(p); groups.set(id, list); }
  for (const [id, cards] of groups) if (!ids.has(id)) {
    const first = cards[0]; result.push({ id, orderNo: first.legacy?.planId ? `SP-${first.legacy.planId.replace(/[^0-9]/g, '').padStart(4, '0')}` : `SP-${first.productionNo.replace(/[^0-9]/g, '').slice(0, 4).padStart(4, '0')}`, orderType: 'Stok İçin Üretim', date: first.date, note: first.note, items: [], productionCardIds: cards.map((p) => p.id), createdAt: first.createdAt, updatedAt: first.updatedAt, legacy: true });
  }
  for (const order of result) order.productionCardIds = records.filter((p) => (p.orderCardId ?? `legacy-order:${p.legacy?.planId ?? p.id}`) === order.id).map((p) => p.id);
  return result;
}

/** Read-only ordering; missing historical timestamps fall back to the order date. */
export function newestOrdersFirst(orders: ProductionOrderCard[]): ProductionOrderCard[] {
  const timestamp = (order: ProductionOrderCard) => {
    const created = Date.parse(order.createdAt ?? '');
    return Number.isFinite(created) ? created : Date.parse(order.date ?? '') || 0;
  };
  return [...orders].sort((a, b) => timestamp(b) - timestamp(a) || b.orderNo.localeCompare(a.orderNo, 'tr', { numeric: true }) || b.id.localeCompare(a.id));
}

// Finans ve raporlar mevcut arayüzden okumaya devam eder. Bu görünüm depoya yazılmaz.
export function projectWorkflow(data: WorkflowStore): ProductionStore {
  const records = data.productions ?? [];
  const oldPlans = new Set(records.map((p) => p.legacy?.planId).filter(Boolean));
  const oldJobs = new Set(records.map((p) => p.legacy?.jobId).filter(Boolean));
  return { ...data,
    plans: [...data.plans.filter((p) => !oldPlans.has(p.id)), ...records.map((p) => ({ id: p.id, number: p.productionNo, productId: p.productId, productDefinitionId: p.productDefinitionId, name: p.productName, brand: p.cuttingSheet.brandSections.map((b) => b.brandName).join(', '), colors: cutRows(p).map((r) => ({ id: r.id, color: r.color, quantity: r.quantity ?? 0 })), startDate: p.date, deliveryDate: '', note: p.note, status: 'Planlandı' as const }))],
    jobs: [...data.jobs.filter((j) => !oldJobs.has(j.id)), ...records.filter((p) => p.cuttingSheet.completedAt).map((p) => ({ id: p.legacy?.jobId || p.id, number: p.productionNo, planId: p.id, startDate: p.date }))],
    stages: [...data.stages.filter((s) => !oldJobs.has(s.jobId)), ...records.flatMap((p) => p.productionStages.map((s) => ({ id: s.id, number: s.legacyNumber ?? `${p.productionNo} / ${s.processType}`, jobId: p.legacy?.jobId || p.id, companyId: s.companyId, date: s.sentDate, approvedDate: s.status === 'Tamamlandı' ? s.returnDate : '', status: s.status, note: s.note, lines: s.legacyLines ?? [{ operation: s.processType as StageLine['operation'], quantity: s.sentQuantity, returned: s.returnedQuantity, priceType: s.priceType, priceMinor: s.priceMinor }] })))],
  };
}
