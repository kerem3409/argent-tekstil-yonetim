import { createStore } from '../shared/store.ts';
import type { StoragePort, StoreLock } from '../shared/store';
import { createDeletionPin } from './deletionPin.ts';
import { validateWorkflowStore, PRODUCTION_STORAGE_KEY } from './workflowRepository.ts';
import { migratedOrders } from './orderMigration.ts';
import { checkDate, requireText, uid } from '../../domain/common.ts';
import { activeStages, colorKey, isInternalPlan, itemStatus, stageAvailable, stageInput as stageInputFor, stageRecord, validateNotes, validatePlanInput } from '../../domain/productionPlan.ts';
import { historicalBrandId, validateOrderProduct } from '../../domain/productionOrder.ts';
import type { ProductionBrand, ProductionOrder, ProductionOrderInput, OrderProduct } from '../../domain/productionOrder';
import type { PlanStage, PlanStageRecord } from '../../domain/productionPlan';
import type { WorkflowStore } from '../../domain/productionWorkflow';
import type { ContactRepository } from '../contacts/repository';
import type { ProductDefinitionRepository } from '../productDefinitions/repository';
import type { ProductRepository } from '../products/repository';
import type { StageInput } from './planRepository';
import type { StagePlan } from '../../domain/productionOrder';
import { operationDate, resultChanged, stagePlan } from '../../domain/productionPlanning.ts';
import { productionCosts, validateCostPrices } from '../../domain/productionCosts.ts';
import type { CostPrices } from '../../domain/productionCosts';
import { automaticCostSources, costSources, validateSheetCosts } from '../../domain/generalSheetCosts.ts';
import type { CostSourceData, SheetCostSettings } from '../../domain/generalSheetCosts';
import { validateSampleImages } from '../../domain/sampleImages.ts';
import type { SampleImage } from '../../domain/sampleImages';
import { emptyOrderCosting, validateOrderCosting } from '../../domain/orderCosting.ts';
import type { OrderCosting } from '../../domain/orderCosting';

