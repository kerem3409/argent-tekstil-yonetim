import { OrderCosts } from './OrderCosts';
import { GeneralSheetPrint } from './GeneralSheetPrint';
import { OrderSamples } from './OrderSamples';
import { useProductionRefresh } from './useProductionRefresh';
import { GeneralOrderSheet } from './GeneralOrderSheet';
import { SeriesPackage, DecorationInfo } from './OrderTechnicalInfo';
import { displayStage, stageGroups, groupResult } from '../../domain/productionPresentation';
import { ProductionDisclosure } from './ProductionDisclosure';
import { OrderFeatures } from './OrderFeatures';
import { QuantityTracking } from './QuantityTracking';
import { DecorationEditor } from './DecorationEditor';
import { ArchiveSelection } from './ArchiveSelection';
import { stagePlan } from '../../domain/productionPlanning';
import { orderDrafts } from '../../data/production/orderDrafts';
import { stockStatus, orderGroup, orderProductionStatus } from '../../domain/productionOrder';
import { OrderSheets, OrderTechnicalPrint, sheetNames } from './OrderSheets';
import type { OrderSheet } from './OrderSheets';
import { Fragment, useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { orderRepository, workflowRepository } from '../../data/production';
import { productDefinitionRepository } from '../../data/productDefinitions';
import { INTERNAL_CUSTOMER_ID, completedQuantity, currentCompany, currentStage, deadlineText, isInternalPlan, itemStatus, planStages, remainingDays, stageRecord } from '../../domain/productionPlan';
import type { ProductionOrder } from '../../domain/productionOrder';
import type { Contact } from '../contacts/model';
import { Action, Field, Page, Section, Table, companyName, useCompanies, useResource } from '../shared/WorkshopUI';
import { ProductionOrderForm } from './ProductionOrderForm';
import { OrderStages } from './OrderStages';
import { RecordActions } from './RecordActions';
import { cutRows } from '../../domain/productionWorkflow';
import './production.css';

export const orderCustomerName = (contacts: Contact[], id: string) => id === INTERNAL_CUSTOMER_ID ? 'ARGENT' : companyName(contacts, id);
export const customerHref = (id: string) => `/firma-kisiler/musteriler?islem=detay&id=${encodeURIComponent(id)}`;
function Due({ date }: { date: string }) { return <span className={(remainingDays(date) ?? 0) < 0 ? 'ws-error' : ''}>{deadlineText(date)}</span>; }

export function OrderList({ orders, contacts, done, selection }: { orders: ProductionOrder[]; contacts: Contact[]; done: () => void; selection?: { ids: string[]; toggle: (id: string) => void } }) {
  const headers = [...(selection ? ['Seç'] : []), 'Sipariş No', 'Müşteri', 'Marka', 'Ürün Türü', 'Ürün / Model', 'Toplam Adet', 'Sipariş Tarihi', 'Termin', 'Mevcut Aşama', 'Mevcut Firma'];
  return <div className="table-panel production-record-list"><div className="table-scroll"><table className="ws-table"><caption className="sr-only">Üretim Planları</caption><thead><tr>{headers.map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{orders.map(o=><Fragment key={o.id}><tr className="production-record-main" data-record-id={o.id}>{selection && <td><input type="checkbox" aria-label={o.orderNo + ' seç'} checked={selection.ids.includes(o.id)} onChange={()=>selection.toggle(o.id)} /></td>}<td>{o.orderNo}</td><td><Link to={customerHref(o.customerId)}>{orderCustomerName(contacts,o.customerId)}</Link></td><td>{o.product.brand}</td><td>{o.product.productName}</td><td>{o.product.modelName}</td><td>{o.product.colors.reduce((n,r)=>n+r.quantity,0)}</td><td>{o.date}</td><td>{o.dueDate || '—'}</td><td>{displayStage(currentStage(o.product))}</td><td>{companyName(contacts,currentCompany(o.product))}</td></tr><tr className="production-record-actions"><td colSpan={headers.length}><div className="production-record-footer"><div className="production-row-actions"><Link className="button general-sheet-link" to={`/uretim/siparisler?id=${encodeURIComponent(o.id)}&print=Genel`}>Genel Föy</Link><Link className="button ws-secondary production-detail-link" to={`/uretim/siparisler?id=${encodeURIComponent(o.id)}`}>DETAY</Link><RecordActions kind="productionOrder" record={o} done={done} /></div><span>{orderProductionStatus(o)} · {stockStatus(o)} · <Due date={o.dueDate} /></span></div></td></tr></Fragment>)}{!orders.length && <tr><td colSpan={headers.length}>Kayıt bulunmuyor</td></tr>}</tbody></table></div></div>;
}

export function ProductionOrdersPage({ mode = 'active' }: { mode?: 'active' | 'archive' | 'trash' }) {
  const resource = useResource(async () => {
    const data = await orderRepository.load();
    let drafts: ReturnType<typeof orderDrafts.list> = [];
    try { drafts = orderDrafts.list(); } catch (e) { data.warnings.push(e instanceof Error ? e.message : 'Taslaklar okunamadı.'); }
    return { ...data, definitions: await productDefinitionRepository.list(), brands: await orderRepository.listBrands(), drafts };
  });
  const companies = useCompanies(), contacts = companies.data ?? [];
  const [params, setParams] = useSearchParams(); const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('Tümü'), [customer, setCustomer] = useState(''), [stage, setStage] = useState('');
  const id = params.get('id') ?? params.get('is');
  const orders = resource.data?.orders ?? [];
  const matches = orders.filter((o) => o.id === id || o.source?.planId === id || o.source?.legacyOrderId === id || o.product.legacy?.productionIds.includes(id ?? '') || o.product.legacy?.cuttingIds.includes(id ?? ''));
  const order = matches.length === 1 ? matches[0] : matches.find((o) => o.source?.productId === params.get('item'));
  useEffect(() => { resource.reload(); }, [params.get('islem'), params.get('print'), id]);
  const create = params.get('islem') === 'yeni'; const print = params.get('print');
  useProductionRefresh(() => { resource.reload(); companies.reload(); }, ['argent-tekstil.production.v1', 'argent-tekstil.contacts.v1', 'argent-tekstil.products.v1'], !!order && !editing && !create);
  const done = () => { setEditing(false); resource.reload(); companies.reload(); };
  const visible = orders.filter((o) => mode === 'trash' ? o.deleted : !o.deleted && !!o.archived === (mode === 'archive')).filter((o) => (filter === 'Tümü' || orderGroup(o) === filter || (filter === 'Stoğa Aktarılmayı Bekleyen' && stockStatus(o) === 'Stoğa Aktarılmayı Bekliyor') || (filter === 'Stoğa Aktarıldı' && !!o.product.stockTransfer)) && (!customer || o.customerId === customer) && (!stage || displayStage(currentStage(o.product)) === stage)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const converted = create && orders.find((o) => o.sourceDraftId === params.get('draft'));
  if (converted) return <Navigate replace to={`/uretim/siparisler?id=${converted.id}`} />;
  return <Page title={mode === 'archive' ? 'Arşiv' : mode === 'trash' ? 'Çöp Kutusu' : 'Üretim Planları'} loading={!resource.data || !companies.data} error={resource.error || companies.error} reload={resource.reload}>
    {resource.data?.warnings.map((w, i) => <p role="status" className="ws-hint" key={i}>{w}</p>)}
    {order && (print && Object.hasOwn(sheetNames, print)) ? <><div className="production-screen-only ws-tabs">{print === 'Genel' ? <GeneralSheetPrint /> : <button className="button" onClick={() => window.print()}>Yazdır / PDF</button>}<button className="button ws-secondary" onClick={() => setParams({ id: order.id })}>Siparişe Dön</button></div>{print === 'Genel' ? <GeneralOrderSheet key={`${order.id}:${order.revision}`} order={order} contacts={contacts} done={done} /> : <OrderTechnicalPrint order={order} contacts={contacts} customerName={orderCustomerName(contacts, order.customerId)} type={print as OrderSheet} />}</>
      : create || (editing && order) ? <ProductionOrderForm draft={resource.data?.drafts.find((d) => d.id === params.get('draft'))} initial={editing ? order : undefined} customerId={params.get('customerId') ?? undefined} contacts={contacts} definitions={resource.data?.definitions ?? []} brands={resource.data?.brands ?? []} done={(id) => { done(); setParams({ id }); }} cancel={() => { setEditing(false); setParams({}); }} />
      : order ? <><div className="ws-tabs"><button className="button ws-secondary" onClick={() => setParams({})}>Siparişlere Dön</button><Link to={customerHref(order.customerId)}>Müşteri Kartı</Link><RecordActions kind="productionOrder" record={order} done={done} />{!order.archived && !order.deleted && !order.product.stages.length && !order.product.legacy?.readOnly && <button className="button ws-secondary" onClick={() => setEditing(true)}>Siparişi Düzenle</button>}</div><OrderDetail key={`${order.id}:${order.revision}`} order={order} contacts={contacts} done={done} print={(type) => setParams({ id: order.id, print: type })} /></>
      : id ? matches.length > 1 ? <><p>Bu eski kaydın ürünleri ayrı siparişler olarak açılır.</p><OrderList orders={matches} contacts={contacts} done={done} /></> : <p role="alert">Sipariş bulunamadı.</p>
      : <>{mode === 'active' && <button className="button" onClick={() => setParams({ islem: 'yeni' })}>+ Yeni Sipariş</button>}<div className="ws-filters"><Field label="Durum"><select value={filter} onChange={(e) => setFilter(e.target.value)}>{['Tümü', 'Taslak', 'Planlama', 'Üretimde', 'Tamamlandı', 'Stoğa Aktarılmayı Bekleyen', 'Stoğa Aktarıldı'].map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Müşteri"><select value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">Tümü</option>{[...new Set(orders.map((o) => o.customerId))].map((id) => <option key={id} value={id}>{orderCustomerName(contacts, id)}</option>)}</select></Field><Field label="Mevcut Aşama"><select value={stage} onChange={(e) => setStage(e.target.value)}><option value="">Tümü</option>{[...new Set([...planStages.map(displayStage), 'Tamamlandı'])].map((s) => <option key={s}>{s}</option>)}</select></Field></div>{filter === 'Taslak' ? <Section title="Taslaklar"><Table headers={['Ürün / Model', 'Müşteri', 'Son Kayıt', 'İşlem']} rows={(resource.data?.drafts ?? []).filter((d) => !orders.some((o) => o.sourceDraftId === d.id)).map((d) => [d.input.product.modelName || 'Yeni Taslak', orderCustomerName(contacts, d.input.customerId), d.updatedAt, <button className="button" onClick={() => setParams({ islem: 'yeni', draft: d.id })}>Taslağa Devam Et</button>])} /></Section> : <><p>{visible.length} sipariş</p><>{mode !== 'trash' && <ArchiveSelection mode={mode} visible={visible} selected={selected} select={setSelected} done={done} />}<OrderList orders={visible} contacts={contacts} done={done} selection={mode !== 'trash' ? { ids: selected.filter((id) => visible.some((o) => o.id === id)), toggle: (id) => setSelected((ids) => ids.includes(id) ? ids.filter((v) => v !== id) : [...ids.filter((v) => visible.some((o) => o.id === v)), id]) } : undefined} /></></>}</>}
  </Page>;
}

function OrderDetail({ order: o, contacts, done, print }: { order: ProductionOrder; contacts: Contact[]; done: () => void; print: (s: OrderSheet) => void }) {
  const p = o.product;
  return <div className="plan-detail-grid"><div><Section title="Sipariş Bilgileri"><h3>{o.orderNo}</h3><dl className="production-summary">{[['Müşteri', orderCustomerName(contacts, o.customerId)], ['Sipariş Tarihi', o.date], ['Termin', o.dueDate || '—']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>{o.customerNote}</p>{isInternalPlan(o) && <p>ARGENT · Kendi stokumuz için üretim</p>}</Section>
    <Section title="Ürün Bilgileri"><dl className="production-summary">{[['Ürün Türü', p.productName], ['Ürün / Model', p.modelName], ['Marka', p.brand], ['Kumaş', p.fabricName], ['Gramaj', p.gsm || '—'], ['Kumaş Özellikleri', p.fabricProperties || '—']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></Section>
    <OrderSamples key={`${o.id}:${o.revision}:samples`} order={o} done={done} /><OrderFeatures order={o} done={done} /><ProductionDisclosure title="Föyler" summary="Teknik çıktılar"><OrderSheets order={o} print={print} /></ProductionDisclosure><ProductionDisclosure title="Renkler ve Adetler" summary={`${p.colors.length} renk / ${p.colors.reduce((n, r) => n + r.quantity, 0)} adet`}><QuantityTracking order={o} compact /></ProductionDisclosure><ProductionDisclosure title="Seri / Paket Bilgileri" summary={p.sizeSeries}><SeriesPackage order={o} /></ProductionDisclosure><ProductionDisclosure title="Baskı - Nakış Bilgileri" summary={p.applicationCards?.map((card) => card.name || card.type).join(' / ') || p.enabledStages.filter((s) => s === 'Nakış' || s === 'Baskı').join(' / ') || 'Yok'}>{!o.archived && !o.deleted && !p.legacy?.readOnly ? <DecorationEditor order={o} done={done} /> : <DecorationInfo order={o} />}</ProductionDisclosure>
    {p.materials.length > 0 && <ProductionDisclosure title="Aksesuar ve Malzemeler"><Table headers={['Aksesuar/Malzeme', 'Miktar', 'Durum/Not']} rows={p.materials.map((m) => [m.name, m.quantity || '—', m.description || '—'])} /></ProductionDisclosure>}
    {p.legacy && <p className="ws-hint">{p.legacy.reason}</p>}<Section title="Üretim Süreci"><OrderStages order={o} contacts={contacts} done={done} /></Section>
    {p.legacy?.readOnly && <OrderHistory order={o} contacts={contacts} done={done} />}
    {!p.legacy?.readOnly && itemStatus(p) === 'Tamamlandı' && <Section title="Stok Durumu"><p>{stockStatus(o)}</p><p>Tamamlanan miktar: {completedQuantity(p)}</p>{p.stockTransfer ? <p>Stoğa aktarıldı · {p.stockTransfer.date}</p> : !o.deleted && !o.archived && <Action run={() => orderRepository.transfer(o.id, o.revision)} done={done}>Stoğa Aktar</Action>}</Section>}
    <ProductionDisclosure title="Maliyetler"><OrderCosts order={o} done={done} /></ProductionDisclosure>
  </div><aside className="plan-status-panel"><Section title="Üretim Durumu"><p>Mevcut Durum: <strong>{orderProductionStatus(o)}</strong></p><p>Firma: {companyName(contacts, currentCompany(p))}</p><p>Termin: {o.dueDate || '—'}</p><p>Aşama Termini: {stagePlan(o, currentStage(p) as typeof planStages[number])?.dueDate ? <Due date={stagePlan(o, currentStage(p) as typeof planStages[number])!.dueDate} /> : '—'}</p><p>Kalan Süre: <Due date={o.dueDate} /></p><p>Sipariş Adedi: <strong>{p.colors.reduce((sum, r) => sum + r.quantity, 0)}</strong></p><ol className="plan-process">{stageGroups(p).map((g) => { const complete = g.types.every((t) => stageRecord(p, t)?.result); return <li key={g.name} className={complete ? 'done' : g.types.some((t) => stageRecord(p, t)) ? 'current' : ''}>{g.name} {complete ? '✓' : '○'}{complete && <span className="stage-completed-quantity"> {groupResult(p, g.types)!.rows.reduce((n,r) => n+r.quantity,0)}</span>}</li>; })}<li>Tamamlandı {itemStatus(p) === 'Tamamlandı' ? '✓' : '○'}</li></ol></Section></aside></div>;
}

function OrderHistory({ order, contacts, done }: { order: ProductionOrder; contacts: Contact[]; done: () => void }) {
  const history = useResource(workflowRepository.list);
  return <Section title="Korunan Üretim Geçmişi">{history.error && <p role="alert">{history.error}</p>}{history.data?.filter((p) => order.product.legacy?.productionIds.includes(p.id)).map((p) => <div key={p.id}><h3>{p.productionNo} · {p.brand} · {p.status}</h3><Table headers={['Renk', 'Kesilen']} rows={cutRows(p).map((r) => [r.color, r.quantity])} /><Table headers={['Aşama', 'Firma', 'Başlangıç', 'Gelen', 'Durum']} rows={p.productionStages.map((s) => [s.processType, companyName(contacts, s.companyId), s.sentQuantity, s.returnedQuantity, s.status])} />{p.completion && <p>Tamamlanan: {p.completion.good}</p>}{p.stockTransfer ? <p>Stoğa aktarıldı</p> : p.completion && !order.deleted && !order.archived && !p.deleted && <Action run={() => workflowRepository.transfer(p.id)} done={() => { history.reload(); done(); }}>Stoğa Aktar</Action>}</div>)}</Section>;
}
