import { checkDate, quantity, requireText } from './common.ts';
import { sizeSeries, validateCommonSizeDistribution } from './productionWorkflow.ts';
import type { CommonSizeDistribution, SizeSeries } from './productionWorkflow';

// A reserved identity; a contact merely named ARGENT is still an external customer.
export const INTERNAL_CUSTOMER_ID = 'system:argent-internal-customer';
export const INTERNAL_CUSTOMER = { id: INTERNAL_CUSTOMER_ID, name: 'ARGENT', isInternalCustomer: true } as const;
export const planStages = ['Kesim', 'Nakış', 'Baskı', 'Dikim', 'Ütü & Paket'] as const;
export type PlanStage = typeof planStages[number];
export interface PlanColor { color: string; quantity: number }
export interface PlanMaterial { name: string; description: string; quantity: string }
export interface PlanStageRecord {
  type: PlanStage; companyId: string; date: string; notes: string[];
  colorNotes: { color: string; note: string }[];
  result: { date: string; rows: { color: string; quantity: number; rollCount?: number; kg?: number }[] } | null;
}
export interface PlanItem {
  id: string; productDefinitionId: string; productName: string; modelName: string; brand: string;
  fabricName: string; gsm: string; fabricProperties: string;
  sizeSeries: SizeSeries; sizeDistribution: CommonSizeDistribution; colors: PlanColor[];
  instructions: string[]; materials: PlanMaterial[]; enabledStages: PlanStage[]; stages: PlanStageRecord[];
  stockTransfer?: { stockIds: string[]; date: string };
  legacy?: { readOnly: boolean; reason: string; productionIds: string[]; cuttingIds: string[]; completed: boolean };
}
export interface ProductionPlan {
  workflowVersion: 3; id: string; planNo: string; name: string; customerId: string;
  date: string; dueDate: string; customerReference: string; note: string; items: PlanItem[];
  revision: number; createdAt: string; updatedAt: string;
  archived?: boolean; archivedAt?: string | null; deleted?: boolean; deletedAt?: string | null;
  legacyOrderId?: string;
}
export type PlanItemInput = Omit<PlanItem, 'id' | 'productName' | 'stages' | 'stockTransfer' | 'legacy'> & { id?: string };
export interface PlanInput { name: string; customerId: string; date: string; dueDate: string; customerReference: string; note: string; items: PlanItemInput[] }
export const isInternalPlan = (p: Pick<ProductionPlan, 'customerId'>) => p.customerId === INTERNAL_CUSTOMER_ID;
export const colorKey = (s: string) => s.trim().toLocaleLowerCase('tr-TR');
export const activeStages = (item: PlanItem) => planStages.filter((s) => item.enabledStages.includes(s));
export const stageRecord = (item: PlanItem, type: PlanStage) => item.stages.find((s) => s.type === type);
export function stageInput(item: PlanItem, type: PlanStage): PlanColor[] {
  const index = activeStages(item).indexOf(type);
  if (index === 0) return item.colors;
  return index > 0 ? stageRecord(item, activeStages(item)[index - 1])?.result?.rows ?? [] : [];
}
export function stageAvailable(item: PlanItem, type: PlanStage) {
  const stages = activeStages(item), index = stages.indexOf(type);
  return index >= 0 && (index === 0 || !!stageRecord(item, stages[index - 1])?.result);
}
export function itemStatus(item: PlanItem) {
  if (item.legacy?.completed || activeStages(item).every((s) => !!stageRecord(item, s)?.result)) return 'Tamamlandı';
  const current = activeStages(item).find((s) => !stageRecord(item, s)?.result)!;
  if (stageRecord(item, current)) return ({ Kesim: 'Kesimde', Nakış: 'Nakışta', Baskı: 'Baskıda', Dikim: 'Dikimde', 'Ütü & Paket': 'Ütü/Pakette' })[current];
  if (!item.stages.length) return 'Planlama';
  const finished = activeStages(item).filter((s) => !!stageRecord(item, s)?.result).at(-1);
  return finished ? `${finished} Tamamlandı` : 'Kesim Bekliyor';
}
export function itemGroup(item: PlanItem) { return itemStatus(item) === 'Tamamlandı' ? 'Tamamlandı' : item.stages.length ? 'Üretimde' : 'Planlama'; }
export function planStatus(plan: ProductionPlan) { return plan.items.length && plan.items.every((i) => itemGroup(i) === 'Tamamlandı') ? 'Tamamlandı' : plan.items.some((i) => i.stages.length) ? 'Üretimde' : 'Planlama'; }
export function currentCompany(item: PlanItem) { return item.stages.find((s) => !s.result)?.companyId ?? ''; }
export function currentStage(item: PlanItem) { return item.legacy?.completed ? 'Tamamlandı' : activeStages(item).find((s) => !stageRecord(item, s)?.result) ?? 'Tamamlandı'; }
export function completedQuantity(item: PlanItem) { return stageRecord(item, activeStages(item).at(-1)!)?.result?.rows.reduce((n, r) => n + r.quantity, 0) ?? 0; }
export function remainingDays(dueDate: string, now = new Date()) {
  if (!dueDate) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`)) / 86400000);
}
export function deadlineText(dueDate: string, now = new Date()) { const days = remainingDays(dueDate, now); return days === null ? 'Termin belirtilmemiş' : days < 0 ? `${-days} gün gecikti` : days === 0 ? 'Bugün' : `${days} gün`; }
export function validateNotes(notes: string[]) { if (!Array.isArray(notes) || notes.length > 50) throw new Error('En fazla 50 madde girin.'); for (const s of notes) requireText(s, 'Madde', 2000); }
export function validatePlanInput(input: PlanInput) {
  requireText(input.name, 'Üretim Planı Adı', 200); requireText(input.customerId, 'Müşteri'); checkDate(input.date); checkDate(input.dueDate);
  if (input.note.length > 2000 || input.customerReference.length > 200) throw new Error('Not veya müşteri referansı çok uzun.');
  if (!input.items.length) throw new Error('En az bir ürün kalemi ekleyin.');
  for (const i of input.items) {
    requireText(i.productDefinitionId, 'Ürün Tanımı'); requireText(i.modelName, 'Ürün / Model Adı', 200); requireText(i.brand, 'Marka', 200); requireText(i.fabricName, 'Kumaş Adı');
    if (!Object.hasOwn(sizeSeries, i.sizeSeries)) throw new Error('Seri seçin.'); validateCommonSizeDistribution(i.sizeSeries, i.sizeDistribution);
    if (!i.colors.length || new Set(i.colors.map((r) => colorKey(r.color))).size !== i.colors.length) throw new Error('Renkler boş veya tekrarlı olamaz.');
    for (const r of i.colors) { requireText(r.color, 'Renk', 100); quantity(r.quantity, 'İstenen Adet', true); }
    validateNotes(i.instructions);
    if (i.materials.length > 100) throw new Error('En fazla 100 malzeme girin.');
    for (const m of i.materials) { requireText(m.name, 'Malzeme adı', 200); if (m.description.length > 2000 || m.quantity.length > 100) throw new Error('Malzeme bilgisi çok uzun.'); }
    if (i.gsm.length > 2000 || i.fabricProperties.length > 2000) throw new Error('Kumaş bilgisi çok uzun.');
    if (!['Kesim', 'Dikim', 'Ütü & Paket'].every((s) => i.enabledStages.includes(s as PlanStage)) || i.enabledStages.some((s) => !planStages.includes(s)) || new Set(i.enabledStages).size !== i.enabledStages.length) throw new Error('Kesim, Dikim ve Ütü/Paket aşamaları gereklidir.');
  }
}

export function validatePlanRecords(plans: ProductionPlan[] | undefined) {
  if (plans === undefined) return;
  if (!Array.isArray(plans)) throw new Error('Üretim planları geçersiz.');
  const ids = new Set<string>();
  for (const p of plans) {
    if (p.workflowVersion !== 3 || !p.id || ids.has(p.id) || !Number.isSafeInteger(p.revision) || p.revision < 0 || !Array.isArray(p.items)) throw new Error('Üretim planı geçersiz.'); ids.add(p.id);
    if (!p.legacyOrderId) validatePlanInput(p);
    const itemIds = new Set<string>();
    for (const i of p.items) {
      if (!i.id || itemIds.has(i.id) || !Array.isArray(i.stages)) throw new Error('Ürün kalemi geçersiz.'); itemIds.add(i.id);
      if (i.legacy?.readOnly) continue;
      const stageIds = new Set<string>();
      for (const s of i.stages) {
        if (stageIds.has(s.type) || !i.enabledStages.includes(s.type) || !stageAvailable(i, s.type)) throw new Error('Aşama sırası geçersiz.'); stageIds.add(s.type);
        checkDate(s.date); validateNotes(s.notes);
        if (s.result) {
          checkDate(s.result.date);
          const source = stageInput(i, s.type);
          if (s.result.rows.length !== source.length || new Set(s.result.rows.map((r) => colorKey(r.color))).size !== source.length) throw new Error('Her renk için sonuç girin.');
          for (const r of s.result.rows) {
            const previous = source.find((v) => colorKey(v.color) === colorKey(r.color));
            quantity(r.quantity, 'Gelen adet', true, true);
            if (!previous || (s.type !== 'Kesim' && r.quantity > previous.quantity)) throw new Error('Gelen adet başlangıç miktarını aşamaz.');
            if (r.rollCount !== undefined) quantity(r.rollCount, 'Top Sayısı', true, true);
            if (r.kg !== undefined) quantity(r.kg, 'Kg', false, true);
          }
        }
      }
    }
  }
}
