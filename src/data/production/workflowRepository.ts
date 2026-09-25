import { createStore } from '../shared/store.ts';
import type { StoragePort, StoreLock } from '../shared/store';
import type { ContactRepository } from '../contacts/repository';
import type { ProductDefinitionRepository } from '../productDefinitions/repository';
import type { ProductRepository } from '../products/repository';
import type { Fabric } from '../../domain/inventory';
import { checkDate, minor, quantity, requireText, uid } from '../../domain/common.ts';
import { validateProductionStore } from './repository.ts';
import { completionTargets, cuttingTotal, cutRows, normalizeOrderCards, normalizeProductions, processes, productionStatuses, sizeSeries, validateCutting, validateNewProduction, validateSizes, validateCommonSizeDistribution, validatePlannedSizes, orderAllocation, workflowStageAmount } from '../../domain/productionWorkflow.ts';
import type { BrandSection, CompletionLine, NewProductionInput, OrderType, Process, ProductionOrderCard, ProductionOrderItem, ProductionRecord, SizeDistribution, WorkflowStage, WorkflowStore } from '../../domain/productionWorkflow';

export type OrderItemInput = Omit<ProductionOrderItem, 'id' | 'productName' | 'totalQuantity'> & { id?: string };
export interface OrderInput { orderType: OrderType; customerId?: string; date: string; note: string; items?: OrderItemInput[] }
export type ProductionUpdate = Pick<ProductionRecord, 'brand' | 'sizeSeries' | 'cutterCompanyId' | 'sewingCompanyId' | 'embroideryCompanyId' | 'printingCompanyId' | 'ironingPackagingCompanyId' | 'fabricProperties' | 'productInstructions' | 'note' | 'plannedSizeDistributions' | 'sizeDistribution'>;
export const PRODUCTION_STORAGE_KEY = 'argent-tekstil.production.v1';
export interface WorkflowStageInput { processType: Process; companyId: string; rowId: string; sentQuantity: number; returnedQuantity: number; priceType: WorkflowStage['priceType']; price: number; sentDate: string; returnDate: string; status: WorkflowStage['status']; note: string }
interface Dependencies {
  contacts: Pick<ContactRepository, 'get'>; definitions: ProductDefinitionRepository; products: ProductRepository;
  fabrics: { load(): Promise<{ records: Fabric[] }> };
}
function validateWorkflowStore(value: unknown) {
  validateProductionStore(value);
  const data = value as WorkflowStore;
  if (data.nextProduction !== undefined && (!Number.isSafeInteger(data.nextProduction) || data.nextProduction < 1)) throw new Error('Üretim sayacı geçersiz.');
  if (data.nextOrder !== undefined && (!Number.isSafeInteger(data.nextOrder) || data.nextOrder < 1)) throw new Error('Sipariş sayacı geçersiz.');
  if (data.orderCards !== undefined && (!Array.isArray(data.orderCards) || data.orderCards.some((o) => !o.id || !o.orderNo || !['Ön Sipariş', 'Stok İçin Üretim'].includes(o.orderType) || !Array.isArray(o.productionCardIds)))) throw new Error('Sipariş kartları geçersiz.');
  if (data.productions === undefined) return;
  if (!Array.isArray(data.productions)) throw new Error('Üretim kayıtları geçersiz.');
  const ids = new Set<string>(); const numbers = new Set<string>(); const stages = new Set<string>();
  for (const p of data.productions) {
    requireText(p.id, 'Üretim kimliği'); requireText(p.productionNo, 'Üretim no'); requireText(p.productName, 'Ürün'); checkDate(p.date);
    if (ids.has(p.id) || numbers.has(p.productionNo) || !productionStatuses.includes(p.status) || !Object.hasOwn(sizeSeries, p.sizeSeries) || !Number.isSafeInteger(p.revision) || p.revision < 0) throw new Error('Üretim kaydı geçersiz.');
    ids.add(p.id); numbers.add(p.productionNo);
    if (!p.cuttingSheet || !Array.isArray(p.cuttingSheet.brandSections) || !Array.isArray(p.sizeDistributions) || !Array.isArray(p.productionStages)) throw new Error('Üretim alanları geçersiz.');
    if (p.cuttingSheet.brandSections.length && !p.legacy) validateCutting(p.cuttingSheet.brandSections, !!p.cuttingSheet.completedAt);
    if (p.sizeDistributions.length) validateSizes(p, p.sizeDistributions);
    for (const s of p.productionStages) {
      if (!s.id || stages.has(s.id)) throw new Error('Aşama kimliği tekrarlanamaz.'); stages.add(s.id);
      quantity(s.sentQuantity, 'Gönderilen', true); quantity(s.returnedQuantity, 'Gelen', true, true);
      if (s.returnedQuantity > s.sentQuantity || !Number.isSafeInteger(workflowStageAmount(s))) throw new Error('Aşama miktarı / tutarı geçersiz.');
    }
  }
}
export function createWorkflowRepository(storage: () => StoragePort, deps: Dependencies, lock?: StoreLock) {
  const store = createStore<WorkflowStore>(PRODUCTION_STORAGE_KEY, () => ({ version: 1, plans: [], jobs: [], stages: [], nextPlan: 1, nextJob: 1, nextStage: 1, productions: [], nextProduction: 1, orderCards: [], nextOrder: 1 }), validateWorkflowStore, storage, lock);
  async function records(data: WorkflowStore) { return normalizeProductions(data, (await deps.products.load()).productionReceipts); }
  async function company(id: string) { if (id && (await deps.contacts.get(id))?.status !== 'Aktif') throw new Error('Aktif bir firma / kişi seçin.'); }
  async function orderItems(items: OrderItemInput[] = [], previous: ProductionOrderItem[] = []) {
    const result: ProductionOrderItem[] = [];
    for (const item of items) {
      const old = previous.find((p) => p.id === item.id);
      const definition = old?.productDefinitionId === item.productDefinitionId ? { name: old.productName } : await deps.definitions.requireActive(item.productDefinitionId);
      requireText(item.modelName ?? old?.modelName ?? old?.productName ?? '', 'Ürün Adı / Model Adı', 200);
      requireText(item.fabricName, 'Kumaş Adı'); requireText(item.gsm, 'Gramaj');
      const colors = new Set<string>(); let total = 0;
      for (const row of item.colorQuantities) { requireText(row.color, 'Renk'); quantity(row.quantity, 'Adet', true); const key = row.color.trim().toLocaleLowerCase('tr-TR'); if (colors.has(key)) throw new Error('Aynı renk bir kez girilebilir.'); colors.add(key); total += row.quantity; }
      if (!total) throw new Error('En az bir renk ve pozitif adet girin.');
      result.push({ ...old, ...item, id: old?.id ?? uid(), modelName: item.modelName?.trim() ?? old?.modelName ?? definition.name, productName: definition.name, totalQuantity: total, fabricName: item.fabricName.trim(), gsm: item.gsm.trim(), fabricProperties: item.fabricProperties?.trim() ?? '', productDetails: item.productDetails?.trim() ?? '', colorQuantities: item.colorQuantities.map((row) => ({ color: row.color.trim(), quantity: row.quantity })) });
    }
    return result;
  }
  const colorKey = (color: string) => color.trim().toLocaleLowerCase('tr-TR');
  async function eligible(id: string, role: string, service?: string) {
    if (!id) return;
    const contact = await deps.contacts.get(id);
    if (!contact || contact.status !== 'Aktif' || !contact.roles?.some((r) => r === role) || (service && !contact.services?.some((s) => s === service))) throw new Error(service ? `${service} hizmeti veren aktif bir Fasoncu seçin.` : `Aktif bir ${role} seçin.`);
  }
  const assignments = [['cutterCompanyId', 'Kesim'], ['embroideryCompanyId', 'Nakış'], ['printingCompanyId', 'Baskı'], ['sewingCompanyId', 'Dikim'], ['ironingPackagingCompanyId', 'Ütü & Paket']] as const;
  async function validateAssignments(input: Partial<ProductionUpdate>, previous?: ProductionRecord) {
    for (const [field, service] of assignments) if (!previous || (input[field] ?? '') !== (previous[field] ?? '')) await eligible(input[field] ?? '', 'Fasoncu', service);
  }
  function open(p: ProductionRecord) { if (p.completion || p.stockTransfer) throw new Error('Tamamlanan üretim değiştirilemez.'); }
  function afterCut(p: ProductionRecord) { open(p); if (!p.cuttingSheet.completedAt) throw new Error('Önce kesim sonucunu kaydedin.'); }
  async function mutate<T>(id: string, revision: number, work: (p: ProductionRecord) => Promise<T> | T) {
    return store.transact(async (data) => {
      const p = (await records(data)).find((p) => p.id === id);
      if (!p) throw new Error('Üretim bulunamadı.');
      if (p.revision !== revision) throw new Error('Kayıt başka bir işlemde değişti. Sayfayı yenileyip tekrar deneyin.');
      const result = await work(p); p.updatedAt = new Date().toISOString(); p.revision++;
      data.productions = [...(data.productions ?? []).filter((r) => r.id !== id), p];
      return result;
    });
  }
  function stageStatus(sent: number, returned: number, status: WorkflowStage['status'], sentDate: string, returnDate: string) {
    quantity(sent, 'Gönderilen adet', true); quantity(returned, 'Gelen adet', true, true); checkDate(sentDate);
    if (returned > sent) throw new Error('Gelen adet gönderilen adedi aşamaz.');
    if (!['İşlemde', 'Kısmi Geldi', 'Tamamlandı'].includes(status)) throw new Error('Aşama durumu seçin.');
    if (status === 'Tamamlandı' && returned !== sent) throw new Error('Onaylamak için gönderilen adedin tamamı dönmüş olmalıdır.');
    if (status === 'Kısmi Geldi' && (returned <= 0 || returned >= sent)) throw new Error('Kısmi dönüş adedi sıfırdan büyük, gönderilenden küçük olmalıdır.');
    if (status === 'İşlemde' && returned > 0) throw new Error('Gelen adet varsa Kısmi Geldi veya Tamamlandı seçin.');
    if (returned || returnDate) { checkDate(returnDate); if (returnDate < sentDate) throw new Error('Dönüş tarihi gönderimden önce olamaz.'); }
  }
  return {
    async list() { const data = await store.load(); return records(data); },
    async listOrders() { const data = await store.load(); return normalizeOrderCards(data, await records(data)); },
    async createOrder(input: OrderInput) {
      if (!['Ön Sipariş', 'Stok İçin Üretim'].includes(input.orderType)) throw new Error('Sipariş türü seçin.');
      checkDate(input.date); if (input.note.length > 2000) throw new Error('Not en fazla 2000 karakter olabilir.');
      if (input.orderType === 'Ön Sipariş' && !input.customerId) throw new Error('Ön siparişte müşteri seçin.');
      if (input.customerId) await eligible(input.customerId, 'Hazır Giyim Müşterisi');
      const items = await orderItems(input.items);
      return store.transact((data) => { const now = new Date().toISOString(); const index = data.nextOrder ?? 1; data.nextOrder = index + 1; const order: ProductionOrderCard = { id: uid(), orderNo: `SP-${String(index).padStart(4, '0')}`, revision: 0, orderType: input.orderType, customerId: input.customerId || undefined, date: input.date, note: input.note.trim(), items, productionCardIds: [], createdAt: now, updatedAt: now }; (data.orderCards ??= []).push(order); return order; });
    },
    async updateOrder(id: string, revision: number, input: OrderInput) {
      return store.transact(async (data) => {
        const all = await records(data);
        const order = normalizeOrderCards(data, all).find((o) => o.id === id);
        if (!order) throw new Error('Sipariş kartı bulunamadı.');
        if ((order.revision ?? 0) !== revision) throw new Error('Sipariş başka bir işlemde değişti. Sayfayı yenileyip tekrar deneyin.');
        if (input.orderType !== order.orderType) throw new Error('Kaydedilmiş sipariş türü değiştirilemez.');
        checkDate(input.date);
        if (input.note.length > 2000) throw new Error('Not en fazla 2000 karakter olabilir.');
        if (input.orderType === 'Ön Sipariş' && !input.customerId) throw new Error('Ön siparişte müşteri seçin.');
        if (input.customerId !== order.customerId) await eligible(input.customerId ?? '', 'Hazır Giyim Müşterisi');
        const ids = (input.items ?? []).flatMap((i) => i.id ? [i.id] : []);
        if (new Set(ids).size !== ids.length || ids.some((id) => !order.items.some((i) => i.id === id))) throw new Error('Sipariş kalemi kimliği geçersiz.');
        const items = await orderItems(input.items, order.items);
        if (!items.length && order.items.length) throw new Error('En az bir sipariş kalemi girin.');
        for (const old of order.items) {
          const next = items.find((i) => i.id === old.id);
          const used = orderAllocation(old, all).filter((r) => r.allocated > 0);
          if (used.length && !next) throw new Error('Üretime aktarılmış sipariş kalemi silinemez.');
          for (const row of used) if ((next?.colorQuantities.find((r) => colorKey(r.color) === colorKey(row.color))?.quantity ?? 0) < row.allocated) throw new Error(`Bu renkten ${row.allocated} adet daha önce üretime aktarılmıştır. Sipariş adedi ${row.allocated}'ün altına düşürülemez. (${row.color})`);
        }
        const updated = { ...order, customerId: input.customerId || undefined, date: input.date, note: input.note.trim(), items, revision: revision + 1, updatedAt: new Date().toISOString() };
        data.orderCards = [...(data.orderCards ?? []).filter((o) => o.id !== id), updated];
        return updated;
      });
    },
    async updateProduction(id: string, revision: number, input: ProductionUpdate) {
      return mutate(id, revision, async (p) => {
        open(p);
        if ((input.brand ?? '').trim() !== (p.brand ?? '').trim()) throw new Error('Marka değişiyorsa yeni Üretim Kartı oluşturulmalıdır.');
        if (!Object.hasOwn(sizeSeries, input.sizeSeries)) throw new Error('Beden serisi seçin.');
        if (p.cuttingSheet.completedAt && input.sizeSeries !== p.sizeSeries) throw new Error('Kesim tamamlandıktan sonra beden serisi değiştirilemez. Beden dağılımını mevcut seri içinde düzenleyin.');
        for (const [field, service] of assignments) {
          if ((input[field] ?? '') === (p[field] ?? '')) continue;
          if ((service === 'Kesim' && p.cuttingSheet.completedAt) || p.productionStages.some((s) => s.processType === service || s.legacyLines?.some((l) => l.operation === service))) throw new Error(`${service} işlemi başladıktan sonra firma değiştirilemez.`);
        }
        await validateAssignments(input, p);
        for (const value of [input.fabricProperties ?? '', input.productInstructions, input.note]) if (typeof value !== 'string' || value.length > 2000) throw new Error('Metin alanları en fazla 2000 karakter olabilir.');
        if (!p.cuttingSheet.completedAt && input.sizeDistribution) validateCommonSizeDistribution(input.sizeSeries, input.sizeDistribution);
        // Explicit allowlist: order links, reserved colors/amounts and posted stage entries never change here.
        p.sizeSeries = input.sizeSeries;
        if (!p.cuttingSheet.completedAt && input.plannedSizeDistributions) p.plannedSizeDistributions = structuredClone(input.plannedSizeDistributions);
        if (!p.cuttingSheet.completedAt && input.sizeDistribution) p.sizeDistribution = structuredClone(input.sizeDistribution);
        for (const [field] of assignments) p[field] = input[field] ?? '';
        p.cuttingCompanyId = p.cutterCompanyId;
        p.fabricProperties = input.fabricProperties?.trim() ?? '';
        p.productInstructions = input.productInstructions.trim(); p.note = input.note.trim();
        return p;
      });
    },
    async create(input: NewProductionInput) {
      validateNewProduction(input); await company(input.cutterCompanyId);
      if (input.orderItemId) { requireText(input.brand!, 'Marka', 200); await validateAssignments(input); }
      const fabric = input.fabricId ? (await deps.fabrics.load()).records.find((f) => f.id === input.fabricId && f.active) : undefined;
      if (input.fabricId && !fabric) throw new Error('Aktif kumaş kaydı seçin.');
      return store.transact(async (data) => {
        const definition = await deps.definitions.requireActive(input.productDefinitionId); const now = new Date().toISOString();
        const index = data.nextProduction ?? 1; data.nextProduction = index + 1;
        const orderId = input.orderCardId; const order = orderId ? (data.orderCards ?? []).find((o) => o.id === orderId) : undefined;
        if (orderId && !order) throw new Error('Sipariş kartı bulunamadı.');
        const item = input.orderItemId ? (order?.items ?? []).find((candidate) => candidate.id === input.orderItemId) : undefined;
        if (input.orderItemId && !item) throw new Error('Sipariş kalemi bulunamadı.');
        if (order?.items?.length && !item) throw new Error('Üretim oluşturmak için sipariş kalemini seçin.');
        const selected = input.selectedColorQuantities ?? [];
        if (item) {
          if (input.productDefinitionId !== item.productDefinitionId) throw new Error('Sipariş kaleminin ürün bağlantısı değiştirilemez.');
          const ordered = new Map(item.colorQuantities.map((row) => [row.color.trim().toLocaleLowerCase('tr-TR'), row.quantity]));
          const used = new Map<string, number>();
          for (const existing of await records(data)) if (existing.orderItemId === item.id) for (const row of existing.selectedColorQuantities ?? []) used.set(row.color.trim().toLocaleLowerCase('tr-TR'), (used.get(row.color.trim().toLocaleLowerCase('tr-TR')) ?? 0) + row.quantity);
          if (!selected.length) throw new Error('Üretime aktarılacak renkleri seçin.');
          for (const row of selected) { const key = row.color.trim().toLocaleLowerCase('tr-TR'); const limit = ordered.get(key); if (limit === undefined) throw new Error('Sipariş kaleminde olmayan renk seçilemez.'); if ((used.get(key) ?? 0) + row.quantity > limit) throw new Error(`${row.color} renk için üretime alınabilecek en fazla miktar ${limit - (used.get(key) ?? 0)} adettir.`); }
        }
        if (input.plannedSizeDistributions) validatePlannedSizes(input.sizeSeries, selected, input.plannedSizeDistributions);
        if (input.sizeDistribution) validateCommonSizeDistribution(input.sizeSeries, input.sizeDistribution);
        const fabricName = item?.fabricName ?? input.fabricName.trim(); const gsm = item?.gsm ?? input.gsm.trim(); const fabricProperties = item?.fabricProperties ?? input.fabricProperties ?? '';
        const p: ProductionRecord = { ...input, id: uid(), productionNo: `UR-${String(index).padStart(5, '0')}`, productId: uid(), productName: item?.modelName ?? item?.productName ?? definition.name, ...(item ? { modelName: item.modelName ?? item.productName } : {}), brand: input.brand?.trim() || 'Marka belirtilmemiş', ...(orderId ? { orderCardId: orderId } : {}), singleBrand: !!input.brand,
          ...(input.orderItemId ? { orderItemId: input.orderItemId } : {}), ...(selected.length ? { selectedColorQuantities: structuredClone(selected) } : {}), fabricName: fabric?.name ?? fabricName, gsm, fabricProperties, productInstructions: item?.productDetails ?? input.productInstructions,
          targetQuantity: input.cuttingMode === 'Hedef Adet' ? input.targetQuantity : null,
          status: 'Kesim Bekliyor', cuttingSheet: { brandSections: input.brand && selected.length ? [{ id: uid(), brandName: input.brand.trim(), rows: selected.map((row) => ({ id: uid(), color: row.color, rollCount: 1, kg: null, quantity: null })) }] : [], completedAt: '' }, sizeDistributions: [], ...(input.sizeDistribution ? { sizeDistribution: structuredClone(input.sizeDistribution) } : {}), productionStages: [], completion: null, stockTransfer: null, createdAt: now, updatedAt: now, revision: 0 };
        (data.productions ??= []).push(p); if (order) { order.productionCardIds.push(p.id); order.updatedAt = now; order.revision = (order.revision ?? 0) + 1; } return p;
      });
    },
    async saveCutting(id: string, revision: number, sections: BrandSection[], results: boolean) {
      validateCutting(sections, results);
      return mutate(id, revision, (p) => {
        open(p);
        if (p.singleBrand && !p.legacy && (sections.length !== 1 || sections[0].brandName.trim().toLocaleLowerCase('tr-TR') !== (p.brand ?? '').trim().toLocaleLowerCase('tr-TR'))) throw new Error('Yeni üretim kartında yalnızca tek marka kullanılabilir.');
        if (p.cuttingSheet.completedAt) throw new Error('Kaydedilmiş kesim sonuçları değiştirilemez.');
        if (p.orderItemId) {
          const selected = p.selectedColorQuantities ?? [];
          const rows = sections.flatMap((s) => s.rows);
          if (rows.length !== selected.length || rows.some((r) => !selected.some((q) => colorKey(q.color) === colorKey(r.color))) || new Set(rows.map((r) => colorKey(r.color))).size !== selected.length) throw new Error('Sipariş kaleminde olmayan renk seçilemez; ayrılan renkler korunmalıdır.');
          for (const row of rows) if ((row.quantity ?? 0) > selected.find((r) => colorKey(r.color) === colorKey(row.color))!.quantity) throw new Error('Kesim adedi bu üretime ayrılan miktarı aşamaz.');
        }
        p.cuttingSheet = { brandSections: structuredClone(sections), completedAt: results ? new Date().toISOString() : '' };
        if (results && p.plannedSizeDistributions?.length && sections.flatMap((s) => s.rows).every((r) => Object.values(p.plannedSizeDistributions!.find((d) => colorKey(d.color) === colorKey(r.color))?.sizes ?? {}).reduce((a, b) => a + b, 0) === r.quantity)) p.sizeDistributions = sections.flatMap((s) => s.rows).map((r) => ({ rowId: r.id, sizes: structuredClone(p.plannedSizeDistributions!.find((d) => colorKey(d.color) === colorKey(r.color))!.sizes) }));
        p.status = results ? 'Kesim Tamamlandı' : 'Kesim Bekliyor';
      });
    },
    async saveSizes(id: string, revision: number, distributions: SizeDistribution[]) {
      return mutate(id, revision, (p) => { afterCut(p); validateSizes(p, distributions); p.sizeDistributions = structuredClone(distributions); });
    },
    async saveCommonSizeDistribution(id: string, revision: number, series: ProductionRecord['sizeSeries'], distribution: Record<string, number>) {
      return mutate(id, revision, (p) => { afterCut(p); if (series !== p.sizeSeries) throw new Error('Kesim sonrası beden serisi değiştirilemez.'); validateCommonSizeDistribution(series, distribution); p.sizeDistribution = structuredClone(distribution); });
    },
    async addStage(id: string, revision: number, input: WorkflowStageInput) {
      await company(input.companyId);
      if (!processes.includes(input.processType)) throw new Error('Kesim sonrası işlem türü seçin.');
      if (!['Adet Fiyatı', 'Toplam Fiyat'].includes(input.priceType)) throw new Error('Fiyat türü seçin.');
      stageStatus(input.sentQuantity, input.returnedQuantity, input.status, input.sentDate, input.returnDate);
      const priceMinor = minor(input.price);
      if (input.note.length > 2000) throw new Error('Not en fazla 2000 karakter olabilir.');
      return mutate(id, revision, async (p) => {
        if (p.orderItemId) await eligible(input.companyId, 'Fasoncu', input.processType);
        afterCut(p); if (input.sentDate < p.date) throw new Error('Gönderim tarihi üretim tarihinden önce olamaz.');
        if (input.processType === 'Dikim') {
          if (p.sewingCompanyId && p.sewingCompanyId !== input.companyId) throw new Error('Bir üretim kartında yalnızca tek dikim firması kullanılabilir.');
          if (!p.sewingCompanyId && input.companyId) p.sewingCompanyId = input.companyId;
        }
        const used = p.productionStages.reduce((sum, s) => sum + (s.legacyLines ? s.legacyLines.filter((l) => l.operation === input.processType).reduce((n, l) => n + l.quantity, 0) : s.processType === input.processType ? s.sentQuantity : 0), 0);
        if (used + input.sentQuantity > cuttingTotal(p)) throw new Error(`${input.processType}: kesim miktarından fazla ürün gönderilemez. Kalan: ${cuttingTotal(p) - used}.`);
        if (input.rowId) {
          const row = cutRows(p).find((r) => r.id === input.rowId);
          if (!row) throw new Error('Marka / renk seçin.');
          const usedColor = p.productionStages.filter((s) => s.processType === input.processType && s.rowId === input.rowId).reduce((n, s) => n + s.sentQuantity, 0);
          if (usedColor + input.sentQuantity > (row.quantity ?? 0)) throw new Error('Bu marka / renk için kesim adedi aşılıyor.');
        } else if (!p.legacy) throw new Error('Gönderilen ürünlerin marka / rengini seçin.');
        const { price: _price, ...stageInput } = input;
        const s: WorkflowStage = { id: uid(), ...stageInput, priceMinor };
        workflowStageAmount(s); p.productionStages.push(s); p.status = 'Üretimde'; return s;
      });
    },
    async receiveStage(id: string, revision: number, stageId: string, returned: number, date: string, status: WorkflowStage['status'], legacyReturned?: number[]) {
      return mutate(id, revision, (p) => {
        afterCut(p); const s = p.productionStages.find((s) => s.id === stageId);
        if (!s) throw new Error('Aşama bulunamadı.'); if (s.status === 'Tamamlandı') throw new Error('Onaylanmış iş değiştirilemez.');
        if (s.legacyLines) {
          if (!legacyReturned || legacyReturned.length !== s.legacyLines.length) throw new Error('Eski aşamadaki her işlem için gelen adet girin.');
          s.legacyLines = s.legacyLines.map((l, i) => { quantity(legacyReturned[i], 'Gelen adet', true, true); if (legacyReturned[i] < l.returned || legacyReturned[i] > l.quantity) throw new Error('Eski işlemde gelen adet sınırı aşıldı.'); return { ...l, returned: legacyReturned[i] }; });
          returned = s.sentQuantity - Math.max(...s.legacyLines.map((l) => l.quantity - l.returned));
        }
        if (returned < s.returnedQuantity) throw new Error('Gelen toplam adet önceki değerden az olamaz.');
        if (s.returnDate && date < s.returnDate) throw new Error('Dönüş tarihi önceki dönüşten önce olamaz.');
        stageStatus(s.sentQuantity, returned, status, s.sentDate, date);
        s.returnedQuantity = returned; s.returnDate = date; s.status = status;
      });
    },
    async complete(id: string, revision: number, lines: CompletionLine[], date: string, note: string) {
      checkDate(date);
      return mutate(id, revision, (p) => {
        afterCut(p);
        if (p.productionStages.some((s) => s.status !== 'Tamamlandı')) throw new Error('Önce bütün üretim aşamalarını tamamlayıp onaylayın.');
        if (!p.legacy || p.sizeDistributions.length) validateSizes(p, p.sizeDistributions);
        if (date < p.date || p.productionStages.some((s) => date < s.returnDate)) throw new Error('Tamamlama tarihi üretim / son dönüş tarihinden önce olamaz.');
        const targets = completionTargets(p); const keys = new Set<string>();
        if (lines.length !== targets.length) throw new Error('Her marka / renk / beden için sonuç girin.');
        for (const line of lines) {
          const key = `${line.rowId}|${line.size}`; if (keys.has(key)) throw new Error('Sonuç satırı tekrarlanamaz.'); keys.add(key);
          const target = targets.find((t) => t.rowId === line.rowId && t.size === line.size);
          quantity(line.good, 'Sağlam', true, true); quantity(line.waste, 'Fire', true, true);
          if (!target || line.good + line.waste !== target.quantity) throw new Error('Her marka / renk / beden için sağlam + fire kesim adedine eşit olmalıdır.');
        }
        if (note.length > 2000) throw new Error('Not en fazla 2000 karakter olabilir.');
        p.completion = { lines: structuredClone(lines), good: lines.reduce((n, l) => n + l.good, 0), waste: lines.reduce((n, l) => n + l.waste, 0), date, note };
        p.status = 'Stoğa Aktarım Bekliyor';
      });
    },
    async transfer(id: string) {
      // Üretim kilidi altında, stok deposunun tekilleştirilmiş makbuzu kullanılır.
      // Stok yazılır ama üretim yazımı başarısız olursa sonraki okumada makbuzdan toparlanır.
      return store.transact(async (data) => {
        const p = (await records(data)).find((p) => p.id === id); if (!p) throw new Error('Üretim bulunamadı.');
        if (p.stockTransfer) {
          data.productions = [...(data.productions ?? []).filter((r) => r.id !== id), p];
          return p.stockTransfer;
        }
        if (!p.completion) throw new Error('Önce üretimi tamamlayın.');
        const rows = cutRows(p); const totalCost = p.productionStages.reduce((sum, s) => sum + workflowStageAmount(s), 0);
        const receipt = await deps.products.receiveProduction({ jobId: p.legacy?.jobId || p.id, productId: p.productId, productDefinitionId: p.productDefinitionId || undefined, productionNo: p.productionNo,
          name: p.productName, brand: '', fabric: p.fabricName, grammage: p.gsm, sizeSeries: p.sizeSeries,
          colors: p.completion.lines.map((l) => ({ color: rows.find((r) => r.id === l.rowId)!.color, brand: rows.find((r) => r.id === l.rowId)!.brandName, size: l.size, rowId: l.rowId, quantity: l.good })),
          waste: p.completion.waste, date: p.completion.date, note: p.completion.note, unitCostMinor: p.completion.good ? Math.round(totalCost / p.completion.good) : 0 });
        p.stockTransfer = { stockIds: receipt.stockIds, date: receipt.date }; p.status = 'Tamamlandı'; p.updatedAt = new Date().toISOString(); p.revision++;
        data.productions = [...(data.productions ?? []).filter((r) => r.id !== id), p]; return p.stockTransfer;
      });
    },
  };
}
export type WorkflowRepository = ReturnType<typeof createWorkflowRepository>;
