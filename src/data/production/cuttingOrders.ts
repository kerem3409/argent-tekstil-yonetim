import type { createStore } from '../shared/store';
import type { WorkflowStore, ProductionRecord, SizeSeries, CommonSizeDistribution } from '../../domain/productionWorkflow';
import { normalizeProductions, validateCommonSizeDistribution } from '../../domain/productionWorkflow.ts';
import { cuttingAllocation, cutProductionAllocation, colorKey, itemInstructions } from '../../domain/cuttingWorkflow.ts';
import type { CuttingOrder } from '../../domain/cuttingWorkflow';
import { checkDate, quantity, requireText, uid } from '../../domain/common.ts';

export interface CuttingInput { orderId: string; orderItemId: string; date: string; cutterCompanyId: string; requested: { color: string; quantity: number }[]; sizeSeries: SizeSeries; sizeDistribution: CommonSizeDistribution; note: string }
export interface CutProductionInput { productionName: string; brand: string; productionDueDate: string; date: string; selectedColorQuantities: { color: string; quantity: number }[]; embroideryCompanyId: string; printingCompanyId: string; sewingCompanyId: string; ironingPackagingCompanyId: string; note: string }
function selectedRows(selected: { color: string; quantity: number }[], available: { color: string; remaining: number }[]) {
  if (!selected.length) throw new Error('En az bir renk için miktar girin.');
  const keys = new Set<string>();
  for (const row of selected) {
    quantity(row.quantity, 'Ayrılan adet', true);
    const key = colorKey(row.color), source = available.find((r) => colorKey(r.color) === key);
    if (keys.has(key) || !source) throw new Error('Kaynakta olmayan veya tekrarlanan renk seçilemez.');
    if (row.quantity > source.remaining) throw new Error(`${row.color}: kalan ${source.remaining} adet aşılamaz.`);
    keys.add(key);
  }
}
export function validateCuttingOrders(data: WorkflowStore) {
  if (data.nextCuttingOrder !== undefined && (!Number.isSafeInteger(data.nextCuttingOrder) || data.nextCuttingOrder < 1)) throw new Error('Kesim emri sayacı geçersiz.');
  if (data.cuttingOrders === undefined) return;
  if (!Array.isArray(data.cuttingOrders)) throw new Error('Kesim emirleri geçersiz.');
  const ids = new Set<string>(), numbers = new Set<string>();
  for (const c of data.cuttingOrders) {
    if (!c.id || !c.cuttingNo || ids.has(c.id) || numbers.has(c.cuttingNo) || !data.orderCards?.some((o) => o.id === c.orderId && o.items.some((i) => i.id === c.orderItemId))) throw new Error('Kesim emri bağlantısı geçersiz.');
    ids.add(c.id); numbers.add(c.cuttingNo);
    if (!['Kesime Hazır / Bekliyor', 'Kesimde', 'Kesim Sonucu Girilmiş'].includes(c.status) || !Number.isSafeInteger(c.revision)) throw new Error('Kesim durumu geçersiz.');
    checkDate(c.date); validateCommonSizeDistribution(c.sizeSeries, c.sizeDistribution);
    selectedRows(c.requested, c.requested.map((r) => ({ ...r, remaining: r.quantity })));
    if (c.result) validateResult(c, c.result);
  }
}
function validateResult(c: CuttingOrder, result: NonNullable<CuttingOrder['result']>) {
  checkDate(result.date);
  if (result.date < c.date) throw new Error('Kesim sonucu tarihi emir tarihinden önce olamaz.');
  if (result.rows.length !== c.requested.length || new Set(result.rows.map((r) => colorKey(r.color))).size !== c.requested.length) throw new Error('Her istenen renk için sonuç girin.');
  for (const r of result.rows) {
    if (!c.requested.some((s) => colorKey(s.color) === colorKey(r.color))) throw new Error('Kesim emrinde olmayan renk eklenemez.');
    quantity(r.rollCount, 'Top Sayısı', true, true); quantity(r.kg, 'Kullanılan Kg', false, true); quantity(r.quantity, 'Çıkan Adet', true, true);
  }
}
export function cuttingOrderMethods(store: ReturnType<typeof createStore<WorkflowStore>>, eligible: (id: string, role: string, service?: string) => Promise<void>) {
  function active(data: WorkflowStore, id: string, revision: number) {
    const c = data.cuttingOrders?.find((c) => c.id === id);
    if (!c) throw new Error('Kesim emri bulunamadı.');
    const order = data.orderCards?.find((o) => o.id === c.orderId);
    if (c.archived || c.deleted || order?.archived || order?.deleted) throw new Error('Önce siparişi arşivden / Çöp Kutusundan geri alın.');
    if (c.revision !== revision) throw new Error('Kesim emri değişti. Sayfayı yenileyin.');
    return c;
  }
  function touch(c: CuttingOrder) { c.updatedAt = new Date().toISOString(); c.revision++; }
  return {
    async listCuttingOrders() { return (await store.load()).cuttingOrders ?? []; },
    async createCuttingOrder(input: CuttingInput) {
      checkDate(input.date); validateCommonSizeDistribution(input.sizeSeries, input.sizeDistribution);
      requireText(input.cutterCompanyId, 'Kesimci'); await eligible(input.cutterCompanyId, 'Fasoncu', 'Kesim');
      if (input.note.length > 2000) throw new Error('Not en fazla 2000 karakter olabilir.');
      return store.transact((data) => {
        const order = data.orderCards?.find((o) => o.id === input.orderId);
        const item = order?.items.find((i) => i.id === input.orderItemId);
        if (!order || !item || order.archived || order.deleted) throw new Error('Aktif sipariş kalemi seçin.');
        if (order.workflowVersion !== 2) throw new Error('Eski siparişlerde mevcut üretim akışını kullanın.');
        selectedRows(input.requested, cuttingAllocation(item, data.cuttingOrders ?? [], normalizeProductions(data)));
        const now = new Date().toISOString(), index = data.nextCuttingOrder ?? 1;
        const c: CuttingOrder = { ...structuredClone(input), id: uid(), cuttingNo: `KE-${String(index).padStart(5, '0')}`, workflowVersion: 2, createdAt: now, updatedAt: now, revision: 0,
          productDefinitionId: item.productDefinitionId, productName: item.productName, modelName: item.modelName ?? item.productName, fabricName: item.fabricName, gsm: item.gsm, fabricProperties: item.fabricProperties, instructions: itemInstructions(item), status: 'Kesime Hazır / Bekliyor', result: null };
        data.nextCuttingOrder = index + 1; (data.cuttingOrders ??= []).push(c);
        order.revision = (order.revision ?? 0) + 1; order.updatedAt = now;
        return c;
      });
    },
    async startCuttingOrder(id: string, revision: number) {
      return store.transact((data) => { const c = active(data, id, revision); if (c.status !== 'Kesime Hazır / Bekliyor') throw new Error('Kesim zaten başladı.'); c.status = 'Kesimde'; touch(c); });
    },
    async saveCuttingOrderResult(id: string, revision: number, result: NonNullable<CuttingOrder['result']>) {
      return store.transact((data) => { const c = active(data, id, revision); if (c.result) throw new Error('Kaydedilmiş kesim sonucu değiştirilemez.'); validateResult(c, result); c.result = structuredClone(result); c.status = 'Kesim Sonucu Girilmiş'; touch(c); });
    },
    async createProductionFromCut(id: string, revision: number, input: CutProductionInput) {
      requireText(input.productionName, 'Üretim Adı', 200); requireText(input.brand, 'Marka', 200); checkDate(input.date); checkDate(input.productionDueDate);
      if (input.note.length > 2000) throw new Error('Not en fazla 2000 karakter olabilir.');
      for (const [field, service] of [['embroideryCompanyId', 'Nakış'], ['printingCompanyId', 'Baskı'], ['sewingCompanyId', 'Dikim'], ['ironingPackagingCompanyId', 'Ütü & Paket']] as const) await eligible(input[field], 'Fasoncu', service);
      return store.transact((data) => {
        const c = active(data, id, revision);
        if (!c.result) throw new Error('Üretim Kartı için önce Kesim Sonucu kaydedilmelidir.');
        if (input.date < c.result.date) throw new Error('Üretim tarihi kesim sonucundan önce olamaz.');
        selectedRows(input.selectedColorQuantities, cutProductionAllocation(c, normalizeProductions(data)));
        const now = new Date().toISOString(), index = data.nextProduction ?? 1;
        const p: ProductionRecord = { ...structuredClone(input), productionName: input.productionName.trim(), brand: input.brand.trim(), id: uid(), productionNo: `UR-${String(index).padStart(5, '0')}`, workflowVersion: 2, cuttingOrderId: c.id, orderCardId: c.orderId, orderItemId: c.orderItemId,
          productDefinitionId: c.productDefinitionId, productId: uid(), productName: c.modelName, modelName: c.modelName, fabricId: '', fabricName: c.fabricName, gsm: c.gsm, fabricProperties: c.fabricProperties,
          productInstructions: c.instructions.join('\n'), sizeSeries: c.sizeSeries, sizeDistribution: structuredClone(c.sizeDistribution), cutterCompanyId: c.cutterCompanyId, cuttingCompanyId: c.cutterCompanyId,
          singleBrand: true, cuttingMode: 'Hedef Adet', targetQuantity: input.selectedColorQuantities.reduce((n, r) => n + r.quantity, 0), status: 'Kesim Tamamlandı',
          cuttingSheet: { completedAt: c.result.date, brandSections: [{ id: uid(), brandName: input.brand.trim(), rows: input.selectedColorQuantities.map((r) => ({ id: uid(), color: r.color, quantity: r.quantity, rollCount: null, kg: null })) }] },
          sizeDistributions: [], productionStages: [], completion: null, stockTransfer: null, createdAt: now, updatedAt: now, revision: 0 };
        data.nextProduction = index + 1; (data.productions ??= []).push(p); touch(c);
        const order = data.orderCards!.find((o) => o.id === c.orderId)!; order.productionCardIds.push(p.id); order.revision = (order.revision ?? 0) + 1; order.updatedAt = now;
        return p;
      });
    },
    async setItemGsm(orderId: string, revision: number, itemId: string, gsm: string) {
      if (gsm.length > 2000) throw new Error('Gramaj çok uzun.');
      return store.transact((data) => {
        const order = data.orderCards?.find((o) => o.id === orderId), item = order?.items.find((i) => i.id === itemId);
        if (!order || !item || order.deleted || order.archived || (order.revision ?? 0) !== revision) throw new Error('Sipariş değişti veya aktif değil. Yenileyin.');
        item.gsm = gsm.trim(); order.revision = revision + 1; order.updatedAt = new Date().toISOString();
        // Existing instructions are snapshots; only the explicitly edited grammage propagates.
        for (const c of data.cuttingOrders ?? []) if (c.orderId === orderId && c.orderItemId === itemId) { c.gsm = item.gsm; touch(c); }
        for (const p of data.productions ?? []) if (p.workflowVersion === 2 && p.orderItemId === itemId) { p.gsm = item.gsm; p.revision++; p.updatedAt = order.updatedAt; }
      });
    },
  };
}
