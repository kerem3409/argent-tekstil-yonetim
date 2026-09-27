import { Link, useSearchParams } from 'react-router-dom';
import { orderRepository } from '../../data/production';
import { liveGroups, stagePlan } from '../../domain/productionPlanning';
import { planStages } from '../../domain/productionPlan';
import { orderProductionStatus } from '../../domain/productionOrder';
import { Page, Table, companyName, useCompanies, useResource } from '../shared/WorkshopUI';
import { orderCustomerName } from './ProductionOrdersPage';
import './production.css';

export function LiveProductionPage() {
  const resource = useResource(orderRepository.load), companies = useCompanies(), [params, setParams] = useSearchParams();
  const groups = liveGroups(resource.data?.orders ?? []), selected = groups.find((g) => g.id === params.get('urun'));
  return <Page title="Canlı Üretim" loading={!resource.data || !companies.data} error={resource.error || companies.error} reload={resource.reload}>
    <p>Devam eden üretimler ürün tanımına göre toplanır. Her sipariş yalnızca mevcut aşamasında sayılır.</p><button className="button ws-secondary" onClick={resource.reload}>Yenile</button>
    {resource.data?.warnings.map((w) => <p key={w} role="status">{w}</p>)}
    <Table headers={['Ürün', 'Aktif Toplam', 'Kesimde', 'Nakışta', 'Baskıda', 'Dikimde', 'Ütü/Pakette']} rows={groups.map((g) => [<button className="button ws-secondary" onClick={() => setParams({ urun: g.id })}>{g.name}</button>, g.total, ...planStages.map((s) => g.stages[s] ?? 0)])} />
    {selected && <section className="ws-card"><h2>{selected.name} · {selected.total} adet</h2><Table headers={['Müşteri', 'Sipariş No', 'Marka', 'Mevcut Adet', 'Mevcut Aşama', 'Mevcut Firma', 'Termin', 'Detay']} rows={selected.rows.map(({ order: o, type, quantity, companyId }) => [orderCustomerName(companies.data ?? [], o.customerId), o.orderNo, o.product.brand, quantity, `${type} · ${orderProductionStatus(o)}`, companyName(companies.data, companyId), stagePlan(o, type)?.dueDate || o.dueDate, <Link className="button ws-secondary production-detail-link" to={`/uretim/siparisler?id=${encodeURIComponent(o.id)}`}>DETAY</Link>])} /></section>}
  </Page>;
}
