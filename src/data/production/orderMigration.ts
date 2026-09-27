import { migratedPlans } from './planMigration.ts';
import type { WorkflowStore } from '../../domain/productionWorkflow';
import type { ProductionReceipt } from '../../features/products/model';
import { emptyEmbroidery, emptyPackaging, historicalBrandId } from '../../domain/productionOrder.ts';
import type { ProductionOrder } from '../../domain/productionOrder';

export function migratedOrders(data: WorkflowStore, receipts: ProductionReceipt[] = []) {
  const orders: ProductionOrder[] = [...(data.productionOrders ?? [])], warnings: string[] = [];
  let plans;
  try { plans = migratedPlans(data, receipts); }
  catch { return { orders, warnings: ['Bazı eski kayıtlar dönüştürülemedi. Kaynak veriler korunuyor; yeni siparişler etkilenmedi.'] }; }
  for (const plan of plans) {
    try {
      if (!plan.items.length) { warnings.push(`${plan.planNo}: ürün bilgisi bulunmayan eski kayıt korunuyor.`); continue; }
      for (const [index, item] of plan.items.entries()) {
        const id = `order:${plan.id}:${item.id}`;
        if (orders.some((o) => o.id === id)) continue;
        const embroideryStage = item.stages.find((s) => s.type === 'Nakış');
        const embroidery = { ...emptyEmbroidery(), notes: embroideryStage?.notes ?? [], colorNotes: embroideryStage?.colorNotes ?? [] };
        const stockSourceId = `unified:${plan.id}:${item.id}`;
        const receipt = receipts.find((r) => r.jobId === stockSourceId);
        orders.push({ workflowVersion: 4, id, orderNo: `SP-${plan.planNo}-${index + 1}`, name: plan.items.length === 1 ? plan.name : `${plan.name} · ${item.modelName}`, customerId: plan.customerId, date: plan.date, dueDate: plan.dueDate, customerReference: plan.customerReference, customerNote: plan.note, note: '',
          product: { ...structuredClone(item), brandId: historicalBrandId(item.brand), embroidery, packaging: emptyPackaging(), ...(receipt ? { stockTransfer: { stockIds: receipt.stockIds, date: receipt.date } } : {}) }, revision: 0, createdAt: plan.createdAt, updatedAt: plan.updatedAt, archived: plan.archived, archivedAt: plan.archivedAt, deleted: plan.deleted, deletedAt: plan.deletedAt,
          source: { planId: plan.id, productId: item.id, planNo: plan.planNo, legacyOrderId: plan.legacyOrderId }, stockSourceId });
      }
    } catch { warnings.push(`${plan.planNo || 'Eski kayıt'} dönüştürülemedi. Kaynak kayıt değiştirilmedi.`); }
  }
  return { orders, warnings };
}
