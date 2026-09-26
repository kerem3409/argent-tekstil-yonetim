import type { CommonSizeDistribution, ProductionOrderItem, ProductionRecord, SizeSeries } from './productionWorkflow';
import { reservesOrderQuantity } from './productionWorkflow.ts';

export interface CuttingOrder {
  id: string; cuttingNo: string; workflowVersion: 2; orderId: string; orderItemId: string;
  date: string; createdAt: string; updatedAt: string; revision: number;
  cutterCompanyId: string; requested: { color: string; quantity: number }[];
  sizeSeries: SizeSeries; sizeDistribution: CommonSizeDistribution;
  productDefinitionId: string; productName: string; modelName: string;
  fabricName: string; gsm: string; fabricProperties: string; instructions: string[]; note: string;
  status: 'Kesime Hazır / Bekliyor' | 'Kesimde' | 'Kesim Sonucu Girilmiş';
  result: { date: string; rows: { color: string; rollCount: number; kg: number; quantity: number }[] } | null;
  archived?: boolean; archivedAt?: string | null; deleted?: boolean; deletedAt?: string | null;
}
export const colorKey = (value: string) => value.trim().toLocaleLowerCase('tr-TR');
export const itemInstructions = (item: ProductionOrderItem) => item.instructions ?? (item.productDetails ? [item.productDetails] : []);
/** Pending targets reserve capacity; completed cuts consume their actual output. Shortfalls reopen demand. */
export function cuttingAllocation(item: ProductionOrderItem, cuts: CuttingOrder[], productions: ProductionRecord[] = []) {
  return item.colorQuantities.map((row) => {
    const matching = cuts.filter((c) => c.orderItemId === item.id && !c.deleted);
    const sent = matching.flatMap((c) => c.requested).filter((r) => colorKey(r.color) === colorKey(row.color)).reduce((n, r) => n + r.quantity, 0);
    const allocated = matching.flatMap((c) => c.result?.rows ?? c.requested).filter((r) => colorKey(r.color) === colorKey(row.color)).reduce((n, r) => n + r.quantity, 0)
      + productions.filter((p) => !p.cuttingOrderId && p.orderItemId === item.id && reservesOrderQuantity(p)).flatMap((p) => p.selectedColorQuantities ?? []).filter((r) => colorKey(r.color) === colorKey(row.color)).reduce((n, r) => n + r.quantity, 0);
    return { ...row, sent, allocated, remaining: Math.max(0, row.quantity - allocated) };
  });
}
export function cutProductionAllocation(cut: CuttingOrder, productions: ProductionRecord[]) {
  return (cut.result?.rows ?? []).map((row) => {
    const allocated = productions.filter((p) => p.cuttingOrderId === cut.id && reservesOrderQuantity(p)).flatMap((p) => p.selectedColorQuantities ?? []).filter((r) => colorKey(r.color) === colorKey(row.color)).reduce((n, r) => n + r.quantity, 0);
    return { ...row, allocated, remaining: row.quantity - allocated };
  });
}
