import { OrderSamples } from './OrderSamples';
import { useProductionRefresh } from './useProductionRefresh';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProductionOrder } from '../../domain/productionOrder';
import type { Contact } from '../contacts/model';
import { automaticCostSources, costSources, generalSheetCosts, sheetCostCategories } from '../../domain/generalSheetCosts';
import type { SheetCostSettings } from '../../domain/generalSheetCosts';
import { costMoney } from '../../domain/productionCosts';
import { inventory } from '../../data/inventory';
import { financeRepository } from '../../data/finance';
import { orderRepository, productionRepository } from '../../data/production';
import { Action, Form, Table, useResource, companyName } from '../shared/WorkshopUI';
import { itemStatus } from '../../domain/productionPlan';
import { QuantityTracking } from './QuantityTracking';
import { SeriesPackage, DecorationInfo } from './OrderTechnicalInfo';
import { ProductionDisclosure } from './ProductionDisclosure';
import { OrderCosts } from './OrderCosts';
import { OrderStages } from './OrderStages';
import { StagePlanning } from './StagePlanning';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';
import { stockStatus } from '../../domain/productionOrder';

export function GeneralOrderSheet({ order, contacts, done }: { order: ProductionOrder; contacts: Contact[]; done: () => void }) {
  const p = order.product;
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => { opened = [...document.querySelectorAll<HTMLDetailsElement>('.general-order-sheet details.production-disclosure:not([open])')]; opened.forEach((d) => { d.open = true; }); };
    const after = () => { opened.forEach((d) => { d.open = false; }); opened = []; };
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  const data = useResource(async () => {
    const [fabrics, materials, production, finance, orders] = await Promise.all([inventory.fabrics.load(), inventory.materials.load(), productionRepository.load(), financeRepository.load(), orderRepository.list()]);
    return { fabrics, materials, production, finance, orders };
  });
  useProductionRefresh(data.reload, ['argent-tekstil.fabrics.v1', 'argent-tekstil.materials.v1', 'argent-tekstil.production.v1', 'argent-tekstil.finance.v1']);
  const [settings, setSettings] = useState<SheetCostSettings>(() => structuredClone(order.sheetCosts ?? { estimated: {}, sources: [] }));
  const [dirty, setDirty] = useState(false), ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  const sources = data.data ? costSources(data.data) : [], automatic = data.data ? automaticCostSources(order, data.data, sources) : [];
  const costs = generalSheetCosts(order, sources, automatic, settings), closed = !!order.archived || !!order.deleted;
  const linked = costs.selected.filter((s) => s.id.startsWith('fabric:') || s.id.startsWith('material:'));
  const events = [
    [order.createdAt, 'Sipariş oluşturuldu', order.orderNo],
    ...(order.stagePlans ?? []).map((s) => [s.plannedStart, `${s.type} planı`, `${companyName(contacts, s.companyId)} · Termin ${s.dueDate}`]),
    ...p.stages.flatMap((s) => [[s.actualStartedAt || s.date, `${s.type} başladı`, companyName(contacts, s.companyId)], ...(s.result ? [[s.actualCompletedAt || s.result.date, `${s.type} sonucu`, `${s.result.rows.reduce((n, r) => n + r.quantity, 0)} adet`]] : [])]),
    ...(order.resultHistory ?? []).map((h) => [h.changedAt, `${h.type} sonucu düzeltildi`, `Önceki sonuç: ${h.previous?.rows.reduce((n,r) => n+r.quantity,0) ?? '—'} adet`]),
    ...costs.selected.map((s) => [s.date, s.category, `${s.description} · ${costMoney(s.total)}`]),
    ...(p.stockTransfer ? [[p.stockTransfer.date, 'Stoğa aktarıldı', p.stockTransfer.stockIds.join(', ')]] : []),
    ...(order.archivedAt ? [[order.archivedAt, 'Arşivlendi', '']] : []), ...(order.deletedAt ? [[order.deletedAt, 'Çöp Kutusuna taşındı', '']] : []),
  ].sort((a,b) => b[0].localeCompare(a[0]));
  return <article className="general-order-sheet production-paper plan-technical-print"><h1>Genel Föy</h1>
    <section className="sheet-customer"><h2>Müşteri Bilgileri</h2><p><strong>{order.customerId === 'system:argent-internal-customer' ? 'ARGENT' : companyName(contacts, order.customerId)}</strong>{order.customerNote && <> · {order.customerNote}</>}</p></section>
    <section className="sheet-order-product"><div><h2>Sipariş ve Ürün Bilgileri</h2><dl className="production-summary">{[['Sipariş No', order.orderNo], ['Marka', p.brand], ['Ürün Türü', p.productName], ['Ürün / Model', p.modelName], ['Toplam Adet', String(p.colors.reduce((n,r)=>n+r.quantity,0))], ['Sipariş Tarihi', order.date], ['Termin', order.dueDate], ['Kumaş', [p.fabricName,p.gsm].filter(Boolean).join(' · ')]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl><ul className="feature-tags">{[...(p.dropShoulder ? ['Düşük Omuz'] : []), ...(p.sideSlit ? ['Yırtmaç'] : []), ...p.instructions].map((s,i)=><li key={i}>{s}</li>)}</ul>{order.note && <p>{order.note}</p>}</div><OrderSamples order={order} done={done} /></section>
    <QuantityTracking order={order} contacts={contacts} />
    <section className="sheet-series"><h2>Seri / Paket Bilgileri</h2><SeriesPackage order={order} /></section>
    <section className="sheet-application"><h2>Uygulama Bilgileri</h2><DecorationInfo order={order} /></section>
    <section className="ws-card general-costs"><h2>Maliyetler</h2>{data.error ? <p role="alert">{data.error} <button onClick={data.reload}>Tekrar dene</button></p> : !data.data ? <p>Kaynak kayıtlar yükleniyor…</p> : <>
      {costs.missing.length > 0 && <p role="alert">{costs.missing.length} bağlı kaynak artık bulunamıyor. Toplam eksik olabilir; kaynak bağlantılarını kontrol edin.</p>}
      <Table headers={['Maliyet Kalemi', 'Tahmini', 'Gerçekleşen', 'Fark']} rows={costs.rows.map((r) => [r.name === 'Nakış / Baskı' ? 'Uygulama' : r.name === 'Etiket / Aksesuar / Malzeme' ? 'Aksesuar / Malzeme' : r.name === 'Diğer giderler' ? 'Diğer' : r.name, r.estimated === undefined ? '—' : costMoney(r.estimated), r.actual === undefined ? '—' : costMoney(r.actual), r.difference === undefined ? '—' : `${r.difference > 0 ? '+' : ''}${costMoney(r.difference)}`])} />
      <p>Toplam Üretim Maliyeti: <strong>{costMoney(costs.actual)}</strong> · Tahmini: {costs.estimated === undefined ? 'Belirtilmedi' : costMoney(costs.estimated)} · Fark: {costs.estimated === undefined ? '—' : costMoney(costs.actual - costs.estimated)}</p><p>Birim Maliyet: {costs.perUnit === undefined ? 'Henüz hesaplanamadı' : `${costMoney(costs.perUnit)}/adet`}</p><p className="ws-hint production-screen-only">Toplam, mevcut kayıtlı tutarları kapsar. Bağlı kaynak tutarı aynı kalemin birim fiyat hesabının yerine geçer. Boş kalemler henüz hesaplanmamıştır.</p>
      {!closed && <details className="production-screen-only"><summary>Tahmin ve kaynak bağlantılarını düzenle</summary><div ref={ref}><Form label="Föy Maliyetlerini Kaydet" onDone={() => { setDirty(false); done(); }} onSubmit={() => orderRepository.saveSheetCosts(order.id, order.revision, settings)}>
        {costs.missing.length > 0 && <button type="button" className="button ws-secondary" onClick={() => { setSettings((s) => ({ ...s, sources: s.sources.filter((id) => !costs.missing.includes(id)) })); setDirty(true); }}>Bulunamayan kaynak bağlantılarını kaldır</button>}<div className="ws-grid">{sheetCostCategories.map((category) => <label className="ws-field" key={category}><span>{category} Tahmini Tutar (TL)</span><input type="number" min="0" step="0.01" value={settings.estimated[category] === undefined ? '' : settings.estimated[category]! / 100} onChange={(e) => { const value = e.target.value; const parsed = Math.round(Number(value) * 100); e.target.setCustomValidity(value && (!Number.isSafeInteger(parsed) || parsed < 0) ? 'Geçerli bir tutar girin.' : ''); if (!e.target.validity.valid) return; setSettings((s) => { const estimated = { ...s.estimated }; if (!value) delete estimated[category]; else estimated[category] = Math.round(Number(value) * 100); return { ...s, estimated }; }); setDirty(true); }} /></label>)}</div>
        <p>Mevcut kumaş/malzeme çıkışını, fason kaydını veya gideri bağlayın. Bu seçim yeni stok ya da cari hareket oluşturmaz.</p><div className="cost-source-list">{sources.filter((source) => !data.data!.orders.some((o) => o.id !== order.id && (o.sheetCosts?.sources.includes(source.id) || automaticCostSources(o, data.data!, sources).some((s) => s.id === source.id)))).map((source) => <label key={source.id}><input type="checkbox" disabled={automatic.some((s) => s.id === source.id)} checked={settings.sources.includes(source.id) || automatic.some((s) => s.id === source.id)} onChange={(e) => { setSettings((s) => ({ ...s, sources: e.target.checked ? [...s.sources, source.id] : s.sources.filter((id) => id !== source.id) })); setDirty(true); }} /> {source.date} · {source.category} · {source.description} · {costMoney(source.total)}</label>)}</div>
      </Form></div></details>}
      <details className="production-screen-only"><summary>Kayıtlı üretim birim fiyatları</summary><OrderCosts order={order} done={done} /></details>
    </>}</section>
    <div className="production-screen-only"><ProductionDisclosure title="Planlama ve üretim işlemleri"><StagePlanning order={order} contacts={contacts} done={done} /><OrderStages order={order} contacts={contacts} done={done} /></ProductionDisclosure>
    <ProductionDisclosure title="Stok / Kullanılan Malzemeler" summary={stockStatus(order)}><Table headers={['Malzeme / Hareket', 'Miktar', 'Maliyet']} rows={linked.map((s) => [<Link to={s.href}>{s.description}</Link>, `${s.quantity} ${s.unit}`, costMoney(s.total)])} />{!linked.length && <p>Bağlı stok çıkışı bulunmuyor. Maliyetler bölümünden mevcut hareketi seçebilirsiniz.</p>}{p.materials.length > 0 && <Table headers={['Kayıtlı Malzeme', 'Açıklama', 'Miktar']} rows={p.materials.map((m) => [m.name,m.description,m.quantity])} />}<p>{stockStatus(order)}</p>{!closed && !p.legacy?.readOnly && !p.stockTransfer && itemStatus(p) === 'Tamamlandı' && <Action run={() => orderRepository.transfer(order.id, order.revision)} done={done}>Stoğa Aktar</Action>}{p.stockTransfer && <Link to="/stok/urunler">Stoktaki ürünleri aç</Link>}</ProductionDisclosure>
    <ProductionDisclosure title="Hareket Geçmişi" summary={`${events.length} hareket`}><Table headers={['Tarih', 'İşlem', 'Açıklama']} rows={events} /></ProductionDisclosure>
    </div>
  </article>;
}
