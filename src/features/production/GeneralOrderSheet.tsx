import { OrderSamples } from './OrderSamples';
import { useProductionRefresh } from './useProductionRefresh';
import type { ProductionOrder } from '../../domain/productionOrder';
import { productFeatures } from '../../domain/productionOrder';
import type { Contact } from '../contacts/model';
import { actualProductionCosts } from '../../domain/orderCosting';
import { costMoney } from '../../domain/productionCosts';
import { inventory } from '../../data/inventory';
import { financeRepository } from '../../data/finance';
import { orderRepository, productionRepository } from '../../data/production';
import { Table, useResource, companyName } from '../shared/WorkshopUI';
import { QuantityTracking } from './QuantityTracking';
import { SeriesPackage, DecorationInfo } from './OrderTechnicalInfo';

export function GeneralOrderSheet({ order, contacts, done }: { order: ProductionOrder; contacts: Contact[]; done: () => void }) {
  const p = order.product;
  const data = useResource(async () => {
    const [fabrics, materials, production, finance, orders] = await Promise.all([inventory.fabrics.load(), inventory.materials.load(), productionRepository.load(), financeRepository.load(), orderRepository.list()]);
    return { fabrics, materials, production, finance, orders };
  });
  useProductionRefresh(data.reload, ['argent-tekstil.fabrics.v1', 'argent-tekstil.materials.v1', 'argent-tekstil.production.v1', 'argent-tekstil.finance.v1']);
  const summary = actualProductionCosts(order, data.data);
  return <article className="general-order-sheet production-paper plan-technical-print"><h1>Genel Föy</h1>
    <section className="sheet-customer"><h2>Müşteri Bilgileri</h2><p><strong>{order.customerId === 'system:argent-internal-customer' ? 'ARGENT' : companyName(contacts, order.customerId)}</strong>{order.customerNote && <> · {order.customerNote}</>}</p></section>
    <section className="sheet-order-product"><div><h2>Sipariş ve Ürün Bilgileri</h2><dl className="production-summary">{[['Sipariş No', order.orderNo], ['Marka', p.brand], ['Ürün Türü', p.productName], ['Ürün / Model', p.modelName], ['Toplam Adet', String(p.colors.reduce((n,r)=>n+r.quantity,0))], ['Sipariş Tarihi', order.date], ['Termin', order.dueDate], ['Kumaş', [p.fabricName,p.gsm].filter(Boolean).join(' · ')]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl><ul className="feature-tags">{productFeatures(p).map((s,i)=><li key={i}>{s}</li>)}</ul>{order.note && <p>{order.note}</p>}</div><OrderSamples order={order} done={done} /></section>
    <QuantityTracking order={order} contacts={contacts} pairedAssignments />
    <section className="sheet-series"><h2>Seri / Paket Bilgileri</h2><SeriesPackage order={order} /></section>
    <section className="sheet-application"><h2>Baskı - Nakış Bilgileri</h2><DecorationInfo order={order} /></section>
    <section className="ws-card general-costs"><h2>Maliyetler</h2>{data.error ? <p role="alert">{data.error} <button onClick={data.reload}>Tekrar dene</button></p> : !data.data ? <p>Kaynak kayıtlar yükleniyor…</p> : <>
      {summary.missing.length > 0 && <p role="alert">{summary.missing.length} bağlı kaynak artık bulunamıyor. Toplam eksik olabilir; kaynak bağlantılarını kontrol edin.</p>}
      <Table headers={['Maliyet Kalemi', 'Birim Maliyet', 'Toplam Maliyet']} rows={summary.rows.filter((r, i) => i < 5 || r.total !== undefined).map((r) => [r.name, r.unit === undefined ? '—' : costMoney(r.unit), r.total === undefined ? '—' : costMoney(r.total)])} />
      <p className="sheet-cost-total">Toplam Birim Maliyet: <strong>{summary.unit === undefined ? 'Henüz hesaplanamadı' : costMoney(summary.unit)}</strong> · Genel Toplam Maliyet: <strong>{costMoney(summary.total)}</strong></p><p className="ws-hint production-screen-only">{summary.final ? 'Nihai gerçek' : 'Güncel / tahmini'} birim maliyet, toplam giderin mevcut {summary.currentQuantity} ürüne bölünmesiyle hesaplanır. Maliyetler üretim kaydında düzenlenir.</p>
    </>}</section>
  </article>;
}
