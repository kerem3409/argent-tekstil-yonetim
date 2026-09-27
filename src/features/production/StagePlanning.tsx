import { useRef, useState } from 'react';
import { activeStages, stageRecord } from '../../domain/productionPlan';
import type { PlanStage } from '../../domain/productionPlan';
import type { ProductionOrder, StagePlan } from '../../domain/productionOrder';
import { stagePlan } from '../../domain/productionPlanning';
import { orderRepository } from '../../data/production';
import { contactRepository } from '../../data/contacts';
import { emptyContact } from '../contacts/model';
import type { Contact } from '../contacts/model';
import { Field, Form, Input, Section, text } from '../shared/WorkshopUI';
import { ProductionDialog } from './ProductionDialog';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export function StagePlanning({ order, contacts, done }: { order: ProductionOrder; contacts: Contact[]; done: () => void }) {
  const [plans, setPlans] = useState<StagePlan[]>(activeStages(order.product).map((type) => stagePlan(order, type) ?? { type, companyId: stageRecord(order.product, type)?.companyId ?? '', plannedStart: stageRecord(order.product, type)?.date ?? '', dueDate: '' }));
  const [companies, setCompanies] = useState(contacts), [quick, setQuick] = useState<PlanStage>();
  const [dirty, setDirty] = useState(false); const ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  const change = (type: PlanStage, field: keyof StagePlan, value: string) => { setPlans((ps) => ps.map((p) => p.type === type ? { ...p, [field]: value } : p)); setDirty(true); };
  const closed = order.archived || order.deleted || order.product.legacy?.readOnly;
  return <div ref={ref}><Section title="Üretim Planlama"><p>Genel Sipariş Termini: {order.dueDate || '—'}</p>
    {quick && <ProductionDialog title={`Yeni ${quick} Firması`} close={() => setQuick(undefined)}><Form label="Firma Kaydet" cancel={() => setQuick(undefined)} onDone={() => setQuick(undefined)} onSubmit={async (f) => { const c = await contactRepository.create({ ...emptyContact, name: text(f, 'quickCompany'), roles: ['Fasoncu'], services: [quick] }); setCompanies((cs) => [...cs, c]); change(quick, 'companyId', c.id); }}><Input label="Firma Adı *" name="quickCompany" required /></Form></ProductionDialog>}
    <Form label="Planlamayı Kaydet" onDone={() => { setDirty(false); done(); }} onSubmit={() => orderRepository.savePlanning(order.id, order.revision, plans.filter((p) => p.companyId || p.plannedStart || p.dueDate))}>
      <fieldset disabled={!!closed}>{plans.map((p) => <div className="stage-plan-row" data-stage={p.type} key={p.type}><h3>{p.type}</h3><div className="stage-plan-fields"><div className="inline-choice"><Field label={`${p.type} Firması`}><select value={p.companyId} onChange={(e) => change(p.type, 'companyId', e.target.value)}><option value="">Seçin</option>{companies.filter((c) => c.id === p.companyId || c.status === 'Aktif' && c.roles.includes('Fasoncu') && c.services.includes(p.type)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><button type="button" className="button ws-secondary compact-control" aria-label={`Yeni ${p.type} Firması`} onClick={() => setQuick(p.type)}>+</button></div><Field label={`${p.type} Planlanan Başlangıç Tarihi`}><input type="date" value={p.plannedStart} onChange={(e) => change(p.type, 'plannedStart', e.target.value)} /></Field><Field label={`${p.type} Termin Tarihi`}><input type="date" min={p.plannedStart || undefined} value={p.dueDate} onChange={(e) => change(p.type, 'dueDate', e.target.value)} /></Field></div></div>)}</fieldset>
      <p className="ws-hint">Sonuç girmeden firma, başlangıç ve termin planını kaydedebilirsiniz.</p>{dirty && <p role="status">Kaydedilmemiş değişiklikler var.</p>}
    </Form>
  </Section></div>;
}
