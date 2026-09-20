export const operations = ['Kesim', 'Nakış', 'Dikim', 'Baskı', 'Ütü', 'Paketleme', 'Diğer'] as const;
export type Operation = typeof operations[number];
export const stageStatuses = ['Bekliyor', 'İşlemde', 'Kısmi Geldi', 'Tamamlandı'] as const;
export interface PlanColor { id: string; color: string; quantity: number }
export interface ProductionPlan { id: string; number: string; productId: string; name: string; brand: string; colors: PlanColor[]; startDate: string; deliveryDate: string; note: string; status: 'Planlandı' | 'Beklemede' | 'İptal' }
export interface PlanInput { name: string; brand: string; total: number; colors: { color: string; quantity: number }[]; startDate: string; deliveryDate: string; note: string; status: ProductionPlan['status'] }
export interface ProductionJob { id: string; number: string; planId: string; startDate: string }
export interface StageLine { operation: Operation; quantity: number; returned: number; priceType: 'Adet Fiyatı' | 'Toplam Fiyat'; priceMinor: number }
export interface ProductionStage { id: string; number: string; jobId: string; companyId: string; lines: StageLine[]; date: string; status: typeof stageStatuses[number]; note: string; approvedDate: string }
export interface StageInput { jobId: string; companyId: string; lines: { operation: Operation; quantity: number; returned: number; priceType: StageLine['priceType']; price: number }[]; date: string; status: ProductionStage['status']; note: string }
export interface ProductionStore { version: 1; plans: ProductionPlan[]; jobs: ProductionJob[]; stages: ProductionStage[]; nextPlan: number; nextJob: number; nextStage: number }
export const planQuantity = (plan: ProductionPlan) => plan.colors.reduce((sum, item) => sum + item.quantity, 0);
export const stageAmount = (stage: ProductionStage) => stage.lines.reduce((sum, line) => sum + (line.priceType === 'Adet Fiyatı' ? line.priceMinor * line.quantity : line.priceMinor), 0);
export const stageGiven = (stage: ProductionStage) => Math.max(0, ...stage.lines.map((line) => line.quantity));
export const stageRemaining = (stage: ProductionStage) => Math.max(0, ...stage.lines.map((line) => line.quantity - line.returned));
export function operationTotals(data: ProductionStore, jobId: string) {
  const job = data.jobs.find((item) => item.id === jobId); const plan = data.plans.find((item) => item.id === job?.planId); const total = plan ? planQuantity(plan) : 0;
  return operations.map((operation) => { const given = data.stages.filter((stage) => stage.jobId === jobId).flatMap((stage) => stage.lines).filter((line) => line.operation === operation).reduce((sum, line) => sum + line.quantity, 0); return { operation, total, given, remaining: total - given }; });
}
