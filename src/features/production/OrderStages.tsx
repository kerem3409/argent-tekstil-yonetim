import { actualProductionCosts } from '../../domain/orderCosting';
import { costMoney } from '../../domain/productionCosts';
import { inventory } from '../../data/inventory';
import { financeRepository } from '../../data/finance';
import { productionRepository } from '../../data/production';
import { stageGroups } from '../../domain/productionPresentation';
import { contactRepository } from '../../data/contacts';
import { emptyContact } from '../contacts/model';
import { ProductionDialog } from './ProductionDialog';
import { Field, Input, text } from '../shared/WorkshopUI';
import { operationDate } from '../../domain/productionPlanning';
import { useRef, useState } from 'react';
import { orderRepository } from '../../data/production';
import { colorKey, stageAvailable, stageInput, stageRecord } from '../../domain/productionPlan';
import type { PlanStage } from '../../domain/productionPlan';
import { differenceText } from '../../domain/productionOrder';
import type { ProductionOrder } from '../../domain/productionOrder';
import { correctionWarning, resultChanged, stagePlan } from '../../domain/productionPlanning';
import type { Contact } from '../contacts/model';
import { Form, Table, useResource } from '../shared/WorkshopUI';
import { CompactNotes } from './ProductionOrderForm';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export const resultLabel = (type: PlanStage) => ({ Kesim: 'Kesimden Çıkan', Nakış: 'Nakıştan Çıkan', Baskı: 'Baskıdan Çıkan', Dikim: 'Dikimden Çıkan', 'Ütü & Paket': 'Ütü/Paketten Çıkan' })[type];
export const startLabel = (type: PlanStage) => ({ Kesim: 'Kesimi Başlat', Nakış: 'Nakışı Başlat', Baskı: 'Baskıyı Başlat', Dikim: 'Dikimi Başlat', 'Ütü & Paket': 'Ütü/Paketi Başlat' })[type];
export const saveStageLabel = (type: PlanStage) => `${type === 'Ütü & Paket' ? 'Ütü/Paket' : type} Sonucunu Kaydet`;

