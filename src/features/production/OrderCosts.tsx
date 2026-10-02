import { useRef, useState } from 'react';
import type { ProductionOrder } from '../../domain/productionOrder';
import { costMoney, validateCostPrices } from '../../domain/productionCosts';
import type { CostPrices } from '../../domain/productionCosts';
import { actualProductionCosts, emptyOrderCosting } from '../../domain/orderCosting';
import { orderRepository, productionRepository } from '../../data/production';
import { inventory } from '../../data/inventory';
import { financeRepository } from '../../data/finance';
import { contactRepository } from '../../data/contacts';
import { Form, Table, useResource } from '../shared/WorkshopUI';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';
import { OrderCostFields } from './OrderCostFields';
import { OrderCostSources } from './OrderCostSources';

export function OrderCosts({ order, done }: { order: ProductionOrder; done: () => void }) {
  const [prices, setPrices] = useState<CostPrices>({ ...order.costPricesMinor });
  const [costing, setCosting] = useState(() => structuredClone(order.costing ?? emptyOrderCosting()));
  const [dirty, setDirty] = useState(false), ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  const data = useResource(async () => { const [fabrics, materials, production, finance, contacts] = await Promise.all([inventory.fabrics.load(), inventory.materials.load(), productionRepository.load(), financeRepository.load(), contactRepository.list()]); return { fabrics, materials, production, finance, contacts }; });
  let calculated: ReturnType<typeof actualProductionCosts> | undefined, error = data.error;
  try { validateCostPrices(prices); calculated = actualProductionCosts({ ...order, costPricesMinor: prices, costing }, data.data); } catch (e) { error = (e as Error).message; }
  return <div ref={ref}>{!data.data && !error && <p>Maliyet kaynakları yükleniyor…</p>}<Form label="Maliyetleri Kaydet" onDone={() => { setDirty(false); done(); }} onSubmit={async () => { if (error || !data.data) throw new Error(error || 'Maliyet kaynaklarını bekleyin.'); await orderRepository.saveCosts(order.id, order.revision, prices, costing); }}>
    <fieldset disabled={!!order.archived || !!order.deleted || !data.data}><OrderCostFields prices={prices} costing={costing} stages={order.product.enabledStages} contacts={data.data?.contacts ?? []} materials={data.data?.materials.records ?? []} date={order.date} onPrices={(v) => { setPrices(v); setDirty(true); }} onCosting={(v) => { setCosting(v); setDirty(true); }} /></fieldset>
    {error && <p role="alert">{error}</p>}{!!calculated?.missing.length && <p role="alert">Bağlı maliyet kaydı bulunamadı; toplam eksik olabilir.</p>}
    <p>Kullanılan Kumaş: {calculated?.fabricKg ?? '—'} kg · Sağlam Tamamlanan: {calculated?.completed ?? 0} adet</p>
    <Table headers={['Maliyet Kalemi', 'Birim Maliyet', 'Toplam Maliyet']} rows={(calculated?.rows ?? []).map((r) => [r.name, r.unit === undefined ? 'Henüz hesaplanamadı' : costMoney(r.unit), r.total === undefined ? '—' : costMoney(r.total)])} />
    <p>Toplam Gerçek Üretim Maliyeti: <strong>{calculated ? costMoney(calculated.total) : '—'}</strong> · Gerçek Birim Maliyet: <strong>{calculated?.unit === undefined ? 'Henüz hesaplanamadı' : costMoney(calculated.unit)}</strong></p>
    <p className="ws-hint">Aşama bedeli fire dahil işlem gören adet üzerinden hesaplanır. Kaydettiğiniz fiyatlar sonuç kaydedildiğinde ilgili fasoncunun carisine yansır. Stok/fason kaynaklarında mevcut cari borç tekrar oluşturulmaz.</p>
  </Form><OrderCostSources order={order} done={done} /></div>;
}
