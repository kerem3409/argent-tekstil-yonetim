import { orderDrafts } from '../../data/production/orderDrafts';
import { productionStarted, stockStatus, orderGroup, orderProductionStatus } from '../../domain/productionOrder';
import { OrderSheets, OrderTechnicalPrint, ProductionSummary, sheetNames } from './OrderSheets';
import type { OrderSheet } from './OrderSheets';
import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { orderRepository, workflowRepository } from '../../data/production';
import { productDefinitionRepository } from '../../data/productDefinitions';
import { INTERNAL_CUSTOMER_ID, activeStages, completedQuantity, currentCompany, currentStage, deadlineText, isInternalPlan, itemStatus, planStages, remainingDays, stageRecord } from '../../domain/productionPlan';
import type { ProductionOrder } from '../../domain/productionOrder';
import type { Contact } from '../contacts/model';
import { Action, Field, Page, Section, Table, companyName, useCompanies, useResource } from '../shared/WorkshopUI';
import { ProductionOrderForm } from './ProductionOrderForm';
import { OrderStages } from './OrderStages';
import { PlanSizes } from './PlanStages';
import { RecordActions } from './RecordActions';
import { cutRows } from '../../domain/productionWorkflow';
import './production.css';

export const orderCustomerName = (contacts: Contact[], id: string) => id === INTERNAL_CUSTOMER_ID ? 'ARGENT' : companyName(contacts, id);
export const customerHref = (id: string) => `/firma-kisiler/musteriler?islem=detay&id=${encodeURIComponent(id)}`;
function Due({ date }: { date: string }) { return <span className={(remainingDays(date) ?? 0) < 0 ? 'ws-error' : ''}>{deadlineText(date)}</span>; }

