import { stagePlan } from '../../domain/productionPlanning';
import type { Contact } from '../contacts/model';
import { companyName } from '../shared/WorkshopUI';
import { resultLabel } from './OrderStages';
import { colorKey, stageInput, stageRecord } from '../../domain/productionPlan';
import type { PlanStage } from '../../domain/productionPlan';
import type { ProductionOrder } from '../../domain/productionOrder';
import { Section, Table } from '../shared/WorkshopUI';
import { PlanSizes } from './PlanStages';

export const sheetNames = { Genel: 'Genel Sipariş Föyü', Kesim: 'Kesimci Föyü', Nakış: 'Nakışçı Föyü', Baskı: 'Baskıcı Föyü', Dikim: 'Dikim Föyü', 'Ütü & Paket': 'Ütü / Paket Föyü' } as const;
export type OrderSheet = keyof typeof sheetNames;
const inputLabel: Record<PlanStage, string> = { Kesim: 'Sipariş Adedi', Nakış: 'Nakışa Başlayan', Baskı: 'Baskıya Başlayan', Dikim: 'Dikime Başlayan', 'Ütü & Paket': 'Ütü/Pakete Başlayan' };

function StageQuantityTable({ order, type }: { order: ProductionOrder; type: PlanStage }) {
  const p = order.product, cutting = type === 'Kesim';
  const input = stageInput(p, type), result = stageRecord(p, type)?.result;
  const totalInput = input.length ? input.reduce((n, r) => n + r.quantity, 0) : undefined;
  const totalResult = result?.rows.reduce((n, r) => n + r.quantity, 0);
  const difference = (start: number | undefined, actual: number | undefined) => start === undefined || actual === undefined ? '—' : actual > start ? `Fark +${actual - start}` : `${start - actual} Fire`;
  const cuttingTotal = (key: 'rollCount' | 'kg') => result?.rows.some((r) => r[key] !== undefined) ? Number(result.rows.reduce((n, r) => n + (r[key] ?? 0), 0).toFixed(3)) : '—';
  return <div className="sheet-quantity-table"><h2>Renk / Adet Takibi</h2>
    <Table caption={`${sheetNames[type]} adet takibi`} headers={['Renk', 'Sipariş Adedi', ...(cutting ? [] : [inputLabel[type]]), resultLabel(type), 'Fire / Fark', ...(cutting ? ['Top', 'Kg'] : [])]}
      rows={[...p.colors.map((r) => {
        const start = input.find((v) => colorKey(v.color) === colorKey(r.color))?.quantity;
        const actual = result?.rows.find((v) => colorKey(v.color) === colorKey(r.color));
        return [r.color, r.quantity, ...(cutting ? [] : [start ?? '—']), actual?.quantity ?? '—', difference(cutting ? r.quantity : start, actual?.quantity), ...(cutting ? [actual?.rollCount ?? '—', actual?.kg ?? '—'] : [])];
      }), ['TOPLAM', p.colors.reduce((n, r) => n + r.quantity, 0), ...(cutting ? [] : [totalInput ?? '—']), totalResult ?? '—', difference(totalInput, totalResult), ...(cutting ? [cuttingTotal('rollCount'), cuttingTotal('kg')] : [])]]} />
  </div>;
}

export function OrderSheets({ order, print }: { order: ProductionOrder; print: (s: OrderSheet) => void }) {
  return <Section title="Föyler"><div className="ws-tabs">{(Object.keys(sheetNames) as OrderSheet[]).filter((s) => (s !== 'Nakış' && s !== 'Baskı') || order.product.enabledStages.includes(s)).map((s) => <button className="button ws-secondary" key={s} onClick={() => print(s)}>{sheetNames[s]}</button>)}</div><p className="ws-hint">Föyler kayıt veya durum değiştirmez. Fasoncu föylerinde müşteri ve mali bilgiler gösterilmez.</p></Section>;
}
export function OrderTechnicalPrint({ order, type, customerName, contacts = [] }: { order: ProductionOrder; type: OrderSheet; customerName: string; contacts?: Contact[] }) {
  const p = order.product, general = type === 'Genel', stage = !general ? stageRecord(p, type) : undefined;
  const plan = !general ? stagePlan(order, type) : undefined;
  const embroidery = general || type === 'Nakış', packaging = general || type === 'Ütü & Paket';
  return <article className="production-paper plan-technical-print"><h1>ARGENT TEKSTİL · {sheetNames[type]}</h1><dl className="production-summary">{[
    ['İş / Sipariş No', order.orderNo], ...(general ? [['Müşteri', customerName], ['Sipariş Adı', order.name], ['Müşteri Referans No', order.customerReference]] : []), ['Marka', p.brand], ['Ürün', p.productName], ['Ürün / Model', p.modelName], ...((general || type === 'Kesim') ? [['Kumaş', p.fabricName], ...(p.gsm ? [['Gramaj', p.gsm]] : []), ['Kumaş Özellikleri', p.fabricProperties]] : []), ['Genel Termin', order.dueDate], ...(!general ? [['Atanmış Firma', companyName(contacts, stage?.companyId ?? plan?.companyId ?? '')], ['Planlanan Başlangıç', plan?.plannedStart ?? ''], ['Aşama Termini', plan?.dueDate ?? '']] : []),
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
    {general ? <><h2>Renk / İstenen Adet</h2><Table headers={['Renk', 'Adet']} rows={[...p.colors.map((r) => [r.color, r.quantity]), ['TOPLAM', p.colors.reduce((n, r) => n + r.quantity, 0)]]} /></> : <StageQuantityTable order={order} type={type} />}
    {(general || type === 'Kesim' || type === 'Dikim') && <><h2>Seri / Beden · {p.sizeSeries}</h2><PlanSizes item={p} /><h2>Ürün Özellikleri</h2><p>Düşük Omuz: {p.dropShoulder ? 'Var' : 'Yok'} · Yırtmaç: {p.sideSlit ? 'Var' : 'Yok'}</p><ol>{p.instructions.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
    {embroidery && <><h2>Nakış Bilgileri</h2><ol>{p.embroidery.notes.map((s, i) => <li key={i}>{s}</li>)}</ol><p>Logo Konumu: {p.embroidery.position || '—'} · Ölçü: {p.embroidery.size || '—'}</p><p>{p.embroidery.technicalNote}</p></>}
    {(general || type === 'Baskı') && p.enabledStages.includes('Baskı') && <><h2>Baskı Bilgileri</h2><ol>{p.printing?.notes.map((n, i) => <li key={i}>{n}</li>)}</ol><p>Konum: {p.printing?.position} · Ölçü: {p.printing?.size}</p><p>{p.printing?.technicalNote}</p></>}
    {packaging && <><h2>Paket / Ambalaj Bilgisi</h2><dl className="production-summary">{[['Paket Tipi', p.packaging.type], ['Bir Pakette Kaç Ürün', String(p.packaging.unitsPerPack ?? '')], ['Beden', p.packaging.sizeMode], ['Etiketleme', p.packaging.labelingNote], ['Ambalaj Notu', p.packaging.note]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></>}

    {stage && <><h2>{type} Teknik Notları</h2><ol>{stage.notes.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
    {general && <><h2>Genel Notlar</h2><p>{order.customerNote}</p><p>{order.note}</p></>}
  </article>;
}
