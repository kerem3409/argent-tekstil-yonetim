import { checkDate, quantity, requireText } from './common.ts';
import { validateCostPrices } from './productionCosts.ts';
import type { CostPrices } from './productionCosts';
import { validateSheetCosts } from './generalSheetCosts.ts';
import type { SheetCostSettings } from './generalSheetCosts';
import { validateSampleImages } from './sampleImages.ts';
import type { SampleImage } from './sampleImages';
import { validateOrderCosting } from './orderCosting.ts';
import type { OrderCosting } from './orderCosting';
import { itemStatus, validateNotes, validatePlanInput, validatePlanRecords } from './productionPlan.ts';
import type { PlanItem, ProductionPlan } from './productionPlan';

export interface EmbroideryInfo { notes: string[]; colorNotes: { color: string; note: string }[]; position: string; size: string; technicalNote: string; color?: string }
export interface ApplicationCard { id: string; type: 'Baskı' | 'Nakış'; notes: string[] }
export interface PackagingInfo { unitsPerPack?: number; type: string; sizeMode: string; note: string; labelingNote: string }
export interface OrderProduct extends PlanItem { brandId: string; embroidery: EmbroideryInfo; packaging: PackagingInfo; printing?: EmbroideryInfo; applicationCards?: ApplicationCard[]; dropShoulder?: boolean; sideSlit?: boolean; sampleImages?: SampleImage[] }
export interface StagePlan { type: import('./productionPlan').PlanStage; companyId: string; plannedStart: string; dueDate: string }
export interface ProductionOrder {
  workflowVersion: 4; id: string; orderNo: string; name: string; customerId: string;
  date: string; dueDate: string; customerReference: string; customerNote: string; note: string;
  product: OrderProduct; revision: number; createdAt: string; updatedAt: string;
  archived?: boolean; archivedAt?: string | null; deleted?: boolean; deletedAt?: string | null;
  source?: { planId: string; productId: string; planNo: string; legacyOrderId?: string };
  stockSourceId: string;
  sourceDraftId?: string;
  productionStartedAt?: string;
  stagePlans?: StagePlan[];
  costPricesMinor?: CostPrices;
  costing?: OrderCosting;
  sheetCosts?: SheetCostSettings;
  resultHistory?: { type: import('./productionPlan').PlanStage; changedAt: string; previous: import('./productionPlan').PlanStageRecord['result'] }[];
}
export type OrderProductInput = Omit<OrderProduct, 'id' | 'productName' | 'brand' | 'stages' | 'stockTransfer' | 'legacy'>;
export interface ProductionOrderInput { name: string; customerId: string; date: string; dueDate: string; customerReference: string; customerNote: string; note: string; product: OrderProductInput; orderNo?: string; costPricesMinor?: CostPrices; costing?: OrderCosting }
export interface ProductionBrand { id: string; name: string }
export interface OrderDraft { id: string; revision: number; updatedAt: string; input: ProductionOrderInput }
export const productionStarted = (o: ProductionOrder) => !!o.productionStartedAt || o.product.stages.length > 0 || !!o.product.legacy;
export const stockStatus = (o: ProductionOrder) => o.product.stockTransfer ? 'Stoğa Aktarıldı' : itemStatus(o.product) === 'Tamamlandı' ? 'Stoğa Aktarılmayı Bekliyor' : 'Üretim Bekleniyor';
export const orderGroup = (o: ProductionOrder) => itemStatus(o.product) === 'Tamamlandı' ? 'Tamamlandı' : productionStarted(o) ? 'Üretimde' : 'Planlama';
export const orderProductionStatus = (o: ProductionOrder) => productionStarted(o) && itemStatus(o.product) === 'Planlama' ? 'Kesim Bekliyor' : itemStatus(o.product);
export const differenceText = (start: number, actual: number) => actual > start ? `+${actual - start} adet` : `${start - actual} fire`;
export const emptyEmbroidery = (): EmbroideryInfo => ({ notes: [], colorNotes: [], position: '', size: '', technicalNote: '' });
export const emptyPackaging = (): PackagingInfo => ({ type: '', sizeMode: '', note: '', labelingNote: '' });
export function productFeatures(product: Pick<OrderProduct, 'dropShoulder' | 'sideSlit' | 'instructions'>) {
  const values = [...(product.dropShoulder ? ['Düşük Omuz'] : []), ...(product.sideSlit ? ['Yırtmaç'] : []), ...product.instructions];
  return values.filter((value, index) => value && values.indexOf(value) === index);
}
export function productApplicationCards(product: Pick<OrderProduct, 'applicationCards' | 'enabledStages' | 'embroidery' | 'printing'>): ApplicationCard[] {
  if (product.applicationCards) return product.applicationCards;
  return (['Baskı', 'Nakış'] as const).filter((type) => product.enabledStages.includes(type)).map((type) => {
    const info = type === 'Baskı' ? product.printing : product.embroidery;
    return { id: `legacy-${type}`, type, notes: [...(info?.notes ?? []), info?.position, info?.size, info?.technicalNote, info?.color].filter((v): v is string => !!v) };
  });
}
export const historicalBrandId = (name: string) => `historical-brand:${encodeURIComponent(name.trim().toLocaleLowerCase('tr-TR'))}`;

