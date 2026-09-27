import { quantity, requireText } from './common.ts';
import { itemStatus, validateNotes, validatePlanInput, validatePlanRecords } from './productionPlan.ts';
import type { PlanItem, ProductionPlan } from './productionPlan';

export interface EmbroideryInfo { notes: string[]; colorNotes: { color: string; note: string }[]; position: string; size: string; technicalNote: string }
export interface PackagingInfo { unitsPerPack?: number; type: string; sizeMode: string; note: string; labelingNote: string }
export interface OrderProduct extends PlanItem { brandId: string; embroidery: EmbroideryInfo; packaging: PackagingInfo }
export interface ProductionOrder {
  workflowVersion: 4; id: string; orderNo: string; name: string; customerId: string;
  date: string; dueDate: string; customerReference: string; customerNote: string; note: string;
  product: OrderProduct; revision: number; createdAt: string; updatedAt: string;
  archived?: boolean; archivedAt?: string | null; deleted?: boolean; deletedAt?: string | null;
  source?: { planId: string; productId: string; planNo: string; legacyOrderId?: string };
  stockSourceId: string;
  sourceDraftId?: string;
  productionStartedAt?: string;
}
export type OrderProductInput = Omit<OrderProduct, 'id' | 'productName' | 'brand' | 'stages' | 'stockTransfer' | 'legacy'>;
export interface ProductionOrderInput { name: string; customerId: string; date: string; dueDate: string; customerReference: string; customerNote: string; note: string; product: OrderProductInput }
export interface ProductionBrand { id: string; name: string }
export interface OrderDraft { id: string; revision: number; updatedAt: string; input: ProductionOrderInput }
export const productionStarted = (o: ProductionOrder) => !!o.productionStartedAt || o.product.stages.length > 0 || !!o.product.legacy;
export const stockStatus = (o: ProductionOrder) => o.product.stockTransfer ? 'Stoğa Aktarıldı' : itemStatus(o.product) === 'Tamamlandı' ? 'Stoğa Aktarılmayı Bekliyor' : 'Üretim Bekleniyor';
export const orderGroup = (o: ProductionOrder) => itemStatus(o.product) === 'Tamamlandı' ? 'Tamamlandı' : productionStarted(o) ? 'Üretimde' : 'Planlama';
export const orderProductionStatus = (o: ProductionOrder) => productionStarted(o) && itemStatus(o.product) === 'Planlama' ? 'Kesim Bekliyor' : itemStatus(o.product);
export const differenceText = (start: number, actual: number) => actual > start ? `+${actual - start} adet` : `${start - actual} fire`;
export const emptyEmbroidery = (): EmbroideryInfo => ({ notes: [], colorNotes: [], position: '', size: '', technicalNote: '' });
export const emptyPackaging = (): PackagingInfo => ({ type: '', sizeMode: '', note: '', labelingNote: '' });
export const historicalBrandId = (name: string) => `historical-brand:${encodeURIComponent(name.trim().toLocaleLowerCase('tr-TR'))}`;

export function validateOrderProduct(product: OrderProduct) {
  requireText(product.brandId, 'Marka'); validateNotes(product.embroidery.notes);
  const fields = [product.embroidery.position, product.embroidery.size, product.embroidery.technicalNote, product.packaging.type, product.packaging.sizeMode, product.packaging.note, product.packaging.labelingNote];
  if (fields.some((s) => typeof s !== 'string' || s.length > 2000)) throw new Error('Teknik bilgiler en fazla 2000 karakter olabilir.');
  if (product.packaging.unitsPerPack !== undefined) quantity(product.packaging.unitsPerPack, 'Bir paketteki ürün adedi', true);
  const keys = new Set<string>();
  for (const row of product.embroidery.colorNotes) {
    const key = row.color.trim().toLocaleLowerCase('tr-TR');
    if (keys.has(key) || !product.colors.some((r) => r.color.trim().toLocaleLowerCase('tr-TR') === key) || row.note.length > 2000) throw new Error('Nakış renk notu geçersiz.'); keys.add(key);
  }
}
export function validateProductionOrders(orders: ProductionOrder[] | undefined) {
  if (orders === undefined) return;
  if (!Array.isArray(orders)) throw new Error('Sipariş deposu geçersiz.');
  const ids = new Set<string>(), numbers = new Set<string>();
  for (const o of orders) {
    if (!o.id || ids.has(o.id) || !o.orderNo || numbers.has(o.orderNo) || o.workflowVersion !== 4 || !o.product || 'items' in o || !Number.isSafeInteger(o.revision) || o.revision < 0) throw new Error('Sipariş tek bir ürün içermelidir.');
    ids.add(o.id); numbers.add(o.orderNo);
    if (!o.source) { validatePlanInput({ ...o, items: [o.product] }); validateOrderProduct(o.product); }
    if (o.customerNote.length > 2000) throw new Error('Müşteri notu çok uzun.');
    const projected: ProductionPlan = { ...o, workflowVersion: 3, planNo: o.orderNo, items: [o.product], legacyOrderId: o.source ? o.source.planId : undefined };
    validatePlanRecords([projected]);
  }
}
