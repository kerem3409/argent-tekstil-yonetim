import { OrderSamples } from './OrderSamples';
import { useProductionRefresh } from './useProductionRefresh';
import { useRef, useState } from 'react';
import type { ProductionOrder } from '../../domain/productionOrder';
import type { Contact } from '../contacts/model';
import { automaticCostSources, costSources, generalSheetCosts, sheetCostCategories } from '../../domain/generalSheetCosts';
import type { SheetCostSettings } from '../../domain/generalSheetCosts';
import { generalSheetOrderCosts } from '../../domain/generalSheetOrderCosts';
import { costMoney } from '../../domain/productionCosts';
import { inventory } from '../../data/inventory';
import { financeRepository } from '../../data/finance';
import { orderRepository, productionRepository } from '../../data/production';
import { Form, Table, useResource, companyName } from '../shared/WorkshopUI';
import { QuantityTracking } from './QuantityTracking';
import { SeriesPackage, DecorationInfo } from './OrderTechnicalInfo';
import { OrderCosts } from './OrderCosts';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export function GeneralOrderSheet({ order, contacts, done }: { order: ProductionOrder; contacts: Contact[]; done: () => void }) {
  const p = order.product;
  const data = useResource(async () => {
    const [fabrics, materials, production, finance, orders] = await Promise.all([inventory.fabrics.load(), inventory.materials.load(), productionRepository.load(), financeRepository.load(), orderRepository.list()]);
    return { fabrics, materials, production, finance, orders };
  });
  useProductionRefresh(data.reload, ['argent-tekstil.fabrics.v1', 'argent-tekstil.materials.v1', 'argent-tekstil.production.v1', 'argent-tekstil.finance.v1']);
  const [settings, setSettings] = useState<SheetCostSettings>(() => structuredClone(order.sheetCosts ?? { estimated: {}, sources: [] }));
  const [dirty, setDirty] = useState(false), ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  const sources = data.data ? costSources(data.data) : [], automatic = data.data ? automaticCostSources(order, data.data, sources) : [];
  const costs = generalSheetCosts(order, sources, automatic, settings), closed = !!order.archived || !!order.deleted;
  const summary = generalSheetOrderCosts(order, sources, automatic);
  return <article className="general-order-sheet production-paper plan-technical-print"><h1>Genel Föy</h1>
    <section className="sheet-customer"><h2>Müşteri Bilgileri</h2><p><strong>{order.customerId === 'system:argent-internal-customer' ? 'ARGENT' : companyName(contacts, order.customerId)}</strong>{order.customerNote && <> · {order.customerNote}</>}</p></section>
    <section className="sheet-order-product"><div><h2>Sipariş ve Ürün Bilgileri</h2><dl className="production-summary">{[['Sipariş No', order.orderNo], ['Marka', p.brand], ['Ürün Türü', p.productName], ['Ürün / Model', p.modelName], ['Toplam Adet', String(p.colors.reduce((n,r)=>n+r.quantity,0))], ['Sipariş Tarihi', order.date], ['Termin', order.dueDate], ['Kumaş', [p.fabricName,p.gsm].filter(Boolean).join(' · ')]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl><ul className="feature-tags">{[...(p.dropShoulder ? ['Düşük Omuz'] : []), ...(p.sideSlit ? ['Yırtmaç'] : []), ...p.instructions].map((s,i)=><li key={i}>{s}</li>)}</ul>{order.note && <p>{order.note}</p>}</div><OrderSamples order={order} done={done} /></section>
    <QuantityTracking order={order} contacts={contacts} pairedAssignments />
    <section className="sheet-series"><h2>Seri / Paket Bilgileri</h2><SeriesPackage order={order} /></section>
    <section className="sheet-application"><h2>Uygulama Bilgileri</h2><DecorationInfo order={order} /></section>
    <section className="ws-card general-costs"><h2>Maliyetler</h2>{data.error ? <p role="alert">{data.error} <button onClick={data.reload}>Tekrar dene</button></p> : !data.data ? <p>Kaynak kayıtlar yükleniyor…</p> : <>
      {costs.missing.length > 0 && <p role="alert">{costs.missing.length} bağlı kaynak artık bulunamıyor. Toplam eksik olabilir; kaynak bağlantılarını kontrol edin.</p>}
      <Table headers={['Maliyet Kalemi', 'Birim Maliyet', 'Toplam Maliyet']} rows={summary.rows.filter((r) => r.name !== 'Diğer giderler' || r.unit !== undefined).map((r) => [r.name === 'Nakış / Baskı' ? 'Uygulama' : r.name === 'Etiket / Aksesuar / Malzeme' ? 'Malzeme' : r.name === 'Diğer giderler' ? 'Diğer' : r.name, r.unit === undefined ? '—' : costMoney(r.unit), r.total === undefined ? '—' : costMoney(r.total)])} />
      <p className="sheet-cost-total">Toplam Birim Maliyet: <strong>{costMoney(summary.unit)}</strong> · Genel Toplam Maliyet: <strong>{costMoney(summary.total)}</strong></p><p className="ws-hint production-screen-only">Sipariş adedi: {summary.quantity} · Birim maliyet × sipariş adedi. Boş kalemler henüz hesaplanamadı.</p>
      {!closed && <details className="production-screen-only"><summary>Tahmin ve kaynak bağlantılarını düzenle</summary><div ref={ref}><Form label="Föy Maliyetlerini Kaydet" onDone={() => { setDirty(false); done(); }} onSubmit={() => orderRepository.saveSheetCosts(order.id, order.revision, settings)}>
        {costs.missing.length > 0 && <button type="button" className="button ws-secondary" onClick={() => { setSettings((s) => ({ ...s, sources: s.sources.filter((id) => !costs.missing.includes(id)) })); setDirty(true); }}>Bulunamayan kaynak bağlantılarını kaldır</button>}<div className="ws-grid">{sheetCostCategories.map((category) => <label className="ws-field" key={category}><span>{category} Tahmini Tutar (TL)</span><input type="number" min="0" step="0.01" value={settings.estimated[category] === undefined ? '' : settings.estimated[category]! / 100} onChange={(e) => { const value = e.target.value; const parsed = Math.round(Number(value) * 100); e.target.setCustomValidity(value && (!Number.isSafeInteger(parsed) || parsed < 0) ? 'Geçerli bir tutar girin.' : ''); if (!e.target.validity.valid) return; setSettings((s) => { const estimated = { ...s.estimated }; if (!value) delete estimated[category]; else estimated[category] = Math.round(Number(value) * 100); return { ...s, estimated }; }); setDirty(true); }} /></label>)}</div>
        <p>Mevcut kumaş/malzeme çıkışını, fason kaydını veya gideri bağlayın. Bu seçim yeni stok ya da cari hareket oluşturmaz.</p><div className="cost-source-list">{sources.filter((source) => !data.data!.orders.some((o) => o.id !== order.id && (o.sheetCosts?.sources.includes(source.id) || automaticCostSources(o, data.data!, sources).some((s) => s.id === source.id)))).map((source) => <label key={source.id}><input type="checkbox" disabled={automatic.some((s) => s.id === source.id)} checked={settings.sources.includes(source.id) || automatic.some((s) => s.id === source.id)} onChange={(e) => { setSettings((s) => ({ ...s, sources: e.target.checked ? [...s.sources, source.id] : s.sources.filter((id) => id !== source.id) })); setDirty(true); }} /> {source.date} · {source.category} · {source.description} · {costMoney(source.total)}</label>)}</div>
      </Form></div></details>}
      <details className="production-screen-only"><summary>Kayıtlı üretim birim fiyatları</summary><OrderCosts order={order} done={done} /></details>
    </>}</section>
  </article>;
}