export function validateOrderProduct(product: OrderProduct) {
  validateSampleImages(product.sampleImages);
  for (const info of [product.embroidery, product.printing]) if (info?.color !== undefined && (typeof info.color !== 'string' || info.color.length > 200)) throw new Error('İşlem rengi en fazla 200 karakter olabilir.');
  if ([product.dropShoulder, product.sideSlit].some((v) => v !== undefined && typeof v !== 'boolean')) throw new Error('Ürün özellikleri geçersiz.');
  if (product.printing) { validateNotes(product.printing.notes); if ([product.printing.position, product.printing.size, product.printing.technicalNote, ...product.printing.colorNotes.map((r) => r.note)].some((s) => typeof s !== 'string' || s.length > 2000)) throw new Error('Baskı bilgileri geçersiz.'); }
  requireText(product.brandId, 'Marka'); validateNotes(product.embroidery.notes);
  if (product.applicationCards !== undefined) {
    if (!Array.isArray(product.applicationCards) || product.applicationCards.length > 50) throw new Error('Uygulama kartları geçersiz.');
    const ids = new Set<string>();
    for (const card of product.applicationCards) { requireText(card.id, 'İşlem kimliği'); if (ids.has(card.id) || !['Baskı', 'Nakış'].includes(card.type)) throw new Error('Uygulama kartı geçersiz.'); ids.add(card.id); validateNotes(card.notes); }
  }
  const fields = [product.embroidery.position, product.embroidery.size, product.embroidery.technicalNote, product.packaging.type, product.packaging.sizeMode, product.packaging.note, product.packaging.labelingNote];
  if (fields.some((s) => typeof s !== 'string' || s.length > 2000)) throw new Error('Teknik bilgiler en fazla 2000 karakter olabilir.');
  if (product.packaging.unitsPerPack !== undefined) quantity(product.packaging.unitsPerPack, 'Bir paketteki ürün adedi', true);
  const keys = new Set<string>();
  for (const row of product.embroidery.colorNotes) {
    const key = row.color.trim().toLocaleLowerCase('tr-TR');
    if (!key || keys.has(key) || row.note.length > 2000) throw new Error('Nakış renk notu geçersiz.'); keys.add(key);
  }
}
export function validateProductionOrders(orders: ProductionOrder[] | undefined) {
  if (orders === undefined) return;
  if (!Array.isArray(orders)) throw new Error('Sipariş deposu geçersiz.');
  const ids = new Set<string>(), numbers = new Set<string>();
  for (const o of orders) {
    validateOrderCosting(o.costing);
    if (o.sheetCosts !== undefined) validateSheetCosts(o.sheetCosts);
    if (o.costPricesMinor !== undefined) validateCostPrices(o.costPricesMinor);
    if (o.stagePlans) { if (!Array.isArray(o.stagePlans) || new Set(o.stagePlans.map((p) => p.type)).size !== o.stagePlans.length) throw new Error('Aşama planları geçersiz.'); for (const p of o.stagePlans) { requireText(p.companyId, 'Firma'); checkDate(p.plannedStart); checkDate(p.dueDate); if (!o.product.enabledStages.includes(p.type) || p.dueDate < p.plannedStart) throw new Error('Aşama planı geçersiz.'); } }
    if (!o.id || ids.has(o.id) || !o.orderNo || numbers.has(o.orderNo) || o.workflowVersion !== 4 || !o.product || 'items' in o || !Number.isSafeInteger(o.revision) || o.revision < 0) throw new Error('Sipariş tek bir ürün içermelidir.');
    ids.add(o.id); numbers.add(o.orderNo);
    if (!o.source) { validatePlanInput({ ...o, items: [o.product] }); validateOrderProduct(o.product); }
    if (o.customerNote.length > 2000) throw new Error('Müşteri notu çok uzun.');
    const projected: ProductionPlan = { ...o, workflowVersion: 3, planNo: o.orderNo, items: [o.product], legacyOrderId: o.source ? o.source.planId : undefined };
    validatePlanRecords([projected]);
  }
}
