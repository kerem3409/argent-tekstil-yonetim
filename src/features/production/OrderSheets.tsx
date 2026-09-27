import { activeStages, stageInput, stageRecord } from '../../domain/productionPlan';
import type { PlanStage } from '../../domain/productionPlan';
import type { ProductionOrder } from '../../domain/productionOrder';
import { Section, Table } from '../shared/WorkshopUI';
import { PlanSizes } from './PlanStages';

export const sheetNames = { Genel: 'Genel Sipariş Föyü', Kesim: 'Kesimci Föyü', Nakış: 'Nakışçı Föyü', Dikim: 'Dikim Föyü', 'Ütü & Paket': 'Ütü / Paket Föyü' } as const;
export type OrderSheet = keyof typeof sheetNames;
export function OrderSheets({ order, print }: { order: ProductionOrder; print: (s: OrderSheet) => void }) {
  return <Section title="Föyler"><div className="ws-tabs">{(Object.keys(sheetNames) as OrderSheet[]).filter((s) => s !== 'Nakış' || order.product.enabledStages.includes('Nakış')).map((s) => <button className="button ws-secondary" key={s} onClick={() => print(s)}>{sheetNames[s]}</button>)}</div><p className="ws-hint">Föyler kayıt veya durum değiştirmez. Fasoncu föylerinde müşteri ve mali bilgiler gösterilmez.</p></Section>;
}
export function OrderTechnicalPrint({ order, type, customerName }: { order: ProductionOrder; type: OrderSheet; customerName: string }) {
  const p = order.product, general = type === 'Genel', stage = !general ? stageRecord(p, type) : undefined;
  const actual = !general ? stageInput(p, type) : p.colors, rows = actual.length ? actual : p.colors;
  const embroidery = general || type === 'Nakış', packaging = general || type === 'Ütü & Paket';
  return <article className="production-paper plan-technical-print"><h1>ARGENT TEKSTİL · {sheetNames[type]}</h1><dl className="production-summary">{[
    ['İş / Sipariş No', order.orderNo], ...(general ? [['Müşteri', customerName], ['Sipariş Adı', order.name], ['Müşteri Referans No', order.customerReference]] : []), ['Marka', p.brand], ['Ürün', p.productName], ['Ürün / Model', p.modelName], ...((general || type === 'Kesim') ? [['Kumaş', p.fabricName], ...(p.gsm ? [['Gramaj', p.gsm]] : []), ['Kumaş Özellikleri', p.fabricProperties]] : []), ['Termin', order.dueDate],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
    <h2>{general || type === 'Kesim' ? 'Renk / İstenen Adet' : actual.length ? 'Renk / Başlangıç Adedi' : 'Renk / Planlanan Adet'}</h2>{!general && type !== 'Kesim' && !actual.length && <p>Önceki aşama tamamlanmadı. Gerçek başlangıç miktarı henüz belli değil.</p>}<Table headers={['Renk', 'Adet']} rows={[...rows.map((r) => [r.color, r.quantity]), ['TOPLAM', rows.reduce((n, r) => n + r.quantity, 0)]]} />
    {(general || type === 'Kesim' || type === 'Dikim') && <><h2>Seri / Beden · {p.sizeSeries}</h2><PlanSizes item={p} /><h2>Ürün Özellikleri</h2><ol>{p.instructions.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
    {embroidery && <><h2>Nakış Bilgileri</h2><ol>{p.embroidery.notes.map((s, i) => <li key={i}>{s}</li>)}</ol><Table headers={['Renk', 'Nakış Rengi / Talimat']} rows={p.embroidery.colorNotes.map((r) => [r.color, r.note])} /><p>Logo Konumu: {p.embroidery.position || '—'} · Ölçü: {p.embroidery.size || '—'}</p><p>{p.embroidery.technicalNote}</p></>}
    {packaging && <><h2>Paket / Ambalaj Bilgisi</h2><dl className="production-summary">{[['Paket Tipi', p.packaging.type], ['Bir Pakette Kaç Ürün', String(p.packaging.unitsPerPack ?? '')], ['Beden', p.packaging.sizeMode], ['Etiketleme', p.packaging.labelingNote], ['Ambalaj Notu', p.packaging.note]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></>}
    {stage && <><h2>{type} Teknik Notları</h2><ol>{stage.notes.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
    {general && <><h2>Genel Notlar</h2><p>{order.customerNote}</p><p>{order.note}</p></>}
  </article>;
}

export function ProductionSummary({ order }: { order: ProductionOrder }) {
  const p = order.product, stages = activeStages(p);
  const total = (type: PlanStage) => stageRecord(p, type)?.result?.rows.reduce((n, r) => n + r.quantity, 0);
  const requested = p.colors.reduce((n, r) => n + r.quantity, 0), complete = total(stages.at(-1)!);
  const cell = (type: PlanStage, color?: string) => {
    const result = stageRecord(p, type)?.result; if (!result) return '—';
    const actual = color ? result.rows.find((r) => r.color === color)?.quantity ?? 0 : total(type)!;
    const input = stageInput(p, type).filter((r) => !color || r.color === color).reduce((n, r) => n + r.quantity, 0);
    return `${actual} (${actual > input ? `+${actual - input} adet` : `${input - actual} fire`})`;
  };
  return <Section title="Üretim Özeti"><Table headers={['Renk', 'Sipariş', ...stages.map((s) => `${s} / Fire`)]} rows={[...p.colors.map((r) => [r.color, r.quantity, ...stages.map((s) => cell(s, r.color))]), ['TOPLAM', requested, ...stages.map((s) => cell(s))]]} /><p>Tamamlanan sağlam ürün: {complete ?? '—'}</p>{complete !== undefined && <p>{complete > requested ? `Siparişten fazla: +${complete - requested} adet` : `Toplam eksik: ${requested - complete}`}</p>}</Section>;
}
