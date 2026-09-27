import { useRef, useState } from 'react';
import { orderRepository } from '../../data/production';
import { activeStages, colorKey, deadlineText, stageAvailable, stageInput, stageRecord } from '../../domain/productionPlan';
import type { PlanStage } from '../../domain/productionPlan';
import { differenceText } from '../../domain/productionOrder';
import type { ProductionOrder } from '../../domain/productionOrder';
import { correctionWarning, resultChanged, stagePlan } from '../../domain/productionPlanning';
import type { Contact } from '../contacts/model';
import { Action, Form, Section, Table, companyName } from '../shared/WorkshopUI';
import { CompactNotes } from './ProductionOrderForm';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export const resultLabel = (type: PlanStage) => ({ Kesim: 'Kesimden Çıkan', Nakış: 'Nakıştan Çıkan', Baskı: 'Baskıdan Çıkan', Dikim: 'Dikimden Çıkan', 'Ütü & Paket': 'Ütü/Paketten Çıkan' })[type];
export const startLabel = (type: PlanStage) => ({ Kesim: 'Kesimi Başlat', Nakış: 'Nakışı Başlat', Baskı: 'Baskıyı Başlat', Dikim: 'Dikimi Başlat', 'Ütü & Paket': 'Ütü/Paketi Başlat' })[type];
export const saveStageLabel = (type: PlanStage) => `${type === 'Ütü & Paket' ? 'Ütü/Paket' : type} Sonucunu Kaydet`;

function StageEditor({ order, type, done }: { order: ProductionOrder; type: PlanStage; done: () => void }) {
  const p = order.product, record = stageRecord(p, type)!, source = stageInput(p, type);
  const [notes, setNotes] = useState(record.notes.length ? record.notes : (type === 'Nakış' ? p.embroidery.notes : type === 'Baskı' ? p.printing?.notes ?? [] : ['']));
  const [rows, setRows] = useState(source.map((r) => { const old = record.result?.rows.find((v) => colorKey(v.color) === colorKey(r.color)); return { color: r.color, quantity: old ? String(old.quantity) : '', rollCount: String(old?.rollCount ?? ''), kg: String(old?.kg ?? '') }; }));
  const [dirty, setDirty] = useState(false); const container = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, container);
  const total = (key: 'quantity' | 'rollCount' | 'kg') => rows.reduce((n, r) => n + Number(r[key] || 0), 0), startTotal = source.reduce((n, r) => n + r.quantity, 0);
  const change = (index: number, key: 'quantity' | 'rollCount' | 'kg', value: string) => setRows((rs) => rs.map((r, i) => i === index ? { ...r, [key]: value } : r));
  return <div ref={container} onChangeCapture={() => setDirty(true)}><Form label={saveStageLabel(type)} onDone={() => { setDirty(false); done(); }} onSubmit={async () => {
    const values = rows.map((r) => ({ color: r.color, quantity: Number(r.quantity), ...(type === 'Kesim' ? { ...(r.rollCount ? { rollCount: Number(r.rollCount) } : {}), ...(r.kg ? { kg: Number(r.kg) } : {}) } : {}) }));
    const warning = resultChanged(record.result, { date: '', rows: values }) ? correctionWarning(order, type) : '';
    if (warning && !window.confirm(warning)) throw new Error('Değişiklik iptal edildi.');
    await orderRepository.recordStageResult(order.id, order.revision, type, values, notes.map((s) => s.trim()).filter(Boolean), !!warning);
  }}>
    <Table headers={['Renk', type === 'Kesim' ? 'Sipariş' : 'Başlangıç (otomatik)', resultLabel(type), ...(type === 'Kesim' ? ['Top', 'Kg'] : []), 'Fire / Fark']} rows={[
      ...source.map((r, i) => [r.color, <input className="allocation-input" aria-label={`${r.color} başlangıç`} readOnly value={r.quantity} />, <input className="allocation-input" aria-label={`${r.color} ${type} çıkan`} name={`actual-${i}`} required readOnly={!!p.stockTransfer} type="number" min={0} max={type === 'Kesim' ? undefined : r.quantity} step={1} value={rows[i].quantity} onChange={(e) => change(i, 'quantity', e.target.value)} />, ...(type === 'Kesim' ? [<input className="allocation-input" aria-label={`${r.color} Top`} type="number" min={0} step={1} value={rows[i].rollCount} onChange={(e) => change(i, 'rollCount', e.target.value)} />, <input className="allocation-input" aria-label={`${r.color} Kg`} type="number" min={0} step="0.001" value={rows[i].kg} onChange={(e) => change(i, 'kg', e.target.value)} />] : []), rows[i].quantity === '' ? '—' : differenceText(r.quantity, Number(rows[i].quantity))]),
      ['TOPLAM', startTotal, total('quantity'), ...(type === 'Kesim' ? [total('rollCount'), Number(total('kg').toFixed(3))] : []), rows.some((r) => r.quantity === '') ? '—' : differenceText(startTotal, total('quantity'))],
    ]} />
    <h3>{type} Notu</h3><CompactNotes title={`${type} Notu`} value={notes} onChange={(n) => { setNotes(n); setDirty(true); }} />
    {p.stockTransfer && <p className="ws-hint">Stoğa aktarılan adetler korunur. Firma/tarih planı, top/kg ve notlar düzenlenebilir.</p>}{dirty && <p role="status">Kaydedilmemiş değişiklikler var.</p>}
  </Form></div>;
}

export function OrderStages({ order, contacts, done }: { order: ProductionOrder; contacts: Contact[]; done: () => void }) {
  const p = order.product, closed = order.archived || order.deleted || p.legacy?.readOnly;
  return <Section title="Üretim Aşamaları">{activeStages(p).map((type) => {
    const record = stageRecord(p, type), plan = stagePlan(order, type), source = stageInput(p, type);
    return <details className="plan-stage" key={type} open={!record?.result}><summary><h3>{type} {record?.result ? '✓ Tamamlandı' : record ? '· İşlemde' : '· Bekliyor'}</h3>
      <p>Firma: {companyName(contacts, record?.companyId ?? plan?.companyId ?? '')} · Planlanan Başlangıç: {plan?.plannedStart || '—'} · Termin: {plan?.dueDate || '—'} {plan?.dueDate && `(${deadlineText(plan.dueDate)})`}</p><span className="stage-expand-label">Detayları Aç</span><span className="stage-collapse-label">Detayları Kapat</span></summary>
      {record && !closed ? <StageEditor key={`${order.id}:${order.revision}:${type}`} order={order} type={type} done={done} /> : record?.result ? <Table headers={['Renk', 'Başlangıç', resultLabel(type), 'Fire / Fark']} rows={[...record.result.rows.map((r) => { const initial = source.find((v) => colorKey(v.color) === colorKey(r.color))?.quantity ?? 0; return [r.color, initial, r.quantity, differenceText(initial, r.quantity)]; }), ['TOPLAM', source.reduce((n, r) => n + r.quantity, 0), record.result.rows.reduce((n, r) => n + r.quantity, 0), differenceText(source.reduce((n, r) => n + r.quantity, 0), record.result.rows.reduce((n, r) => n + r.quantity, 0))]]} /> : !closed && stageAvailable(p, type) && plan ? <Action run={() => orderRepository.beginPlannedStage(order.id, order.revision, type)} done={done}>{startLabel(type)}</Action> : <p>{closed ? 'Bu kayıt salt okunur.' : !plan ? 'Önce firma ve tarih planını kaydedin.' : 'Önce önceki aşamanın sonucunu kaydedin.'}</p>}
    </details>;
  })}</Section>;
}
