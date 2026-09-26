import { useState } from 'react';
import { planRepository } from '../../data/production';
import { activeStages, stageAvailable, stageInput, stageRecord } from '../../domain/productionPlan';
import type { PlanItem, PlanStage, ProductionPlan } from '../../domain/productionPlan';
import type { Contact } from '../contacts/model';
import { today } from '../products/model';
import { CompanySelect, Form, Input, Section, Table, companyName, text } from '../shared/WorkshopUI';
import { NoteList } from './ProductionPlanForm';
import { sizeSeries } from '../../domain/productionWorkflow';

export function PlanSizes({ item }: { item: PlanItem }) { return <div className="table-scroll"><table className="common-size-table"><thead><tr>{sizeSeries[item.sizeSeries].map((s) => <th key={s}>{s}</th>)}</tr></thead><tbody><tr>{sizeSeries[item.sizeSeries].map((s) => <td key={s}>{item.sizeDistribution[s] ?? 0}</td>)}</tr></tbody></table></div>; }

function StageStart({ plan, item, type, contacts, done }: { plan: ProductionPlan; item: PlanItem; type: PlanStage; contacts: Contact[]; done: () => void }) {
  const [notes, setNotes] = useState<string[]>(['']);
  const source = stageInput(item, type);
  return <Form label={`${type} Başlat`} onDone={done} onSubmit={(f) => planRepository.startStage(plan.id, plan.revision, item.id, type, { companyId: text(f, 'companyId'), date: text(f, 'date'), notes: notes.map((s) => s.trim()).filter(Boolean), colorNotes: source.map((r, i) => ({ color: r.color, note: text(f, `color-note-${i}`) })) })}>
    <div className="ws-grid"><CompanySelect contacts={contacts} role="Fasoncu" service={type} required label={`${type} Firması *`} /><Input label={type === 'Kesim' ? 'Kesim Tarihi *' : 'Başlangıç / Gönderim Tarihi *'} name="date" type="date" value={today()} required /></div>
    <h3>{type} Notları</h3><NoteList title={`${type} Notu`} value={notes} onChange={setNotes} />
    <Table headers={['Ürün Rengi', type === 'Kesim' ? 'İstenen Adet' : 'Başlangıç (otomatik)', type === 'Nakış' ? 'Nakış Rengi / Not' : 'Renk Notu']} rows={source.map((r, i) => [r.color, r.quantity, <input aria-label={`${r.color} ${type} notu`} name={`color-note-${i}`} maxLength={2000} />])} />
  </Form>;
}