export function StageEditor({ order, type, done }: { order: ProductionOrder; type: PlanStage; done: () => void }) {
  const p = order.product, record = stageRecord(p, type)!, source = stageInput(p, type);
  const [notes, setNotes] = useState(record.notes.length ? record.notes : (type === 'Nakış' ? p.embroidery.notes : type === 'Baskı' ? p.printing?.notes ?? [] : ['']));
  const [rows, setRows] = useState(source.map((r) => { const old = record.result?.rows.find((v) => colorKey(v.color) === colorKey(r.color)); return { color: r.color, quantity: old ? String(old.quantity) : '', rollCount: String(old?.rollCount ?? ''), kg: String(old?.kg ?? '') }; }));
  const [dirty, setDirty] = useState(false); const container = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, container);
  const costData = useResource(async () => { const [fabrics, materials, production, finance] = await Promise.all([inventory.fabrics.load(), inventory.materials.load(), productionRepository.load(), financeRepository.load()]); return { fabrics, materials, production, finance }; });
  let preview: ReturnType<typeof actualProductionCosts> | undefined;
  if (rows.every((r) => r.quantity !== '' && Number.isSafeInteger(Number(r.quantity)) && Number(r.quantity) >= 0)) {
    try { preview = actualProductionCosts({ ...order, product: { ...p, stages: p.stages.map((s) => s.type === type ? { ...s, result: { date: record.result?.date ?? record.date, rows: rows.map((r) => ({ color: r.color, quantity: Number(r.quantity), ...(r.kg ? { kg: Number(r.kg) } : {}) })) } } : s) } }, costData.data); } catch { /* Invalid unfinished inputs have no estimate. */ }
  }
  const total = (key: 'quantity' | 'rollCount' | 'kg') => rows.reduce((n, r) => n + Number(r[key] || 0), 0), startTotal = source.reduce((n, r) => n + r.quantity, 0);
  const change = (index: number, key: 'quantity' | 'rollCount' | 'kg', value: string) => setRows((rs) => rs.map((r, i) => i === index ? { ...r, [key]: value } : r));
  return <div ref={container} onChangeCapture={() => setDirty(true)}><Form label={record.result ? saveStageLabel(type) : `${type === 'Ütü & Paket' ? 'Paket' : type} Tamamla`} onDone={() => { setDirty(false); done(); }} onSubmit={async () => {
    const values = rows.map((r) => ({ color: r.color, quantity: Number(r.quantity), ...(type === 'Kesim' ? { ...(r.rollCount ? { rollCount: Number(r.rollCount) } : {}), ...(r.kg ? { kg: Number(r.kg) } : {}) } : {}) }));
    const warning = resultChanged(record.result, { date: '', rows: values }) ? correctionWarning(order, type) : '';
    if (warning && !window.confirm(warning)) throw new Error('Değişiklik iptal edildi.');
    await orderRepository.recordStageResult(order.id, order.revision, type, values, notes.map((s) => s.trim()).filter(Boolean), !!warning);
  }}>
    <Table headers={['Renk', type === 'Kesim' ? 'Sipariş' : 'Başlangıç (otomatik)', resultLabel(type), ...(type === 'Kesim' ? ['Top', 'Kg'] : []), 'Fire / Fark']} rows={[
      ...source.map((r, i) => [r.color, <input className="allocation-input" aria-label={`${r.color} başlangıç`} readOnly value={r.quantity} />, <input className="allocation-input" aria-label={`${r.color} ${type} çıkan`} name={`actual-${i}`} required readOnly={!!p.stockTransfer} type="number" min={0} max={type === 'Kesim' ? undefined : r.quantity} step={1} value={rows[i].quantity} onChange={(e) => change(i, 'quantity', e.target.value)} />, ...(type === 'Kesim' ? [<input className="allocation-input" aria-label={`${r.color} Top`} type="number" min={0} step={1} value={rows[i].rollCount} onChange={(e) => change(i, 'rollCount', e.target.value)} />, <input className="allocation-input" aria-label={`${r.color} Kg`} type="number" min={0} step="0.001" value={rows[i].kg} onChange={(e) => change(i, 'kg', e.target.value)} />] : []), rows[i].quantity === '' ? '—' : differenceText(r.quantity, Number(rows[i].quantity))]),
      ['TOPLAM', startTotal, total('quantity'), ...(type === 'Kesim' ? [total('rollCount'), Number(total('kg').toFixed(3))] : []), rows.some((r) => r.quantity === '') ? '—' : differenceText(startTotal, total('quantity'))],
    ]} />
    {preview?.unit !== undefined && costData.data && <p role="status">Güncel / Tahmini Birim Maliyet: <strong>{costMoney(preview.unit)}</strong>{preview.missing.length > 0 && ' · Eksik maliyet kaynakları var'}</p>}
    <h3>{type} Notu</h3><CompactNotes title={`${type} Notu`} value={notes} onChange={(n) => { setNotes(n); setDirty(true); }} />
    {p.stockTransfer && <p className="ws-hint">Stoğa aktarılan adetler korunur. Firma/tarih planı, top/kg ve notlar düzenlenebilir.</p>}{dirty && <p role="status">Kaydedilmemiş değişiklikler var.</p>}
  </Form></div>;
}

export function OrderStages({ order, contacts, done }: { order: ProductionOrder; contacts: Contact[]; done: () => void }) {
  const p = order.product, closed = order.archived || order.deleted || p.legacy?.readOnly;
  return <div className="production-process">{stageGroups(p).map((group) => <section className="plan-stage" key={group.name}><h3>{group.types.some((t) => t === 'Baskı' || t === 'Nakış') ? 'Uygulama' : group.name === 'Ütü & Paket' ? 'Paket' : group.name}</h3>{group.types.map((type) => <ProcessStage key={`${order.id}:${order.revision}:${type}`} order={order} contacts={contacts} type={type} closed={!!closed} done={done} />)}</section>)}</div>;
}

