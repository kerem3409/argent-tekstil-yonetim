import { Link } from 'react-router-dom';
import { orderRepository } from '../../data/production';
import { itemStatus } from '../../domain/productionPlan';
import type { Contact } from '../contacts/model';
import { Section, useCompanies, useResource } from '../shared/WorkshopUI';
import { OrderList } from './ProductionOrdersPage';

export function CustomerOrders({ customer }: { customer: Contact }) {
  const companies = useCompanies();
  const resource = useResource(orderRepository.load);
  const orders = (resource.data?.orders ?? []).filter((o) => o.customerId === customer.id && !o.deleted && !o.archived);
  const completed = orders.filter((o) => itemStatus(o.product) === 'Tamamlandı').length;
  return <Section title="Siparişleri">{resource.error && <p role="alert">{resource.error}</p>}{resource.data?.warnings.map((s, i) => <p key={i} role="status">{s}</p>)}<div className="ws-tabs"><strong>Toplam Sipariş: {orders.length}</strong><span>Devam Eden: {orders.length - completed}</span><span>Tamamlanan: {completed}</span><Link className="button" to={`/uretim/siparisler?islem=yeni&customerId=${encodeURIComponent(customer.id)}`}>+ Yeni Sipariş</Link></div><p className="ws-hint">Arşiv ve Çöp Kutusundaki siparişler aktif sayılara dahil değildir.</p><OrderList orders={orders} contacts={companies.data ?? [customer]} done={resource.reload} /></Section>;
}