export function PlanStages({ plan, item, contacts, done, print }: { plan: ProductionPlan; item: PlanItem; contacts: Contact[]; done: () => void; print: (type: PlanStage) => void }) {
  const closed = plan.archived || plan.deleted || item.legacy?.readOnly;
  return <Section title="Üretim Aşamaları">{activeStages(item).map((type) => {
    const record = stageRecord(item, type), source = stageInput(item, type), enabled = stageAvailable(item, type);
    return <section className="plan-stage" key={type}><h3>{type} {record?.result ? '✓ Tamamlandı' : record ? '· İşlemde' : '· Bekliyor'}</h3>
      {(type === 'Kesim' || (type === 'Nakış' && record)) && <button type="button" className="button ws-secondary" onClick={() => print(type)}>{type === 'Kesim' ? 'Kesimci İçin Çıktı' : 'Nakışçı İçin Çıktı'}</button>}
      {record ? <><p>Firma: {companyName(contacts, record.companyId)} · Başlangıç: {record.date}</p><ol>{record.notes.map((s, i) => <li key={i}>{s}</li>)}</ol>{record.colorNotes.some((r) => r.note) && <Table headers={['Ürün Rengi', type === 'Nakış' ? 'Nakış Rengi / Not' : 'Renk Notu']} rows={record.colorNotes.map((r) => [r.color, r.note || '—'])} />}
        {record.result ? <><p>Sonuç Tarihi: {record.result.date}</p><Table headers={type === 'Kesim' ? ['Renk', 'İstenen', 'Kesimden Gelen', 'Top Sayısı', 'Kg'] : ['Renk', 'Başlangıç', `${type} Gelen`, 'Fark']} rows={record.result.rows.map((r) => [r.color, source.find((v) => v.color === r.color)?.quantity ?? '—', r.quantity, ...(type === 'Kesim' ? [r.rollCount ?? '—', r.kg ?? '—'] : [(source.find((v) => v.color === r.color)?.quantity ?? 0) - r.quantity])])} /></> : !closed && <Form label={`${type} Sonucunu Kaydet`} onDone={done} onSubmit={(f) => planRepository.finishStage(plan.id, plan.revision, item.id, type, { date: text(f, 'resultDate'), rows: source.map((r, i) => ({ color: r.color, quantity: Number(text(f, `actual-${i}`)), ...(type === 'Kesim' ? { ...(text(f, `roll-${i}`) ? { rollCount: Number(text(f, `roll-${i}`)) } : {}), ...(text(f, `kg-${i}`) ? { kg: Number(text(f, `kg-${i}`)) } : {}) } : {}) })) })}>
          <Input label="Sonuç Tarihi *" name="resultDate" type="date" value={today()} min={record.date} required />
          <Table headers={type === 'Kesim' ? ['Renk', 'İstenen', 'Kesimden Gelen', 'Top Sayısı (opsiyonel)', 'Kg (opsiyonel)'] : ['Renk', 'Başlangıç (otomatik)', `${type} Gelen`]} rows={source.map((r, i) => [r.color, <input aria-label={`${r.color} başlangıç`} className="allocation-input" readOnly value={r.quantity} />, <input aria-label={`${r.color} ${type} gelen`} className="allocation-input" name={`actual-${i}`} type="number" min={0} max={type === 'Kesim' ? undefined : r.quantity} step={1} required />, ...(type === 'Kesim' ? [<input aria-label={`${r.color} Top Sayısı`} className="allocation-input" name={`roll-${i}`} type="number" min={0} step={1} />, <input aria-label={`${r.color} Kg`} className="allocation-input" name={`kg-${i}`} type="number" min={0} step="0.001" />] : [])])} />
          <p className="ws-hint">{type === 'Kesim' ? 'Gerçek kesim sonucu istenen adetten fazla olabilir.' : 'Başlangıç miktarı önceki aşamanın sonucudur.'} Kaydedilen sonuç sonraki aşamanın başlangıcı olur.</p>
        </Form>}</> : enabled && !closed ? <StageStart key={`${item.id}:${type}`} plan={plan} item={item} type={type} contacts={contacts} done={done} /> : <p>{closed ? 'Bu kayıt salt okunur.' : 'Önce önceki aşamanın sonucunu kaydedin.'}</p>}
    </section>;
  })}</Section>;
}

// Explicit allowlist: customer, general plan notes and commercial fields never enter this document.
export function PlanTechnicalPrint({ plan, item, type }: { plan: Pick<ProductionPlan, 'planNo' | 'dueDate'>; item: PlanItem; type: PlanStage }) {
  const stage = stageRecord(item, type);
  const rows = type === 'Kesim' ? item.colors : stageInput(item, type);
  return <article className="production-paper plan-technical-print"><h1>ARGENT TEKSTİL · {type === 'Kesim' ? 'KESİM' : 'NAKIŞ'} FÖYÜ</h1><dl className="production-summary">{[['İş / Plan No', plan.planNo], ['Marka', item.brand], ['Ürün Türü', item.productName], ['Ürün / Model', item.modelName], ['Kumaş', item.fabricName], ...(item.gsm ? [['Gramaj', item.gsm]] : []), ['Termin', plan.dueDate || '—'], ...(stage ? [['Başlangıç Tarihi', stage.date]] : [])].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {item.fabricProperties && <p>Kumaş Özellikleri: {item.fabricProperties}</p>}<h2>Ortak Seri · {item.sizeSeries}</h2><PlanSizes item={item} />
    <h2>Renk / {type === 'Kesim' ? 'İstenen Adet' : 'Nakış Başlangıç Adedi'}</h2><Table headers={['Renk', 'Adet']} rows={rows.map((r) => [r.color, r.quantity])} />
    <h2>Ürün Talimatları</h2><ol>{item.instructions.map((s, i) => <li key={i}>{s}</li>)}</ol>
    {stage && <><h2>{type} Notları</h2><ol>{stage.notes.map((s, i) => <li key={i}>{s}</li>)}</ol><Table headers={['Ürün Rengi', type === 'Nakış' ? 'Nakış Rengi / Not' : 'Renk Notu']} rows={stage.colorNotes.map((r) => [r.color, r.note])} /></>}
  </article>;
}
