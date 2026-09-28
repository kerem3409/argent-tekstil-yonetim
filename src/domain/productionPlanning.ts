import { activeStages, colorKey, currentCompany, currentStage, itemStatus, remainingDays, stageInput, stageRecord } from './productionPlan.ts';
import type { PlanStage, PlanStageRecord } from './productionPlan';
import type { ProductionOrder } from './productionOrder';
import { productionStarted } from './productionOrder.ts';
import { displayStage } from './productionPresentation.ts';

export const operationDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date());
export const stagePlan = (o: ProductionOrder, type: PlanStage) => o.stagePlans?.find((p) => p.type === type);
export function resultChanged(a: PlanStageRecord['result'], b: NonNullable<PlanStageRecord['result']>) {
  return !!a && (a.rows.length !== b.rows.length || a.rows.some((r) => b.rows.find((v) => colorKey(v.color) === colorKey(r.color))?.quantity !== r.quantity));
}
export function correctionWarning(o: ProductionOrder, type: PlanStage) {
  const next = activeStages(o.product)[activeStages(o.product).indexOf(type) + 1];
  return next ? `${type} sonucu değişti. ${next} başlangıç adetleri yeni sonuca göre güncellenecek. Kaydedilmiş sonraki sonuçlar korunacak; tutarsız miktarlar varsa işlem reddedilecek. Onaylıyor musunuz?` : '';
}
export function liveOrders(orders: ProductionOrder[]) {
  return orders.filter((o) => !o.archived && !o.deleted && !o.product.stockTransfer && itemStatus(o.product) !== 'Tamamlandı' && productionStarted(o)).map((o) => {
    const type = currentStage(o.product) as PlanStage;
    const source = stageInput(o.product, type);
    const last = [...activeStages(o.product)].reverse().map((s) => stageRecord(o.product, s)?.result).find(Boolean);
    const quantity = (source.length ? source : last?.rows ?? o.product.colors).reduce((n, r) => n + r.quantity, 0);
    return { order: o, type, quantity, companyId: currentCompany(o.product), groupId: o.product.productDefinitionId || `legacy:${colorKey(o.product.productName)}` };
  });
}
export function liveGroups(orders: ProductionOrder[]) {
  const groups = new Map<string, { id: string; name: string; total: number; stages: Partial<Record<PlanStage, number>>; rows: ReturnType<typeof liveOrders> }>();
  for (const row of liveOrders(orders)) { const g = groups.get(row.groupId) ?? { id: row.groupId, name: row.order.product.productName, total: 0, stages: {}, rows: [] }; g.total += row.quantity; g.stages[row.type] = (g.stages[row.type] ?? 0) + row.quantity; g.rows.push(row); groups.set(g.id, g); }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export function filterLiveOrders(orders: ProductionOrder[], filters: { product?: string; customer?: string; stage?: string; company?: string; deadline?: string; search?: string }, customerName: (id: string) => string) {
  const search = (filters.search ?? '').trim().toLocaleLowerCase('tr-TR');
  return liveOrders(orders).filter(({ order: o, type, groupId, companyId }) => {
    const days = remainingDays(stagePlan(o, type)?.dueDate || o.dueDate);
    return (!filters.product || groupId === filters.product) && (!filters.customer || o.customerId === filters.customer) && (!filters.stage || type === filters.stage || displayStage(type) === filters.stage) && (!filters.company || companyId === filters.company)
      && (!filters.deadline || (days !== undefined && days !== null && (filters.deadline === 'Geciken' ? days < 0 : filters.deadline === 'Bugün Terminli' ? days === 0 : days > 0 && days <= 7)))
      && [o.orderNo, customerName(o.customerId), o.product.brand, o.product.modelName].join(' ').toLocaleLowerCase('tr-TR').includes(search);
  }).map((r) => r.order);
}
