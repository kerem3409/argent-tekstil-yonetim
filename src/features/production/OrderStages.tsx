import { useRef, useState } from 'react';
import { orderRepository } from '../../data/production';
import { contactRepository } from '../../data/contacts';
import { activeStages, stageAvailable, stageInput, stageRecord } from '../../domain/productionPlan';
import type { PlanStage } from '../../domain/productionPlan';
import { differenceText } from '../../domain/productionOrder';
import type { ProductionOrder } from '../../domain/productionOrder';
import { emptyContact } from '../contacts/model';
import type { Contact } from '../contacts/model';
import { today } from '../products/model';
import { Field, Form, Input, Section, Table, companyName, text } from '../shared/WorkshopUI';
import { CompactNotes } from './ProductionOrderForm';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export const resultLabel = (type: PlanStage) => ({ Kesim: 'Kesimden Gelen', Nakış: 'Nakıştan Gelen', Baskı: 'Baskıdan Gelen', Dikim: 'Dikimden Gelen', 'Ütü & Paket': 'Ütü/Paketten Gelen' })[type];
export const saveStageLabel = (type: PlanStage) => `${type === 'Ütü & Paket' ? 'Ütü/Paket' : type} Bilgilerini Kaydet`;

function StageEditor({ order, type, contacts, done }: { order: ProductionOrder; type: PlanStage; contacts: Contact[]; done: () => void }) {
  const p = order.product, record = stageRecord(p, type), source = stageInput(p, type);
  const [companyId, setCompanyId] = useState(record?.companyId ?? '');
  const [companies, setCompanies] = useState(contacts), [quick, setQuick] = useState(false);
  const [notes, setNotes] = useState(record?.notes ?? (type === 'Nakış' ? p.embroidery.notes : ['']));
  const [rows, setRows] = useState(source.map((r) => ({ color: r.color, quantity: '', rollCount: '', kg: '', date: today() })));
  const [dirty, setDirty] = useState(false); const container = useRef<HTMLDivElement>(null);
  useOrderDirtyGuard(dirty, container);
  const total = (key: 'quantity' | 'rollCount' | 'kg') => rows.reduce((n, r) => n + Number(r[key] || 0), 0);
  const startTotal = source.reduce((n, r) => n + r.quantity, 0);
  const change = (index: number, key: 'quantity' | 'rollCount' | 'kg' | 'date', value: string) => setRows((rs) => rs.map((r, i) => i === index ? { ...r, [key]: value } : r));
  return <div ref={container} onChangeCapture={() => setDirty(true)}>
    {quick && <Section title={`Yeni ${type} Firması`}><Form label="Firma Kaydet" cancel={() => setQuick(false)} onDone={() => setQuick(false)} onSubmit={async (f) => { const c = await contactRepository.create({ ...emptyContact, name: text(f, 'quickCompany'), roles: ['Fasoncu'], services: [type] }); setCompanies((cs) => [...cs, c]); setCompanyId(c.id); setDirty(true); }}><Input label="Firma Adı *" name="quickCompany" required /></Form></Section>}
    <Form label={saveStageLabel(type)} onDone={() => { setDirty(false); done(); }} onSubmit={(f) => orderRepository.saveStage(order.id, order.revision, type, { companyId, date: record?.date ?? text(f, 'date'), notes: notes.map((s) => s.trim()).filter(Boolean), colorNotes: [] }, { date: rows.map((r) => r.date).sort().at(-1)!, rows: rows.map((r) => ({ color: r.color, date: r.date, quantity: Number(r.quantity), ...(type === 'Kesim' ? { ...(r.rollCount ? { rollCount: Number(r.rollCount) } : {}), ...(r.kg ? { kg: Number(r.kg) } : {}) } : {}) })) })}>
      <div className="ws-grid"><div className="inline-choice"><Field label={`${type} Firması *`}><select required value={companyId} disabled={!!record} onChange={(e) => setCompanyId(e.target.value)}><option value="">Seçin</option>{companies.filter((c) => c.id === record?.companyId || (c.status === 'Aktif' && c.roles.includes('Fasoncu') && c.services.includes(type))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>{!record && <button type="button" className="button ws-secondary compact-control" aria-label={`Yeni ${type} Firması`} onClick={() => setQuick(true)}>+</button>}</div><Field label={type === 'Kesim' ? 'Kesim Tarihi *' : 'Başlangıç Tarihi *'}><input name="date" type="date" required readOnly={!!record} defaultValue={record?.date ?? today()} min={order.date} /></Field></div>
      <Table headers={['Renk', type === 'Kesim' ? 'Sipariş' : 'Başlangıç (otomatik)', resultLabel(type), ...(type === 'Kesim' ? ['Top', 'Kg'] : []), 'Fire / Fark', 'Sonuç Tarihi']} rows={[
        ...source.map((r, i) => [r.color, <input className="allocation-input" aria-label={`${r.color} başlangıç`} readOnly value={r.quantity} />, <input className="allocation-input" aria-label={`${r.color} ${type} gelen`} name={`actual-${i}`} required type="number" min={0} max={type === 'Kesim' ? undefined : r.quantity} step={1} value={rows[i].quantity} onChange={(e) => change(i, 'quantity', e.target.value)} />, ...(type === 'Kesim' ? [<input className="allocation-input" aria-label={`${r.color} Top`} type="number" min={0} step={1} value={rows[i].rollCount} onChange={(e) => change(i, 'rollCount', e.target.value)} />, <input className="allocation-input" aria-label={`${r.color} Kg`} type="number" min={0} step="0.001" value={rows[i].kg} onChange={(e) => change(i, 'kg', e.target.value)} />] : []), rows[i].quantity === '' ? '—' : differenceText(r.quantity, Number(rows[i].quantity)), <input aria-label={`${r.color} Sonuç Tarihi`} type="date" required min={record?.date ?? order.date} value={rows[i].date} onChange={(e) => change(i, 'date', e.target.value)} />]),
        ['TOPLAM', startTotal, total('quantity'), ...(type === 'Kesim' ? [total('rollCount'), Number(total('kg').toFixed(3))] : []), rows.some((r) => r.quantity === '') ? '—' : differenceText(startTotal, total('quantity')), '—'],
      ]} />
      <h3>{type} Notu</h3><CompactNotes title={`${type} Notu`} value={notes} onChange={(n) => { setNotes(n); setDirty(true); }} />
      {dirty && <p role="status">Kaydedilmemiş değişiklikler var.</p>}
    </Form>
  </div>;
}

export function OrderStages({ order, contacts, done }: { order: ProductionOrder; contacts: Contact[]; done: () => void }) {
  const product = order.product, closed = order.archived || order.deleted || product.legacy?.readOnly;
  return <Section title="Üretim Aşamaları">{activeStages(product).map((type) => {
    const record = stageRecord(product, type), source = stageInput(product, type), result = record?.result;
    const totals = result ? result.rows.reduce((n, r) => ({ quantity: n.quantity + r.quantity, rollCount: n.rollCount + (r.rollCount ?? 0), kg: n.kg + (r.kg ?? 0) }), { quantity: 0, rollCount: 0, kg: 0 }) : null;
    const start = source.reduce((n, r) => n + r.quantity, 0);
    return <section className="plan-stage" key={type}><h3>{type} {result ? '✓ Tamamlandı' : record ? '· İşlemde' : '· Bekliyor'}</h3>
      {result && totals ? <><p>Firma: {companyName(contacts, record.companyId)} · Başlangıç: {record.date}</p><Table headers={['Renk', type === 'Kesim' ? 'Sipariş' : 'Başlangıç', resultLabel(type), ...(type === 'Kesim' ? ['Top', 'Kg'] : []), 'Fire / Fark', 'Sonuç Tarihi']} rows={[...result.rows.map((r) => [r.color, source.find((v) => v.color === r.color)?.quantity ?? 0, r.quantity, ...(type === 'Kesim' ? [r.rollCount ?? '—', r.kg ?? '—'] : []), differenceText(source.find((v) => v.color === r.color)?.quantity ?? 0, r.quantity), r.date ?? result.date]), ['TOPLAM', start, totals.quantity, ...(type === 'Kesim' ? [totals.rollCount, Number(totals.kg.toFixed(3))] : []), differenceText(start, totals.quantity), result.date]]} /><ol>{record.notes.map((s, i) => <li key={i}>{s}</li>)}</ol></> : !closed && stageAvailable(product, type) ? <StageEditor key={`${order.id}:${order.revision}:${type}`} order={order} type={type} contacts={contacts} done={done} /> : <p>{closed ? 'Bu kayıt salt okunur.' : 'Önce önceki aşamanın sonucunu kaydedin.'}</p>}
    </section>;
  })}</Section>;
}
