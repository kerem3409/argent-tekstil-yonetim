import { displayStage } from '../../domain/productionPresentation';
import { Link, useSearchParams } from 'react-router-dom';
import { orderRepository } from '../../data/production';
import { filterLiveOrders, liveGroups, liveOrders, stagePlan } from '../../domain/productionPlanning';
import { planStages } from '../../domain/productionPlan';
import { orderProductionStatus } from '../../domain/productionOrder';
import { Field, Page, Table, companyName, useCompanies, useResource } from '../shared/WorkshopUI';
import { orderCustomerName } from './ProductionOrdersPage';
import './production.css';

export function LiveProductionPage() {
  const resource = useResource(orderRepository.load), companies = useCompanies(), [params, setParams] = useSearchParams();
  const orders = resource.data?.orders ?? [], allGroups = liveGroups(orders), active = liveOrders(orders);
  const filters = Object.fromEntries(['product', 'customer', 'stage', 'company', 'deadline', 'search'].map((k) => [k, params.get(k) ?? '']));
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next); };
  const groups = liveGroups(filterLiveOrders(orders, filters, (id) => orderCustomerName(companies.data ?? [], id))), selected = groups.find((g) => g.id === params.get('urun'));
  return <Page title="Canlı Üretim" loading={!resource.data || !companies.data} error={resource.error || companies.error} reload={resource.reload}>
    <p>Devam eden üretimler ürün tanımına göre toplanır. Her sipariş yalnızca mevcut aşamasında sayılır.</p><button className="button ws-secondary" onClick={resource.reload}>Yenile</button>
    {resource.data?.warnings.map((w) => <p key={w} role="status">{w}</p>)}
    <div className="ws-filters">
      <Field label="Ürün Türü"><select value={filters.product} onChange={(e) => setFilter('product', e.target.value)}><option value="">Tümü</option>{allGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
      <Field label="Müşteri"><select value={filters.customer} onChange={(e) => setFilter('customer', e.target.value)}><option value="">Tümü</option>{[...new Set(active.map((r) => r.order.customerId))].map((id) => <option key={id} value={id}>{orderCustomerName(companies.data ?? [], id)}</option>)}</select></Field>
      <Field label="Mevcut Aşama"><select value={filters.stage} onChange={(e) => setFilter('stage', e.target.value)}><option value="">Tümü</option>{[...new Set(planStages.map(displayStage))].map((s) => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Mevcut Firma"><select value={filters.company} onChange={(e) => setFilter('company', e.target.value)}><option value="">Tümü</option>{[...new Set(active.map((r) => r.companyId).filter(Boolean))].map((id) => <option key={id} value={id}>{companyName(companies.data, id)}</option>)}</select></Field>
      <Field label="Termin Durumu"><select value={filters.deadline} onChange={(e) => setFilter('deadline', e.target.value)}><option value="">Tümü</option>{['Geciken', 'Bugün Terminli', 'Yaklaşan'].map((s) => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Arama"><input type="search" placeholder="Sipariş no, müşteri, marka, model" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} /></Field><button className="button ws-secondary" onClick={() => setParams({})}>Filtreleri Temizle</button>
    </div><p className="ws-hint">Yaklaşan: önümüzdeki 7 gün içinde terminli üretimler.</p>
    <Table headers={['Ürün', 'Aktif Toplam', 'Kesimde', 'Nakış / Baskı', 'Dikimde', 'Ütü/Pakette']} rows={groups.map((g) => [<button className="button ws-secondary" onClick={() => setParams({ ...Object.fromEntries(params), urun: g.id })}>{g.name}</button>, g.total, g.stages.Kesim ?? 0, (g.stages.Nakış ?? 0) + (g.stages.Baskı ?? 0), g.stages.Dikim ?? 0, g.stages['Ütü & Paket'] ?? 0])} />
    {selected && <section className="ws-card"><h2>{selected.name} · {selected.total} adet</h2><Table headers={['Müşteri', 'Sipariş No', 'Marka', 'Mevcut Adet', 'Mevcut Aşama', 'Mevcut Firma', 'Termin', 'Detay']} rows={selected.rows.map(({ order: o, type, quantity, companyId }) => [orderCustomerName(companies.data ?? [], o.customerId), o.orderNo, o.product.brand, quantity, `${displayStage(type)} · ${orderProductionStatus(o)}`, companyName(companies.data, companyId), stagePlan(o, type)?.dueDate || o.dueDate, <Link className="button ws-secondary production-detail-link" to={`/uretim/siparisler?id=${encodeURIComponent(o.id)}`}>DETAY</Link>])} /></section>}
  </Page>;
}
