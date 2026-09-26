import { createStore } from '../shared/store.ts';
import type { StoragePort, StoreLock } from '../shared/store';
import { createDeletionPin } from './deletionPin.ts';
import { validateWorkflowStore, PRODUCTION_STORAGE_KEY } from './workflowRepository.ts';
import { migratedPlans } from './planMigration.ts';
import { checkDate, requireText, uid } from '../../domain/common.ts';
import { activeStages, colorKey, isInternalPlan, itemStatus, stageAvailable, stageRecord, validateNotes, validatePlanInput } from '../../domain/productionPlan.ts';
import { normalizeProductions } from '../../domain/productionWorkflow.ts';
import type { PlanInput, PlanItem, PlanStage, PlanStageRecord, ProductionPlan } from '../../domain/productionPlan';
import type { WorkflowStore, ProductionLifecycle } from '../../domain/productionWorkflow';
import type { ContactRepository } from '../contacts/repository';
import type { ProductDefinitionRepository } from '../productDefinitions/repository';
import type { ProductRepository } from '../products/repository';

interface Dependencies { contacts: Pick<ContactRepository, 'get'>; definitions: Pick<ProductDefinitionRepository, 'requireActive'>; products: Pick<ProductRepository, 'load' | 'receiveProduction'> }
export type StageInput = Pick<PlanStageRecord, 'companyId' | 'date' | 'notes' | 'colorNotes'>;
export function createPlanRepository(storage: () => StoragePort, deps: Dependencies, lock?: StoreLock) {
  const store = createStore<WorkflowStore>(PRODUCTION_STORAGE_KEY, () => ({ version: 1, plans: [], jobs: [], stages: [], nextPlan: 1, nextJob: 1, nextStage: 1 }), validateWorkflowStore, storage, lock);
  const deletionPin = createDeletionPin(storage, lock);
  async function all(data: WorkflowStore) { return migratedPlans(data, (await deps.products.load()).productionReceipts); }
  function save(data: WorkflowStore, p: ProductionPlan) { p.revision++; p.updatedAt = new Date().toISOString(); data.unifiedPlans = [...(data.unifiedPlans ?? []).filter((v) => v.id !== p.id), p]; return p; }
  async function find(data: WorkflowStore, id: string, revision: number, writable = true) {
    const p = (await all(data)).find((p) => p.id === id);
    if (!p) throw new Error('Üretim planı bulunamadı.');
    if (p.revision !== revision) throw new Error('Plan değişti. Sayfayı yenileyin.');
    if (writable && (p.archived || p.deleted)) throw new Error('Önce planı arşivden / Çöp Kutusundan geri alın.');
    return p;
  }
  function editableItem(p: ProductionPlan, id: string) {
    const i = p.items.find((i) => i.id === id);
    if (!i) throw new Error('Ürün kalemi bulunamadı.');
    if (i.legacy?.readOnly || i.legacy?.completed) throw new Error('Bu ürünün geçmiş işlemleri salt okunur korunuyor.');
    return i;
  }
  async function customer(id: string, previous?: string) {
    if (isInternalPlan({ customerId: id }) || id === previous) return;
    const c = await deps.contacts.get(id);
    if (!c || c.status !== 'Aktif' || !c.roles.includes('Hazır Giyim Müşterisi')) throw new Error('Aktif müşteri seçin.');
  }
  async function items(input: PlanInput, previous?: ProductionPlan): Promise<PlanItem[]> {
    const ids = new Set<string>();
    return Promise.all(input.items.map(async (i) => {
      if (i.id && ids.has(i.id)) throw new Error('Ürün kalemi tekrarlanamaz.'); if (i.id) ids.add(i.id);
      const old = previous?.items.find((v) => v.id === i.id);
      if (i.id && !old) throw new Error('Ürün kalemi kimliği geçersiz.');
      if (old?.stages.length || old?.legacy?.readOnly) throw new Error('İşlemi başlamış ürünün plan bilgileri değiştirilemez.');
      const definition = old?.productDefinitionId === i.productDefinitionId ? { name: old.productName } : await deps.definitions.requireActive(i.productDefinitionId);
      return { ...structuredClone(i), id: old?.id ?? uid(), productName: definition.name, brand: i.brand.trim(), modelName: i.modelName.trim(), fabricName: i.fabricName.trim(), gsm: i.gsm.trim(), colors: i.colors.map((r) => ({ ...r, color: r.color.trim() })), stages: [] };
    }));
  }
  function cascade(data: WorkflowStore, p: ProductionPlan, kind: 'archived' | 'deleted', value: boolean) {
    if (!p.legacyOrderId) return;
    const now = p.updatedAt;
    const order = data.orderCards?.find((o) => o.id === p.legacyOrderId);
    if (order) { order[kind] = value; order[`${kind}At`] = value ? now : null; order.revision = (order.revision ?? 0) + 1; }
    for (const c of data.cuttingOrders ?? []) if (c.orderId === p.legacyOrderId) { c[kind] = value; c[`${kind}At`] = value ? now : null; c.revision++; }
    for (const r of data.productions ?? []) if (p.items.some((i) => i.legacy?.productionIds.includes(r.id))) {
      const by = kind === 'archived' ? 'archivedByOrderId' : 'deletedByOrderId';
      if (value && !r[kind]) { r[kind] = true; r[by] = p.id; r[`${kind}At`] = now; r.revision++; }
      else if (!value && (r[by] === p.id || r[by] === p.legacyOrderId)) { r[kind] = false; r[by] = null; r[`${kind}At`] = null; r.revision++; }
    }
    for (const r of normalizeProductions(data)) if (!(data.productions ?? []).some((v) => v.id === r.id) && p.items.some((i) => i.legacy?.productionIds.includes(r.id))) {
      const by = kind === 'archived' ? 'archivedByOrderId' : 'deletedByOrderId';
      const old: Partial<ProductionLifecycle> = data.productionLifecycle?.[r.id] ?? {};
      if (value && !old[kind]) (data.productionLifecycle ??= {})[r.id] = { ...old, [kind]: true, [by]: p.id, [`${kind}At`]: now, revision: r.revision + 1, updatedAt: now };
      else if (!value && (old[by] === p.id || old[by] === p.legacyOrderId)) (data.productionLifecycle ??= {})[r.id] = { ...old, [kind]: false, [by]: null, [`${kind}At`]: null, revision: r.revision + 1, updatedAt: now };
    }
  }
  return {
    deletionPin,
    async list() { return all(await store.load()); },
    async create(input: PlanInput) {
      validatePlanInput(input); await customer(input.customerId); const products = await items(input);
      return store.transact((data) => { const number = data.nextUnifiedPlan ?? 1, now = new Date().toISOString(); data.nextUnifiedPlan = number + 1;
        const p: ProductionPlan = { ...structuredClone(input), items: products, workflowVersion: 3, id: uid(), planNo: `UP-${String(number).padStart(3, '0')}`, revision: 0, createdAt: now, updatedAt: now };
        (data.unifiedPlans ??= []).push(p); return p;
      });
    },
    async update(id: string, revision: number, input: PlanInput) {
      validatePlanInput(input);
      return store.transact(async (data) => { const p = await find(data, id, revision); await customer(input.customerId, p.customerId);
        if (p.items.some((i) => i.stages.length || i.legacy?.readOnly)) throw new Error('Üretim başladığı için plan bilgileri kilitlidir.');
        const products = await items(input, p); Object.assign(p, structuredClone(input), { items: products }); return save(data, p);
      });
    },
    async startStage(id: string, revision: number, itemId: string, type: PlanStage, input: StageInput) {
      requireText(input.companyId, 'Fasoncu / Firma'); checkDate(input.date); validateNotes(input.notes);
      const c = await deps.contacts.get(input.companyId);
      if (!c || c.status !== 'Aktif' || !c.roles.includes('Fasoncu') || !c.services.includes(type)) throw new Error(`${type} hizmeti veren aktif bir Fasoncu seçin.`);
      return store.transact(async (data) => { const p = await find(data, id, revision), i = editableItem(p, itemId);
        if (!stageAvailable(i, type)) throw new Error('Önce önceki aşamayı tamamlayın.');
        if (stageRecord(i, type)) throw new Error('Bu aşama zaten başladı.');
        const previous = stageRecord(i, activeStages(i)[activeStages(i).indexOf(type) - 1]);
        if (input.date < (previous?.result?.date ?? p.date)) throw new Error('Başlangıç tarihi önceki işlemden önce olamaz.');
        for (const row of input.colorNotes) if (!i.colors.some((r) => colorKey(r.color) === colorKey(row.color)) || row.note.length > 2000) throw new Error('Renk notu geçersiz.');
        i.stages.push({ type, ...structuredClone(input), result: null }); return save(data, p);
      });
    },
    async finishStage(id: string, revision: number, itemId: string, type: PlanStage, result: NonNullable<PlanStageRecord['result']>) {
      checkDate(result.date);
      return store.transact(async (data) => { const p = await find(data, id, revision), i = editableItem(p, itemId), s = stageRecord(i, type);
        if (!s || s.result || !stageAvailable(i, type)) throw new Error('Aşama başlamamış veya zaten tamamlanmış.');
        if (result.date < s.date) throw new Error('Sonuç tarihi başlangıçtan önce olamaz.');
        s.result = structuredClone(result); return save(data, p); // Store validation enforces exact colors and limits.
      });
    },
    async setArchived(id: string, revision: number, value: boolean) { return store.transact(async (data) => { const p = await find(data, id, revision, false); if (p.deleted) throw new Error('Önce Çöp Kutusundan geri alın.'); p.archived = value; p.archivedAt = value ? new Date().toISOString() : null; save(data, p); cascade(data, p, 'archived', value); return p; }); },
    async trash(id: string, revision: number, pin: string) { await deletionPin.verify(pin); return store.transact(async (data) => { const p = await find(data, id, revision, false); p.deleted = true; p.deletedAt = new Date().toISOString(); save(data, p); cascade(data, p, 'deleted', true); return p; }); },
    async restore(id: string, revision: number) { return store.transact(async (data) => { const p = await find(data, id, revision, false); p.deleted = false; p.deletedAt = null; save(data, p); cascade(data, p, 'deleted', false); return p; }); },
    async transfer(id: string, revision: number, itemId: string) {
      return store.transact(async (data) => { const p = await find(data, id, revision), i = editableItem(p, itemId);
        if (!isInternalPlan(p)) throw new Error('Stoğa aktarım ARGENT üretimleri içindir.');
        if (i.stockTransfer) return i.stockTransfer;
        if (itemStatus(i) !== 'Tamamlandı') throw new Error('Önce tüm aşamaları tamamlayın.');
        const result = stageRecord(i, activeStages(i).at(-1)!)!.result!;
        const cut = stageRecord(i, 'Kesim')!.result!;
        const good = result.rows.reduce((n, r) => n + r.quantity, 0);
        const receipt = await deps.products.receiveProduction({ jobId: `unified:${p.id}:${i.id}`, productId: i.id, productDefinitionId: i.productDefinitionId || undefined, productionNo: `${p.planNo}/${p.items.indexOf(i) + 1}`, name: i.modelName, brand: i.brand, fabric: i.fabricName, grammage: i.gsm, sizeSeries: i.sizeSeries,
          colors: result.rows.map((r) => ({ color: r.color, brand: i.brand, size: '', rowId: `${i.id}:${colorKey(r.color)}`, quantity: r.quantity })), waste: cut.rows.reduce((n, r) => n + r.quantity, 0) - good, date: result.date, note: '', unitCostMinor: 0 });
        i.stockTransfer = { stockIds: receipt.stockIds, date: receipt.date }; save(data, p); return i.stockTransfer;
      });
    },
  };
}
