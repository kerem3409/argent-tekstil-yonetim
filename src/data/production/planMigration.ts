import type { WorkflowStore, ProductionOrderItem } from '../../domain/productionWorkflow';
import { cutRows, defaultSizeDistribution, normalizeOrderCards, normalizeProductions, productionOrderId } from '../../domain/productionWorkflow.ts';
import { INTERNAL_CUSTOMER_ID, colorKey } from '../../domain/productionPlan.ts';
import type { PlanItem, PlanStageRecord, ProductionPlan } from '../../domain/productionPlan';
import type { ProductionReceipt } from '../../features/products/model';

/** A deterministic, read-only projection. Original documents remain untouched. */
export function migratedPlans(data: WorkflowStore, receipts: ProductionReceipt[] = []): ProductionPlan[] {
  const saved = data.unifiedPlans ?? [], cards = normalizeProductions(data, receipts);
  return [...saved, ...normalizeOrderCards(data, cards).filter((o) => !saved.some((p) => p.legacyOrderId === o.id)).map((o): ProductionPlan => {
    const related = cards.filter((p) => productionOrderId(p) === o.id);
    const sources: ProductionOrderItem[] = [...o.items];
    // Older plans had no order items. Keep one item per historical production.
    for (const p of related.filter((p) => !sources.some((i) => i.id === p.orderItemId))) sources.push({ id: `historical:${p.id}`, productDefinitionId: p.productDefinitionId, productName: p.productName, modelName: p.modelName ?? p.productName, fabricName: p.fabricName, gsm: p.gsm, fabricProperties: p.fabricProperties ?? '', productDetails: p.productInstructions, colorQuantities: p.selectedColorQuantities ?? cutRows(p).map((r) => ({ color: r.color, quantity: r.quantity ?? 0 })), totalQuantity: p.targetQuantity ?? 0 });
    const items = sources.map((source): PlanItem => {
      const productions = related.filter((p) => p.orderItemId === source.id || source.id === `historical:${p.id}`);
      const cuts = (data.cuttingOrders ?? []).filter((c) => c.orderId === o.id && c.orderItemId === source.id);
      const liveCuts = cuts.filter((c) => !c.deleted || o.deleted), liveCards = productions.filter((p) => !p.deleted || p.deletedByOrderId === o.id);
      const first = liveCards[0] ?? productions[0], cut = liveCuts[0] ?? cuts[0];
      const brands = [...new Set(productions.map((p) => p.brand ?? p.cuttingSheet.brandSections[0]?.brandName).filter(Boolean))];
      const differingSizes = liveCuts.some((c) => c.sizeSeries !== liveCuts[0].sizeSeries || JSON.stringify(c.sizeDistribution) !== JSON.stringify(liveCuts[0].sizeDistribution));
      const readOnly = productions.some((p) => p.productionStages.length > 0 || !!p.completion || !!p.stockTransfer || (p.deleted && p.deletedByOrderId !== o.id)) || brands.length > 1 || liveCuts.some((c) => !c.result) && liveCuts.length > 1 || !!first?.legacy || differingSizes;
      const stages: PlanStageRecord[] = [];
      const sumColors = (rows: { color: string; quantity: number }[]) => {
        const sums = new Map<string, { color: string; quantity: number }>();
        for (const r of rows) { const key = colorKey(r.color); const old = sums.get(key); sums.set(key, { color: old?.color ?? r.color, quantity: (old?.quantity ?? 0) + r.quantity }); }
        return [...sums.values()];
      };
      const actual = liveCuts.length ? liveCuts.flatMap((c) => c.result?.rows ?? []) : liveCards.filter((p) => p.cuttingSheet.completedAt).flatMap((p) => cutRows(p).map((r) => ({ color: r.color, quantity: r.quantity ?? 0 })));
      const hasResult = liveCuts.length ? liveCuts.every((c) => !!c.result) : liveCards.length > 0 && liveCards.every((p) => !!p.cuttingSheet.completedAt);
      // Missing result colors cannot be guessed: preserve a historical view instead.
      const colors = source.colorQuantities;
      const resultRows = sumColors(actual);
      const mismatch = hasResult && (resultRows.length !== colors.length || colors.some((r) => !resultRows.some((v) => colorKey(v.color) === colorKey(r.color))));
      const date = cut?.result?.date ?? first?.cuttingSheet.completedAt ?? o.date;
      if (cut || hasResult || first?.cutterCompanyId) stages.push({ type: 'Kesim', companyId: cut?.cutterCompanyId ?? first?.cutterCompanyId ?? '', date: cut?.date ?? first?.date ?? o.date, notes: cut?.note ? [cut.note] : [], colorNotes: [], result: hasResult ? { date, rows: resultRows } : null });
      const enabledStages: PlanItem['enabledStages'] = ['Kesim', ...(liveCards.some((p) => p.embroideryCompanyId || p.productionStages.some((s) => s.processType === 'Nakış')) ? ['Nakış' as const] : []), ...(liveCards.some((p) => p.printingCompanyId || p.productionStages.some((s) => s.processType === 'Baskı')) ? ['Baskı' as const] : []), 'Dikim', 'Ütü & Paket'];
      if (readOnly) for (const type of enabledStages.filter((s) => s !== 'Kesim')) {
        const history = liveCards.flatMap((p) => p.productionStages.filter((s) => s.processType === type).map((s) => ({ p, s })));
        if (!history.length) continue;
        stages.push({ type, companyId: history.find(({ s }) => s.status !== 'Tamamlandı')?.s.companyId ?? history[0].s.companyId, date: history[0].s.sentDate, notes: history.map(({ s }) => s.note).filter(Boolean), colorNotes: [],
          result: history.every(({ s }) => s.status === 'Tamamlandı') ? { date: history.map(({ s }) => s.returnDate).sort().at(-1)!, rows: sumColors(history.map(({ p, s }) => ({ color: cutRows(p).find((r) => r.id === s.rowId)?.color ?? 'Eski toplam', quantity: s.returnedQuantity }))) } : null });
      }
      return { id: source.id, productDefinitionId: source.productDefinitionId, productName: source.productName, modelName: source.modelName ?? source.productName, brand: brands.join(' / ') || 'Marka belirtilmemiş', fabricName: source.fabricName, gsm: source.gsm, fabricProperties: source.fabricProperties,
        sizeSeries: cut?.sizeSeries ?? first?.sizeSeries ?? 'Yetişkin', sizeDistribution: cut?.sizeDistribution ?? first?.sizeDistribution ?? defaultSizeDistribution(first?.sizeSeries ?? 'Yetişkin'), colors, instructions: source.instructions ?? (source.productDetails ? [source.productDetails] : []), materials: [], enabledStages, stages,
        legacy: { readOnly: readOnly || mismatch, reason: readOnly || mismatch ? 'Bölünmüş üretim veya geçmiş işlem kayıtları korunuyor. Aşağıdaki geçmiş miktarlar değiştirilmez.' : 'Eski kayıtlar korunarak tek ürün kalemine aktarıldı.', productionIds: productions.map((p) => p.id), cuttingIds: cuts.map((c) => c.id), completed: liveCards.length > 0 && liveCards.every((p) => !!p.completion || !!p.stockTransfer) },
      };
    });
    return { workflowVersion: 3, id: `unified:${o.id}`, legacyOrderId: o.id, planNo: o.orderNo, name: o.orderName ?? o.orderNo, customerId: o.orderType === 'Stok İçin Üretim' ? INTERNAL_CUSTOMER_ID : o.customerId ?? '', date: o.date, dueDate: o.dueDate ?? '', customerReference: '', note: o.note, items, revision: o.revision ?? 0, createdAt: o.createdAt, updatedAt: o.updatedAt, archived: o.archived, archivedAt: o.archivedAt, deleted: o.deleted, deletedAt: o.deletedAt };
  })];
}