export function OrderList({ orders, contacts, done }: { orders: ProductionOrder[]; contacts: Contact[]; done: () => void }) {
  return <Table headers={['Sipariş No', 'Müşteri', 'Marka', 'Ürün / Model', 'Toplam Adet', 'Termin', 'Mevcut Aşama', 'Mevcut Firma', 'Kalan Gün', 'Üretim Durumu', 'Stok Durumu', 'İşlem']} rows={orders.map((o) => [o.orderNo, <Link to={customerHref(o.customerId)}>{orderCustomerName(contacts, o.customerId)}</Link>, o.product.brand, o.product.modelName, o.product.colors.reduce((n, r) => n + r.quantity, 0), o.dueDate || '—', currentStage(o.product), companyName(contacts, currentCompany(o.product)), <Due date={o.dueDate} />, orderProductionStatus(o), stockStatus(o), <div className="ws-tabs"><Link className="button ws-secondary" to={`/uretim/siparisler?id=${encodeURIComponent(o.id)}`}>Detay</Link><RecordActions kind="productionOrder" record={o} done={done} /></div>])} />;
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
  const [filter, setFilter] = useState('Tümü'), [customer, setCustomer] = useState(''), [stage, setStage] = useState('');
  const id = params.get('id') ?? params.get('is');
  const orders = resource.data?.orders ?? [];
  const matches = orders.filter((o) => o.id === id || o.source?.planId === id || o.source?.legacyOrderId === id || o.product.legacy?.productionIds.includes(id ?? '') || o.product.legacy?.cuttingIds.includes(id ?? ''));
  const order = matches.length === 1 ? matches[0] : matches.find((o) => o.source?.productId === params.get('item'));
  useEffect(() => { resource.reload(); }, [params.get('islem')]);
  const create = params.get('islem') === 'yeni'; const print = params.get('print');
  const done = () => { setEditing(false); resource.reload(); companies.reload(); };
  const visible = orders.filter((o) => mode === 'trash' ? o.deleted : !o.deleted && !!o.archived === (mode === 'archive')).filter((o) => (filter === 'Tümü' || orderGroup(o) === filter || (filter === 'Stoğa Aktarılmayı Bekleyen' && stockStatus(o) === 'Stoğa Aktarılmayı Bekliyor') || (filter === 'Stoğa Aktarıldı' && !!o.product.stockTransfer)) && (!customer || o.customerId === customer) && (!stage || currentStage(o.product) === stage)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const converted = create && orders.find((o) => o.sourceDraftId === params.get('draft'));
  if (converted) return <Navigate replace to={`/uretim/siparisler?id=${converted.id}`} />;
  return <Page title={mode === 'archive' ? 'Arşiv' : mode === 'trash' ? 'Çöp Kutusu' : 'Üretim Siparişleri'} loading={!resource.data || !companies.data} error={resource.error || companies.error} reload={resource.reload}>
    {resource.data?.warnings.map((w, i) => <p role="status" className="ws-hint" key={i}>{w}</p>)}
    {order && (print && Object.hasOwn(sheetNames, print)) ? <><div className="production-screen-only ws-tabs"><button className="button" onClick={() => window.print()}>Yazdır / PDF</button><button className="button ws-secondary" onClick={() => setParams({ id: order.id })}>Siparişe Dön</button></div><OrderTechnicalPrint order={order} customerName={orderCustomerName(contacts, order.customerId)} type={print as OrderSheet} /></>
      : create || (editing && order) ? <ProductionOrderForm draft={resource.data?.drafts.find((d) => d.id === params.get('draft'))} initial={editing ? order : undefined} customerId={params.get('customerId') ?? undefined} contacts={contacts} definitions={resource.data?.definitions ?? []} brands={resource.data?.brands ?? []} done={(id) => { done(); setParams({ id }); }} cancel={() => { setEditing(false); setParams({}); }} />
      : order ? <><div className="ws-tabs"><button className="button ws-secondary" onClick={() => setParams({})}>Siparişlere Dön</button><Link to={customerHref(order.customerId)}>Müşteri Kartı</Link><RecordActions kind="productionOrder" record={order} done={done} />{!order.archived && !order.deleted && !order.product.stages.length && !order.product.legacy?.readOnly && <button className="button ws-secondary" onClick={() => setEditing(true)}>Siparişi Düzenle</button>}</div><OrderDetail key={`${order.id}:${order.revision}`} order={order} contacts={contacts} done={done} print={(type) => setParams({ id: order.id, print: type })} /></>
      : id ? matches.length > 1 ? <><p>Bu eski kaydın ürünleri ayrı siparişler olarak açılır.</p><OrderList orders={matches} contacts={contacts} done={done} /></> : <p role="alert">Sipariş bulunamadı.</p>
      : <>{mode === 'active' && <button className="button" onClick={() => setParams({ islem: 'yeni' })}>+ Yeni Sipariş</button>}<div className="ws-filters"><Field label="Durum"><select value={filter} onChange={(e) => setFilter(e.target.value)}>{['Tümü', 'Taslak', 'Planlama', 'Üretimde', 'Tamamlandı', 'Stoğa Aktarılmayı Bekleyen', 'Stoğa Aktarıldı'].map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Müşteri"><select value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">Tümü</option>{[...new Set(orders.map((o) => o.customerId))].map((id) => <option key={id} value={id}>{orderCustomerName(contacts, id)}</option>)}</select></Field><Field label="Mevcut Aşama"><select value={stage} onChange={(e) => setStage(e.target.value)}><option value="">Tümü</option>{[...planStages, 'Tamamlandı'].map((s) => <option key={s}>{s}</option>)}</select></Field></div>{filter === 'Taslak' ? <Section title="Taslaklar"><Table headers={['Sipariş Adı', 'Müşteri', 'Son Kayıt', 'İşlem']} rows={(resource.data?.drafts ?? []).filter((d) => !orders.some((o) => o.sourceDraftId === d.id)).map((d) => [d.input.name || 'Adsız Taslak', orderCustomerName(contacts, d.input.customerId), d.updatedAt, <button className="button" onClick={() => setParams({ islem: 'yeni', draft: d.id })}>Taslağa Devam Et</button>])} /></Section> : <><p>{visible.length} sipariş</p><OrderList orders={visible} contacts={contacts} done={done} /></>}</>}
  </Page>;
}

function OrderDetail({ order: o, contacts, done, print }: { order: ProductionOrder; contacts: Contact[]; done: () => void; print: (s: OrderSheet) => void }) {
  const p = o.product;
  return <div className="plan-detail-grid"><div><Section title={`${o.orderNo} · ${o.name}`}><h3>Müşteri Bilgileri</h3><dl className="production-summary">{[['Müşteri', orderCustomerName(contacts, o.customerId)], ['Sipariş Tarihi', o.date], ['Termin', o.dueDate || '—'], ['Müşteri Referans No', o.customerReference || '—']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>{o.customerNote}</p>{isInternalPlan(o) && <p>ARGENT · Kendi stokumuz için üretim</p>}</Section>
    <Section title="Ürün Bilgileri"><dl className="production-summary">{[['Ürün Türü', p.productName], ['Ürün / Model', p.modelName], ['Marka', p.brand], ['Kumaş', p.fabricName], ['Gramaj', p.gsm || '—'], ['Kumaş Özellikleri', p.fabricProperties || '—']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></Section>
    <Section title="Renk ve Adetler"><Table headers={['Renk', 'Sipariş Adedi']} rows={p.colors.map((r) => [r.color, r.quantity])} /></Section><Section title="Ürün Özellikleri"><ol>{p.instructions.map((s, i) => <li key={i}>{s}</li>)}</ol></Section><Section title="Seri / Beden Bilgisi"><p>{p.sizeSeries} · Tüm renklere ortak</p><PlanSizes item={p} /></Section>
    <Section title="Nakış Bilgileri">{p.enabledStages.includes('Nakış') ? <><ol>{p.embroidery.notes.map((s, i) => <li key={i}>{s}</li>)}</ol><p>Konum: {p.embroidery.position || '—'} · Ölçü: {p.embroidery.size || '—'}</p><p>{p.embroidery.technicalNote}</p><Table headers={['Renk', 'Nakış Açıklaması']} rows={p.embroidery.colorNotes.map((r) => [r.color, r.note])} /></> : <p>Nakış yok</p>}</Section>
    <Section title="Paket / Ambalaj Bilgisi"><dl className="production-summary">{[['Bir Pakette Kaç Ürün', String(p.packaging.unitsPerPack ?? '—')], ['Paket Tipi', p.packaging.type], ['Karışık Beden / Tek Beden', p.packaging.sizeMode], ['Özel Ambalaj Notu', p.packaging.note], ['Etiketleme Notu', p.packaging.labelingNote]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></Section>
    <Section title="Genel Not / Diğer Bilgiler"><p>{o.note || '—'}</p>{p.materials.length > 0 && <Table headers={['Korunan Malzeme', 'Açıklama', 'Miktar']} rows={p.materials.map((m) => [m.name, m.description, m.quantity])} />}</Section>
    {p.legacy && <p className="ws-hint">{p.legacy.reason}</p>}<OrderSheets order={o} print={print} />{productionStarted(o) ? <OrderStages order={o} contacts={contacts} done={done} /> : <Section title="Üretime Başla"><Action disabled={!!o.archived || !!o.deleted} run={() => orderRepository.startProduction(o.id, o.revision)} done={done}>Üretime Başla</Action></Section>}<ProductionSummary order={o} />
    {p.legacy?.readOnly && <OrderHistory order={o} contacts={contacts} done={done} />}
    {!p.legacy?.readOnly && itemStatus(p) === 'Tamamlandı' && <Section title="Stok Durumu"><p>{stockStatus(o)}</p><p>Tamamlanan miktar: {completedQuantity(p)}</p>{p.stockTransfer ? <p>Stoğa aktarıldı · {p.stockTransfer.date}</p> : !o.deleted && !o.archived && <Action run={() => orderRepository.transfer(o.id, o.revision)} done={done}>Stoğa Aktar</Action>}</Section>}
  </div><aside className="plan-status-panel"><Section title="Üretim Durumu"><p>Mevcut Durum: <strong>{orderProductionStatus(o)}</strong></p><p>Firma: {companyName(contacts, currentCompany(p))}</p><p>Termin: {o.dueDate || '—'}</p><p>Kalan Süre: <Due date={o.dueDate} /></p><ol className="plan-process">{activeStages(p).map((s) => <li key={s} className={stageRecord(p, s)?.result ? 'done' : stageRecord(p, s) ? 'current' : ''}>{s} {stageRecord(p, s)?.result ? '✓' : stageRecord(p, s) ? '●' : '○'}</li>)}<li>Tamamlandı {itemStatus(p) === 'Tamamlandı' ? '✓' : '○'}</li></ol></Section></aside></div>;
}

function OrderHistory({ order, contacts, done }: { order: ProductionOrder; contacts: Contact[]; done: () => void }) {
  const history = useResource(workflowRepository.list);
  return <Section title="Korunan Üretim Geçmişi">{history.error && <p role="alert">{history.error}</p>}{history.data?.filter((p) => order.product.legacy?.productionIds.includes(p.id)).map((p) => <div key={p.id}><h3>{p.productionNo} · {p.brand} · {p.status}</h3><Table headers={['Renk', 'Kesilen']} rows={cutRows(p).map((r) => [r.color, r.quantity])} /><Table headers={['Aşama', 'Firma', 'Başlangıç', 'Gelen', 'Durum']} rows={p.productionStages.map((s) => [s.processType, companyName(contacts, s.companyId), s.sentQuantity, s.returnedQuantity, s.status])} />{p.completion && <p>Tamamlanan: {p.completion.good}</p>}{p.stockTransfer ? <p>Stoğa aktarıldı</p> : p.completion && !order.deleted && !order.archived && !p.deleted && <Action run={() => workflowRepository.transfer(p.id)} done={() => { history.reload(); done(); }}>Stoğa Aktar</Action>}</div>)}</Section>;
}