interface Dependencies { contacts: Pick<ContactRepository, 'get'>; definitions: Pick<ProductDefinitionRepository, 'requireActive'>; products: Pick<ProductRepository, 'load' | 'receiveProduction'>; costData?: () => Promise<CostSourceData> }
export function createOrderRepository(storage: () => StoragePort, deps: Dependencies, lock?: StoreLock) {
  const store = createStore<WorkflowStore>(PRODUCTION_STORAGE_KEY, () => ({ version: 1, plans: [], jobs: [], stages: [], nextPlan: 1, nextJob: 1, nextStage: 1 }), validateWorkflowStore, storage, lock);
  const deletionPin = createDeletionPin(storage, lock);
  async function all(data: WorkflowStore) {
    const receipts = (await deps.products.load()).productionReceipts ?? [];
    const result = migratedOrders(data, receipts);
    result.orders = result.orders.map((o) => { const receipt = receipts.find((r) => r.jobId === o.stockSourceId); return receipt ? { ...o, product: { ...o.product, stockTransfer: { stockIds: receipt.stockIds, date: receipt.date } } } : o; });
    return result;
  }
  function save(data: WorkflowStore, o: ProductionOrder) { o.revision++; o.updatedAt = new Date().toISOString(); data.productionOrders = [...(data.productionOrders ?? []).filter((v) => v.id !== o.id), o]; return o; }
  async function find(data: WorkflowStore, id: string, revision: number, writable = true) {
    const o = (await all(data)).orders.find((o) => o.id === id);
    if (!o) throw new Error('Sipariş bulunamadı.');
    if (o.revision !== revision) throw new Error('Sipariş değişti. Sayfayı yenileyin.');
    if (writable && (o.archived || o.deleted)) throw new Error('Önce siparişi arşivden / Çöp Kutusundan geri alın.'); return o;
  }
  function editable(o: ProductionOrder) { if (o.product.legacy?.readOnly || o.product.legacy?.completed) throw new Error('Bu ürünün eski işlemleri salt okunur korunuyor.'); return o.product; }
  async function customer(id: string, previous?: string) { requireText(id, 'Müşteri'); if (isInternalPlan({ customerId: id }) || id === previous) return; const c = await deps.contacts.get(id); if (!c || c.status !== 'Aktif' || !c.roles.includes('Hazır Giyim Müşterisi')) throw new Error('Aktif müşteri seçin.'); }
  async function company(type: PlanStage, id: string) { const c = await deps.contacts.get(id); if (!c || c.status !== 'Aktif' || !c.roles.includes('Fasoncu') || !c.services.includes(type)) throw new Error(`${type} hizmeti veren aktif bir Fasoncu seçin.`); }
  async function costing(value: OrderCosting | undefined, previous?: OrderCosting) {
    validateOrderCosting(value); if (!value) return;
    const oldIds = [previous?.fabricCompanyId, ...(previous?.extras ?? []).map((r) => r.companyId), ...(previous?.accessories ?? []).map((r) => r.companyId)];
    for (const id of new Set([value.fabricCompanyId, ...value.extras.map((r) => r.companyId), ...value.accessories.map((r) => r.companyId)].filter(Boolean))) {
      const c = await deps.contacts.get(id); if (!c || c.status !== 'Aktif' && !oldIds.includes(id)) throw new Error('Maliyet için kayıtlı aktif firma seçin.');
    }
    if (value.accessories.some((r) => r.materialId)) {
      const materials = (await deps.costData?.())?.materials.records ?? [];
      for (const r of value.accessories.filter((r) => r.materialId)) { const m = materials.find((m) => m.id === r.materialId); if (!m || m.unit !== r.unit || !m.active && !previous?.accessories.some((a) => a.materialId === m.id)) throw new Error('Aksesuar için aynı birimde geçerli malzeme stoku seçin.'); }
    }
  }
  async function brands(data: WorkflowStore): Promise<ProductionBrand[]> {
    const result = [...(data.productionBrands ?? [])];
    const { orders } = await all(data); const stock = await deps.products.load();
    const names = [...orders.map((o) => o.product.brand), ...(stock.records ?? []).map((r) => r.brand)];
    for (const name of names) if (name?.trim() && !result.some((b) => colorKey(b.name) === colorKey(name))) result.push({ id: historicalBrandId(name), name: name.trim() });
    return result;
  }
  async function product(data: WorkflowStore, input: ProductionOrderInput, old?: OrderProduct): Promise<OrderProduct> {
    if ('items' in input || !input.product || Array.isArray(input.product)) throw new Error('Bir sipariş yalnızca tek ürün içerebilir.');
    const b = (await brands(data)).find((b) => b.id === input.product.brandId);
    if (!b) throw new Error('Kayıtlı bir marka seçin.');
    const def = old?.productDefinitionId === input.product.productDefinitionId ? { name: old.productName } : await deps.definitions.requireActive(input.product.productDefinitionId);
    const p: OrderProduct = { ...structuredClone(input.product), id: old?.id ?? uid(), productName: def.name, brand: b.name, stages: [], ...(old?.legacy ? { legacy: old.legacy } : {}) };
    if (old) {
      p.embroidery.colorNotes = structuredClone(old.embroidery.colorNotes);
      if (old.printing && p.printing) p.printing.colorNotes = structuredClone(old.printing.colorNotes);
    }
    validatePlanInput({ ...input, items: [p] }); validateOrderProduct(p);
    if (input.customerNote.length > 2000) throw new Error('Müşteri notu çok uzun.'); return p;
  }
  return {
    deletionPin,
    async load() { return all(await store.load()); },
    async list() { return (await all(await store.load())).orders; },
    async listBrands() { return brands(await store.load()); },
    async saveSampleImages(id: string, revision: number, images: SampleImage[]) {
      validateSampleImages(images);
      return store.transact(async (data) => { const o = await find(data, id, revision); o.product.sampleImages = structuredClone(images); return save(data, o); });
    },
    async saveSheetCosts(id: string, revision: number, settings: SheetCostSettings) {
      validateSheetCosts(settings);
      return store.transact(async (data) => {
        const o = await find(data, id, revision);
        const sourceData = await deps.costData?.(), sources = sourceData ? costSources(sourceData) : [];
        if (settings.sources.some((id) => !sources.some((s) => s.id === id))) throw new Error('Seçilen maliyet kaydı bulunamadı. Kaynakları yenileyin.');
        const other = (await all(data)).orders.find((r) => r.id !== id && (r.sheetCosts?.sources.some((s) => settings.sources.includes(s)) || sourceData && automaticCostSources(r, sourceData, sources).some((s) => settings.sources.includes(s.id))));
        if (other) throw new Error(`Bu maliyet kaydı ${other.orderNo} siparişine bağlı. Aynı hareket iki üretime eklenemez.`);
        o.sheetCosts = structuredClone(settings); return save(data, o);
      });
    },
    async saveDecoration(id: string, revision: number, types: ('Nakış' | 'Baskı')[], embroidery: OrderProduct['embroidery'], printing: OrderProduct['embroidery']) {
      if (new Set(types).size !== types.length || types.some((t) => !['Nakış', 'Baskı'].includes(t))) throw new Error('İşlem türü geçersiz.');
      return store.transact(async (data) => {
        const o = await find(data, id, revision), p = editable(o);
        const changed = ['Nakış', 'Baskı'].some((t) => p.enabledStages.includes(t as PlanStage) !== types.includes(t as 'Nakış' | 'Baskı'));
        if (changed && (p.stockTransfer || p.stages.some((s) => ['Nakış', 'Baskı', 'Dikim', 'Ütü & Paket'].includes(s.type)))) throw new Error('İşlem başladığı için tür değiştirilemez. Teknik bilgiler düzenlenebilir.');
        p.enabledStages = ['Kesim', ...types, 'Dikim', 'Ütü & Paket'];
        p.embroidery = { ...structuredClone(embroidery), notes: embroidery.notes.map((s) => s.trim()).filter(Boolean), colorNotes: p.embroidery.colorNotes };
        p.printing = { ...structuredClone(printing), notes: printing.notes.map((s) => s.trim()).filter(Boolean), colorNotes: p.printing?.colorNotes ?? [] };
        o.stagePlans = o.stagePlans?.filter((s) => p.enabledStages.includes(s.type)); validateOrderProduct(p); return save(data, o);
      });
    },
    async saveCosts(id: string, revision: number, prices: CostPrices, details?: OrderCosting) {
      validateCostPrices(prices);
      return store.transact(async (data) => { const o = await find(data, id, revision); await costing(details ?? o.costing, o.costing); productionCosts(o, prices); o.costPricesMinor = { ...prices }; o.costing = structuredClone(details ?? o.costing ?? emptyOrderCosting()); return save(data, o); });
    },
    async savePlanning(id: string, revision: number, plans: StagePlan[]) {
      for (const p of plans) { await company(p.type, p.companyId); checkDate(p.plannedStart); checkDate(p.dueDate); if (p.dueDate < p.plannedStart) throw new Error('Aşama termini başlangıçtan önce olamaz.'); }
      return store.transact(async (data) => { const o = await find(data, id, revision); editable(o);
        if (new Set(plans.map((p) => p.type)).size !== plans.length || plans.some((p) => !activeStages(o.product).includes(p.type))) throw new Error('Planlanan aşamalar geçersiz.');
        o.stagePlans = [...(o.stagePlans ?? []).filter((p) => !plans.some((n) => n.type === p.type)), ...structuredClone(plans)];
        for (const p of plans) { const started = stageRecord(o.product, p.type); if (started) started.companyId = p.companyId; }
        return save(data, o);
      });
    },
    async beginPlannedStage(id: string, revision: number, type: PlanStage) {
      return store.transact(async (data) => { const o = await find(data, id, revision), p = editable(o), plan = stagePlan(o, type);
        if (!plan) throw new Error('Önce bu aşamanın firma ve tarih planını kaydedin.'); await company(type, plan.companyId);
        if (!stageAvailable(p, type) || stageRecord(p, type)) throw new Error('Aşama zaten başladı veya önceki aşama tamamlanmadı.');
        const now = new Date().toISOString(); o.productionStartedAt ??= now;
        p.stages.push({ type, companyId: plan.companyId, date: operationDate(), actualStartedAt: now, notes: [], colorNotes: [], result: null }); return save(data, o);
      });
    },
    async recordStageResult(id: string, revision: number, type: PlanStage, rows: NonNullable<PlanStageRecord['result']>['rows'], notes: string[], confirmed = false) {
      validateNotes(notes);
      return store.transact(async (data) => { const o = await find(data, id, revision), p = editable(o), s = stageRecord(p, type);
        if (!s || !stageAvailable(p, type)) throw new Error('Önce aşamayı başlatın.');
        const result = { date: operationDate(), rows: rows.map(({ color, quantity, rollCount, kg }) => ({ color, quantity, ...(rollCount !== undefined ? { rollCount } : {}), ...(kg !== undefined ? { kg } : {}) })) };
        const changed = resultChanged(s.result, result), nextIndex = activeStages(p).indexOf(type) + 1;
        if (changed && p.stockTransfer) throw new Error('Stoğa aktarılmış miktar değiştirilemez. Önce stok düzeltme sürecini tamamlayın; firma, tarih, top/kg ve notlar düzenlenebilir.');
        if (changed && nextIndex < activeStages(p).length && !confirmed) throw new Error('Sonraki aşamanın başlangıcı değişecek. Değişikliği onaylayın.');
        if (s.result) (o.resultHistory ??= []).push({ type, changedAt: new Date().toISOString(), previous: structuredClone(s.result) });
        s.result = result; s.notes = [...notes]; s.actualCompletedAt = new Date().toISOString();
        for (const downstream of activeStages(p).slice(nextIndex)) { const record = stageRecord(p, downstream); if (!record?.result) continue;
          const input = stageInputFor(p, downstream);
          if (record.result.rows.some((r) => r.quantity > (input.find((v) => colorKey(v.color) === colorKey(r.color))?.quantity ?? 0))) throw new Error(`${downstream} sonucu yeni başlangıç miktarını aşıyor. Önce ${downstream} sonucunu düzeltin. Hiçbir kayıt değiştirilmedi.`);
        }
        return save(data, o);
      });
    },
    async updateFeatures(id: string, revision: number, features: { dropShoulder: boolean; sideSlit: boolean; instructions: string[] }) {
      validateNotes(features.instructions);
      if (typeof features.dropShoulder !== 'boolean' || typeof features.sideSlit !== 'boolean') throw new Error('Ürün özellikleri geçersiz.');
      return store.transact(async (data) => {
        const o = await find(data, id, revision);
        // Technical instructions may change without touching production quantities or historical records.
        o.product.dropShoulder = features.dropShoulder;
        o.product.sideSlit = features.sideSlit;
        o.product.instructions = [...features.instructions];
        return save(data, o);
      });
    },
    async bulkArchiveAction(selection: { id: string; revision: number }[], action: 'restore' | 'trash' | 'archive', pin = '', source: 'archive' | 'active' = 'archive') {
      if (!selection.length || new Set(selection.map((s) => s.id)).size !== selection.length) throw new Error('Kayıt seçin.');
      if (action === 'trash') await deletionPin.verify(pin);
      return store.transact(async (data) => { const selected = await Promise.all(selection.map((s) => find(data, s.id, s.revision, false)));
        if ((action === 'restore' && source !== 'archive') || (action === 'archive' && source !== 'active') || selected.some((o) => !!o.archived !== (source === 'archive') || o.deleted)) throw new Error('Seçim değişti. Listeyi yenileyin.');
        for (const o of selected) {
          if (action === 'trash') { o.deleted = true; o.deletedAt = new Date().toISOString(); }
          else { o.archived = action === 'archive'; o.archivedAt = o.archived ? new Date().toISOString() : null; }
          save(data, o);
        }
      });
    },
    async startProduction(id: string, revision: number) { return store.transact(async (data) => { const o = await find(data, id, revision); editable(o); if (!o.productionStartedAt) o.productionStartedAt = new Date().toISOString(); return save(data, o); }); },
    async saveStage(id: string, revision: number, type: PlanStage, input: StageInput, result: NonNullable<PlanStageRecord['result']>) {
      requireText(input.companyId, 'Fasoncu / Firma'); checkDate(input.date); checkDate(result.date); validateNotes(input.notes);
      const c = await deps.contacts.get(input.companyId);
      if (!c || c.status !== 'Aktif' || !c.roles.includes('Fasoncu') || !c.services.includes(type)) throw new Error(`${type} hizmeti veren aktif bir Fasoncu seçin.`);
      return store.transact(async (data) => {
        const o = await find(data, id, revision), p = editable(o), previous = stageRecord(p, activeStages(p)[activeStages(p).indexOf(type) - 1]);
        if (!o.productionStartedAt && !p.stages.length && !o.source) throw new Error('Önce Üretime Başla işlemini yapın.');
        if (!stageAvailable(p, type)) throw new Error('Önce önceki aşamayı tamamlayın.');
        const existing = stageRecord(p, type);
        if (existing?.result) throw new Error('Bu aşamanın sonucu zaten kaydedildi.');
        if (existing && (existing.companyId !== input.companyId || existing.date !== input.date)) throw new Error('Başlamış aşamanın firması ve tarihi değiştirilemez.');
        if (input.date < (previous?.result?.date ?? o.date) || result.date < input.date) throw new Error('İşlem tarihlerini kontrol edin.');
        for (const row of result.rows) if (row.date) { checkDate(row.date); if (row.date < input.date || row.date > result.date) throw new Error('Renk sonuç tarihini kontrol edin.'); }
        const record = { type, ...structuredClone(input), colorNotes: [], result: structuredClone(result) };
        p.stages = [...p.stages.filter((s) => s.type !== type), record]; return save(data, o);
      });
    },
    async createBrand(name: string) { requireText(name, 'Marka', 200); return store.transact(async (data) => { const existing = (await brands(data)).find((b) => colorKey(b.name) === colorKey(name)); if (existing) return existing; const b = { id: uid(), name: name.trim() }; (data.productionBrands ??= []).push(b); return b; }); },
    async create(input: ProductionOrderInput, sourceDraftId?: string) {
      await customer(input.customerId);
      validateCostPrices(input.costPricesMinor ?? {}); await costing(input.costing);
      return store.transact(async (data) => { const existing = (await all(data)).orders; const converted = sourceDraftId && existing.find((o) => o.sourceDraftId === sourceDraftId); if (converted) return converted; const p = await product(data, input); let number = data.nextProductionOrder ?? 1;
        const manual = input.orderNo?.trim();
        if (manual && !/^[\p{L}\p{N}][\p{L}\p{N} ._/-]{0,39}$/u.test(manual)) throw new Error('Sipariş No en fazla 40 karakter olmalı; harf, rakam, boşluk, nokta, tire, alt çizgi veya / kullanın.');
        if (manual && existing.some((o) => colorKey(o.orderNo) === colorKey(manual))) throw new Error('Bu sipariş numarası daha önce kullanılmış. Farklı bir numara girin.');
        while (existing.some((o) => colorKey(o.orderNo) === colorKey(`SP-${String(number).padStart(3, '0')}`))) number++;
        if (!manual) data.nextProductionOrder = number + 1; const id = uid(), now = new Date().toISOString();
        const o: ProductionOrder = { name: input.name.trim(), customerId: input.customerId, date: input.date, dueDate: input.dueDate, customerReference: input.customerReference, customerNote: input.customerNote, note: input.note, product: p, workflowVersion: 4, sourceDraftId, id, orderNo: manual || `SP-${String(number).padStart(3, '0')}`, revision: 0, createdAt: now, updatedAt: now, stockSourceId: `order:${id}` };
        if (input.costPricesMinor !== undefined) o.costPricesMinor = { ...input.costPricesMinor }; if (input.costing !== undefined) o.costing = structuredClone(input.costing);
        (data.productionOrders ??= []).push(o); return o;
      });
    },
    async update(id: string, revision: number, input: ProductionOrderInput) { return store.transact(async (data) => { const o = await find(data, id, revision); const i = editable(o); if (i.stages.length) throw new Error('Üretim başladığı için sipariş bilgileri kilitlidir.'); await customer(input.customerId, o.customerId); const p = await product(data, input, i); validateCostPrices(input.costPricesMinor ?? o.costPricesMinor ?? {}); await costing(input.costing ?? o.costing, o.costing); if (input.costPricesMinor !== undefined) o.costPricesMinor = { ...input.costPricesMinor }; if (input.costing !== undefined) o.costing = structuredClone(input.costing); Object.assign(o, { name: input.name.trim(), customerId: input.customerId, date: input.date, dueDate: input.dueDate, customerReference: input.customerReference, customerNote: input.customerNote, note: input.note, product: p }); return save(data, o); }); },
    async startStage(id: string, revision: number, type: PlanStage, input: StageInput) {
      requireText(input.companyId, 'Fasoncu / Firma'); checkDate(input.date); validateNotes(input.notes);
      const c = await deps.contacts.get(input.companyId); if (!c || c.status !== 'Aktif' || !c.roles.includes('Fasoncu') || !c.services.includes(type)) throw new Error(`${type} hizmeti veren aktif bir Fasoncu seçin.`);
      return store.transact(async (data) => { const o = await find(data, id, revision), p = editable(o);
        if (!stageAvailable(p, type)) throw new Error('Önce önceki aşamayı tamamlayın.'); if (stageRecord(p, type)) throw new Error('Bu aşama zaten başladı.');
        const previous = stageRecord(p, activeStages(p)[activeStages(p).indexOf(type) - 1]); if (input.date < (previous?.result?.date ?? o.date)) throw new Error('Başlangıç tarihi önceki işlemden önce olamaz.');
        for (const row of input.colorNotes) if (!p.colors.some((r) => colorKey(r.color) === colorKey(row.color)) || row.note.length > 2000) throw new Error('Renk notu geçersiz.');
        p.stages.push({ type, ...structuredClone(input), result: null }); return save(data, o);
      });
    },
    async finishStage(id: string, revision: number, type: PlanStage, result: NonNullable<PlanStageRecord['result']>) { checkDate(result.date); return store.transact(async (data) => { const o = await find(data, id, revision), p = editable(o), s = stageRecord(p, type); if (!s || s.result || !stageAvailable(p, type)) throw new Error('Aşama başlamamış veya zaten tamamlanmış.'); if (result.date < s.date) throw new Error('Sonuç tarihi başlangıçtan önce olamaz.'); s.result = structuredClone(result); return save(data, o); }); },
    async setArchived(id: string, revision: number, value: boolean) { return store.transact(async (data) => { const o = await find(data, id, revision, false); if (o.deleted) throw new Error('Önce Çöp Kutusundan geri alın.'); o.archived = value; o.archivedAt = value ? new Date().toISOString() : null; return save(data, o); }); },
    async trash(id: string, revision: number, pin: string) { await deletionPin.verify(pin); return store.transact(async (data) => { const o = await find(data, id, revision, false); o.deleted = true; o.deletedAt = new Date().toISOString(); return save(data, o); }); },
    async restore(id: string, revision: number) { return store.transact(async (data) => { const o = await find(data, id, revision, false); o.deleted = false; o.deletedAt = null; return save(data, o); }); },
    async transfer(id: string, revision: number) { return store.transact(async (data) => { const o = await find(data, id, revision), p = editable(o); if (p.stockTransfer) return p.stockTransfer; if (itemStatus(p) !== 'Tamamlandı') throw new Error('Önce bütün aşamaları tamamlayın.');
      const result = stageRecord(p, activeStages(p).at(-1)!)!.result!, cut = stageRecord(p, 'Kesim')!.result!;
      const receipt = await deps.products.receiveProduction({ jobId: o.stockSourceId, productId: p.id, productDefinitionId: p.productDefinitionId || undefined, productionNo: o.orderNo, name: p.modelName, brand: p.brand, fabric: p.fabricName, grammage: p.gsm, sizeSeries: p.sizeSeries, colors: result.rows.map((r) => ({ color: r.color, brand: p.brand, size: '', rowId: `${p.id}:${colorKey(r.color)}`, quantity: r.quantity })), waste: cut.rows.reduce((n, r) => n + r.quantity, 0) - result.rows.reduce((n, r) => n + r.quantity, 0), date: result.date, note: '', unitCostMinor: 0 });
      p.stockTransfer = { stockIds: receipt.stockIds, date: receipt.date }; save(data, o); return p.stockTransfer;
    }); },
  };
}
