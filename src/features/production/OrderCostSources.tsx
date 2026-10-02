import { useRef, useState } from 'react';
import type { ProductionOrder } from '../../domain/productionOrder';
import { automaticCostSources, costSources } from '../../domain/generalSheetCosts';
import { costMoney } from '../../domain/productionCosts';
import { inventory } from '../../data/inventory';
import { financeRepository } from '../../data/finance';
import { orderRepository, productionRepository } from '../../data/production';
import { Form, useResource } from '../shared/WorkshopUI';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export function OrderCostSources({ order, done }: { order: ProductionOrder; done: () => void }) {
  const [settings, setSettings] = useState(() => structuredClone(order.sheetCosts ?? { estimated: {}, sources: [] }));
  const [dirty, setDirty] = useState(false), ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  const data = useResource(async () => { const [fabrics, materials, production, finance, orders] = await Promise.all([inventory.fabrics.load(), inventory.materials.load(), productionRepository.load(), financeRepository.load(), orderRepository.list()]); return { fabrics, materials, production, finance, orders }; });
  const sources = data.data ? costSources(data.data) : [], automatic = data.data ? automaticCostSources(order, data.data, sources) : [];
  return <details className="production-screen-only"><summary>Mevcut stok / fason / gider kayıtlarını bağla</summary><div ref={ref}>{data.error ? <p role="alert">{data.error}</p> : !data.data ? <p>Kaynaklar yükleniyor…</p> : <Form label="Föy Maliyetlerini Kaydet" onDone={() => { setDirty(false); done(); }} onSubmit={() => orderRepository.saveSheetCosts(order.id, order.revision, settings)}><fieldset disabled={!!order.archived || !!order.deleted}>
    <p>Bağlı stok/fason hareketi aynı kalemin tekrar hesaplanmasını önler; yeni cari borç üretmez.</p>
    <div className="cost-source-list">{sources.filter((source) => !data.data!.orders.some((o) => o.id !== order.id && (o.sheetCosts?.sources.includes(source.id) || automaticCostSources(o, data.data!, sources).some((s) => s.id === source.id)))).map((source) => <label key={source.id}><input type="checkbox" disabled={automatic.some((s) => s.id === source.id)} checked={settings.sources.includes(source.id) || automatic.some((s) => s.id === source.id)} onChange={(e) => { setSettings((s) => ({ ...s, sources: e.target.checked ? [...s.sources, source.id] : s.sources.filter((id) => id !== source.id) })); setDirty(true); }} />{source.date} · {source.category} · {source.description} · {costMoney(source.total)}</label>)}</div>
    {settings.sources.filter((id) => !sources.some((s) => s.id === id)).map((id) => <p key={id}>Bulunamayan kaynak: {id} <button type="button" onClick={() => { setSettings((s) => ({ ...s, sources: s.sources.filter((v) => v !== id) })); setDirty(true); }}>Bağlantıyı Kaldır</button></p>)}
  </fieldset></Form>}</div></details>;
}
