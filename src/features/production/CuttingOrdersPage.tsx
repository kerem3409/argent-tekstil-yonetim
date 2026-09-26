import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { workflowRepository } from '../../data/production';
import type { CuttingOrder } from '../../domain/cuttingWorkflow';
import { cuttingAllocation, cutProductionAllocation } from '../../domain/cuttingWorkflow';
import { defaultSizeDistribution, sizeSeries } from '../../domain/productionWorkflow';
import type { ProductionOrderCard, ProductionOrderItem, ProductionRecord, SizeSeries } from '../../domain/productionWorkflow';
import type { Contact } from '../contacts/model';
import { Action, CompanySelect, Field, Form, Input, Page, Section, Table, companyName, text, useCompanies, useResource } from '../shared/WorkshopUI';
import { today } from '../products/model';
import { PlannedSizes } from './ProductionCardEditor';
import './production.css';

export function CuttingOrderForm({ order, item, cuts, cards, contacts, done }: { order: ProductionOrderCard; item: ProductionOrderItem; cuts: CuttingOrder[]; cards: ProductionRecord[]; contacts: Contact[]; done: () => void }) {
  const [series, setSeries] = useState<SizeSeries>('Yetişkin');
  const [sizes, setSizes] = useState(defaultSizeDistribution('Yetişkin'));
  const rows = cuttingAllocation(item, cuts, cards);
  return <Section title="Kesim Emri Oluştur"><p>{order.orderNo} · {item.modelName ?? item.productName} · {item.fabricName}</p><Form label="Kesim Emrini Oluştur" onDone={done} onSubmit={(f) => workflowRepository.createCuttingOrder({ orderId: order.id, orderItemId: item.id, date: text(f, 'date'), cutterCompanyId: text(f, 'cutterCompanyId'), sizeSeries: series, sizeDistribution: sizes, note: text(f, 'note'), requested: rows.map((r, i) => ({ color: r.color, quantity: Number(f.get(`amount-${i}`)) })).filter((r) => r.quantity !== 0) })}>
    <div className="ws-grid"><Input label="Kesim Emri Tarihi" name="date" type="date" value={today()} required /><CompanySelect contacts={contacts} role="Fasoncu" service="Kesim" name="cutterCompanyId" label="Kesimci *" required /></div>
    <Table headers={['Renk', 'Sipariş Adedi', 'Daha Önce Kesime Gönderilen', 'Kalan', 'Bu Kesime Gönder']} rows={rows.map((r, i) => [r.color, r.quantity, r.sent, r.remaining, <input aria-label={`${r.color} kesime gönder`} name={`amount-${i}`} type="number" min={0} max={r.remaining} step={1} defaultValue="" className="allocation-input" />])} />
    <p className="ws-hint">Sonuçlanan kesimde eksik çıkan miktar yeniden kesime gönderilebilir. Fazla çıkan gerçek miktar korunur.</p>
    <PlannedSizes series={series} value={sizes} onChange={setSizes} onSeriesChange={setSeries} /><Field label="Kesim Notu"><textarea name="note" maxLength={2000} /></Field>
  </Form></Section>;
}
export function CuttingPastal({ cut }: { cut: CuttingOrder }) {
  return <div className="common-size-display"><div className="table-scroll"><table className="common-size-table"><thead><tr>{sizeSeries[cut.sizeSeries].map((s) => <th key={s}>{s}</th>)}</tr></thead><tbody><tr>{sizeSeries[cut.sizeSeries].map((s) => <td key={s}>{cut.sizeDistribution[s] ?? 0}</td>)}</tr></tbody></table></div><p>Seri Toplamı: {Object.values(cut.sizeDistribution).reduce((a, b) => a + b, 0)}</p></div>;
}
export function CuttingOrderPrint({ cut, order, contacts }: { cut: CuttingOrder; order?: ProductionOrderCard; contacts: Contact[] }) {
  return <article className="production-paper cutting-order-print"><h1>ARGENT TEKSTİL · KESİME FÖY</h1><h2>Üst Bilgiler</h2><dl className="production-summary">{[['Kesim Emri No', cut.cuttingNo], ['Sipariş No', order?.orderNo], ['Sipariş Adı', order?.orderName], ['Müşteri', companyName(contacts, order?.customerId ?? '')], ['Ürün Tanımı', cut.productName], ['Ürün / Model', cut.modelName], ['Kesimci', companyName(contacts, cut.cutterCompanyId)]].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value || '—'}</dd></div>)}</dl>
    <h2>Kumaş</h2><p>Kumaş Adı: {cut.fabricName}{cut.gsm && ` · Gramaj: ${cut.gsm}`}</p><p>{cut.fabricProperties}</p>
    <h2>Kesim Talebi</h2><Table headers={['Renk', 'İstenen Adet']} rows={cut.requested.map((r) => [r.color, r.quantity])} />
    <h2>Ortak Pastal / Beden · {cut.sizeSeries}</h2><CuttingPastal cut={cut} />
    <h2>Ürün Talimatları</h2><ol>{cut.instructions.map((s, i) => <li key={i}>{s}</li>)}</ol><p>Not: {cut.note || '—'}</p>
    <h2>Kesim Sonucu · Kesimci dolduracaktır</h2><Table headers={['Renk', 'Top Sayısı', 'Kg', 'Çıkan Adet']} rows={cut.requested.map((r) => [r.color, <span className="cutting-blank">&nbsp;</span>, <span className="cutting-blank">&nbsp;</span>, <span className="cutting-blank">&nbsp;</span>])} />
  </article>;
}
function CuttingResultForm({ cut, done }: { cut: CuttingOrder; done: () => void }) {
  return <Section title="Kesim Sonucu Gir"><Form onDone={done} label="Kesim Sonucunu Kaydet" onSubmit={(f) => workflowRepository.saveCuttingOrderResult(cut.id, cut.revision, { date: text(f, 'date'), rows: cut.requested.map((r, i) => ({ color: r.color, rollCount: Number(f.get(`roll-${i}`)), kg: Number(f.get(`kg-${i}`)), quantity: Number(f.get(`actual-${i}`)) })) })}>
    <Input label="Kesim Sonucu Tarihi" name="date" type="date" value={today()} required />
    <Table headers={['Renk', 'Hedef', 'Top Sayısı', 'Kullanılan Kg', 'Çıkan Adet']} rows={cut.requested.map((r, i) => [r.color, r.quantity, ...['roll', 'kg', 'actual'].map((field) => <input aria-label={`${r.color} ${{ roll: 'Top Sayısı', kg: 'Kullanılan Kg', actual: 'Çıkan Adet' }[field]}`} className="allocation-input" name={`${field}-${i}`} type="number" min={0} step={field === 'kg' ? '0.001' : 1} required />)])} />
    <p>Hedeften eksik veya fazla çıkan gerçek adedi girin. Kaydedilen sonuç değiştirilemez.</p>
  </Form></Section>;
}
export function ProductionFromCutForm({ cut, cards, contacts, done }: { cut: CuttingOrder; cards: ProductionRecord[]; contacts: Contact[]; done: () => void }) {
  const rows = cutProductionAllocation(cut, cards);
  return <Section title="Kesim Sonucundan Üretim Kartı Oluştur"><p>{cut.cuttingNo} · {cut.modelName} · {cut.fabricName} · {cut.sizeSeries}</p><Form label="Üretim Kartını Oluştur" onDone={done} onSubmit={(f) => workflowRepository.createProductionFromCut(cut.id, cut.revision, { productionName: text(f, 'productionName'), brand: text(f, 'brand'), date: text(f, 'date'), productionDueDate: text(f, 'productionDueDate'), selectedColorQuantities: rows.map((r, i) => ({ color: r.color, quantity: Number(f.get(`amount-${i}`)) })).filter((r) => r.quantity !== 0), embroideryCompanyId: text(f, 'embroideryCompanyId'), printingCompanyId: text(f, 'printingCompanyId'), sewingCompanyId: text(f, 'sewingCompanyId'), ironingPackagingCompanyId: text(f, 'ironingPackagingCompanyId'), note: text(f, 'note') })}>
    <div className="ws-grid"><Field label="Üretim No"><input readOnly value="Otomatik oluşturulur" /></Field><Input label="Üretim Adı *" name="productionName" required /><Input label="Marka *" name="brand" required /><input type="hidden" name="date" value={today()} /><Input label="Üretim Termin Tarihi *" name="productionDueDate" type="date" required /></div>
    <Table headers={['Renk', 'Kesimden Çıkan', 'Daha Önce Üretime Alınan', 'Kalan', 'Bu Üretime Al']} rows={rows.map((r, i) => [r.color, r.quantity, r.allocated, r.remaining, <input aria-label={`${r.color} üretime al`} className="allocation-input" name={`amount-${i}`} type="number" min={0} max={r.remaining} step={1} />])} />
    <div className="ws-grid">{([['embroideryCompanyId', 'Nakış', 'Nakışçı'], ['printingCompanyId', 'Baskı', 'Baskıcı'], ['sewingCompanyId', 'Dikim', 'Dikim Firması'], ['ironingPackagingCompanyId', 'Ütü & Paket', 'Ütü/Paket Firması']] as const).map(([field, service, label]) => <CompanySelect key={field} contacts={contacts} role="Fasoncu" service={service} name={field} label={label} own />)}</div><Field label="Üretime Özel Talimat / Not"><textarea name="note" maxLength={2000} /></Field>
  </Form></Section>;
}
export function CuttingOrdersPage() {
  const resource = useResource(async () => ({ cuts: await workflowRepository.listCuttingOrders(), orders: await workflowRepository.listOrders(), cards: await workflowRepository.list() }));
  const companies = useCompanies(), [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState(''), [editing, setEditing] = useState('');
  const c = resource.data?.cuts.find((c) => c.id === params.get('id')), order = resource.data?.orders.find((o) => o.id === c?.orderId);
  const done = () => { setEditing(''); resource.reload(); };
  const closed = c?.archived || c?.deleted;
  return <Page title="Kesim Takibi" loading={!resource.data || !companies.data} error={resource.error || companies.error} reload={resource.reload}>
    {c ? params.get('yazdir') ? <><div className="production-screen-only ws-tabs"><button className="button" onClick={() => window.print()}>Yazdır / PDF</button><button className="button ws-secondary" onClick={() => setParams({ id: c.id })}>Kesim Emrine Dön</button></div><CuttingOrderPrint cut={c} order={order} contacts={companies.data ?? []} /></> : <>
      <div className="ws-tabs"><button className="button ws-secondary" onClick={() => { setEditing(''); setParams({}); }}>Listeye Dön</button><Link to={`/uretim/siparisler?id=${c.orderId}`}>Sipariş Kartı</Link><button className="button" onClick={() => setParams({ id: c.id, yazdir: '1' })}>Kesime Föy Hazırla</button></div>
      <Section title={`${c.cuttingNo} · ${c.modelName}`}><p>{c.deleted ? 'Çöp Kutusunda' : c.archived ? 'Arşivde' : c.status} · {order?.orderNo} · {order?.orderName}</p><p>Kesimci: {companyName(companies.data, c.cutterCompanyId)} · Tarih: {c.date}</p><p>Kumaş: {c.fabricName} · Gramaj: {c.gsm || '—'}</p><p>{c.fabricProperties}</p><ol>{c.instructions.map((s, i) => <li key={i}>{s}</li>)}</ol><p>{c.note}</p><CuttingPastal cut={c} /><Table headers={['Renk', 'Hedef', 'Çıkan', 'Fark']} rows={c.requested.map((r) => { const actual = c.result?.rows.find((a) => a.color === r.color)?.quantity; return [r.color, r.quantity, actual ?? '—', actual === undefined ? '—' : actual - r.quantity]; })} /></Section>
      {!closed && <div className="ws-tabs">{c.status === 'Kesime Hazır / Bekliyor' && <Action run={() => workflowRepository.startCuttingOrder(c.id, c.revision)} done={done}>Kesime Başla</Action>}{!c.result && <button className="button" onClick={() => setEditing('result')}>Kesim Sonucu Gir</button>}<button className="button" disabled={!c.result} onClick={() => setEditing('production')}>Üretim Kartı Oluştur</button></div>}
      {!closed && editing === 'result' && !c.result && <CuttingResultForm key={c.revision} cut={c} done={done} />}{!closed && editing === 'production' && c.result && <ProductionFromCutForm key={c.revision} cut={c} contacts={companies.data ?? []} cards={resource.data?.cards ?? []} done={done} />}
      {c.result && <Section title="Gerçek Kesim Sonucu"><Table headers={['Renk', 'Top Sayısı', 'Kullanılan Kg', 'Çıkan Adet']} rows={c.result.rows.map((r) => [r.color, r.rollCount, r.kg, r.quantity])} /></Section>}
      <Section title="Bağlı Üretim Kartları"><Table headers={['Üretim No', 'Üretim Adı', 'Marka', 'Durum']} rows={(resource.data?.cards ?? []).filter((p) => p.cuttingOrderId === c.id).map((p) => [<Link to={`/uretim/takip?id=${p.id}`}>{p.productionNo}</Link>, p.productionName, p.brand, p.deleted ? 'Çöp Kutusunda' : p.archived ? 'Arşivde' : p.status])} /></Section>
    </> : params.get('id') ? <p>Kesim emri bulunamadı.</p> : <><Field label="Kesim Durumu"><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Tümü</option>{['Kesime Hazır / Bekliyor', 'Kesimde', 'Kesim Sonucu Girilmiş'].map((s) => <option key={s}>{s}</option>)}</select></Field><Table headers={['Kesim Emri No', 'Sipariş', 'Ürün / Model', 'Kesimci', 'Tarih', 'Durum', 'İşlem']} rows={[...(resource.data?.cuts ?? [])].reverse().filter((c) => !c.deleted && !c.archived && (!filter || c.status === filter)).map((c) => [c.cuttingNo, resource.data?.orders.find((o) => o.id === c.orderId)?.orderNo, c.modelName, companyName(companies.data, c.cutterCompanyId), c.date, c.status, <button className="button ws-secondary" onClick={() => setParams({ id: c.id })}>Kesim Emrini Aç</button>])} /></>}
  </Page>;
}