function ProcessStage({ order, contacts, type, closed, done }: { order: ProductionOrder; contacts: Contact[]; type: PlanStage; closed: boolean; done: () => void }) {
  const startRequested = useRef(false);
  const record = stageRecord(order.product, type), plan = stagePlan(order, type);
  const [companyId, setCompany] = useState(plan?.companyId ?? record?.companyId ?? ''), [dueDate, setDue] = useState(plan?.dueDate ?? order.dueDate);
  const [companies, setCompanies] = useState(contacts), [quick, setQuick] = useState(false);
  const [dirty, setDirty] = useState(false), ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  return <div className="stage-operation" data-operation={type} data-stage={type} ref={ref} onInvalidCapture={() => { startRequested.current = false; }} onClickCapture={(e) => { if ((e.target as HTMLElement).textContent === 'Planı Kaydet') startRequested.current = false; }}>
    {(type === 'Baskı' || type === 'Nakış') && <h4>{type}</h4>}
    <fieldset disabled={closed}>{quick && <ProductionDialog title={`Yeni ${type} Firması`} close={() => setQuick(false)}><Form label="Firma Kaydet" cancel={() => setQuick(false)} onDone={() => setQuick(false)} onSubmit={async (f) => { const c = await contactRepository.create({ ...emptyContact, name: text(f, 'quickCompany'), roles: ['Fasoncu'], services: [type] }); setCompanies((cs) => [...cs, c]); setCompany(c.id); setDirty(true); }}><Input label="Firma Adı *" name="quickCompany" required /></Form></ProductionDialog>}
    <Form label="Planı Kaydet" leadingAction={!record && <button className="button" onClick={() => { startRequested.current = true; }} disabled={!stageAvailable(order.product, type)}>Başlat</button>} onDone={() => { setDirty(false); done(); }} onSubmit={async () => {
      const start = startRequested.current; startRequested.current = false;
      const input = { type, companyId, dueDate, plannedStart: plan?.plannedStart || record?.date || operationDate() };
      if (start && !record) await orderRepository.beginPlannedStage(order.id, order.revision, type, input);
      else await orderRepository.savePlanning(order.id, order.revision, [input]);
    }}><fieldset><div className="stage-plan-fields">
      <div className="inline-choice"><Field label={`${type} Firması`}><select required value={companyId} onChange={(e) => { setCompany(e.target.value); setDirty(true); }}><option value="">Firma seçin</option>{companies.filter((c) => c.id === companyId || c.status === 'Aktif' && c.roles.includes('Fasoncu') && c.services.includes(type)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><button type="button" className="button ws-secondary compact-control" aria-label={`Yeni ${type} Firması`} onClick={() => setQuick(true)}>+</button></div>
      <Field label={`${type} Termin Tarihi`}><input required type="date" min={plan?.plannedStart || record?.date || undefined} value={dueDate} onChange={(e) => { setDue(e.target.value); setDirty(true); }} /></Field>
      <p role="status">{record?.result ? '✓ Tamamlandı' : record ? 'Devam ediyor' : stageAvailable(order.product, type) ? 'Bekliyor' : 'Önceki aşama bekleniyor'}</p>
    </div></fieldset></Form></fieldset>
    {record && !closed ? <details open={!record.result}><summary>{record.result ? 'Sonucu Düzenle' : 'Gerçekleşen Adetler'}</summary><StageEditor order={order} type={type} done={done} /></details> : record?.result ? <Table headers={['Renk', 'Gerçekleşen']} rows={record.result.rows.map((r) => [r.color, r.quantity])} /> : null}
  </div>;
}
