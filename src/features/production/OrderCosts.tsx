import { useRef, useState } from 'react';
import type { ProductionOrder } from '../../domain/productionOrder';
import { costKeys, costMoney, productionCosts } from '../../domain/productionCosts';
import type { CostPrices } from '../../domain/productionCosts';
import { minor } from '../../domain/common';
import { orderRepository } from '../../data/production';
import { Form, Table } from '../shared/WorkshopUI';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export function OrderCosts({ order, done }: { order: ProductionOrder; done: () => void }) {
  const [prices, setPrices] = useState(() => Object.fromEntries(costKeys.map((key) => [key, String((order.costPricesMinor?.[key] ?? 0) / 100)])));
  const [dirty, setDirty] = useState(false); const ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  let calculated: ReturnType<typeof productionCosts> | undefined, error = '';
  const parsed: CostPrices = {};
  try { for (const key of costKeys) parsed[key] = minor(Number(prices[key])); calculated = productionCosts(order, parsed); } catch (e) { error = (e as Error).message; }
  return <div ref={ref}><Form label="Maliyetleri Kaydet" onDone={() => { setDirty(false); done(); }} onSubmit={async () => { if (error) throw new Error(error); await orderRepository.saveCosts(order.id, order.revision, parsed); }}>
    <fieldset disabled={!!order.archived || !!order.deleted}><Table headers={['Maliyet Kalemi', 'Miktar', 'Birim Fiyat', 'Toplam', 'Adet Başı Maliyet']} rows={(calculated?.rows ?? productionCosts(order).rows).map((r) => [r.key, r.quantity === undefined ? '—' : `${r.quantity.toLocaleString('tr-TR')} ${r.key === 'Kumaş' ? 'kg' : 'adet'}`, <input aria-label={`${r.key} Birim Fiyatı`} type="number" min="0" step="0.01" required value={prices[r.key]} onChange={(e) => { setPrices((p) => ({ ...p, [r.key]: e.target.value })); setDirty(true); }} />, r.total === undefined ? '—' : costMoney(r.total), r.perUnit === undefined ? 'Henüz hesaplanamadı' : `${costMoney(r.perUnit)}/adet`])} /></fieldset>
    {error && <p role="alert">{error}</p>}<p>TOPLAM ÜRETİM MALİYETİ: <strong>{calculated ? costMoney(calculated.total) : '—'}</strong></p><p>Genel Adet Başı Maliyet: {calculated?.perUnit === undefined ? 'Henüz hesaplanamadı' : `${costMoney(calculated.perUnit)}/adet`}</p>
    <p className="ws-hint">Kumaş: kesimde kaydedilen kg × kg fiyatı. Eksik kg veya aşama sonuçları tamamlandığında tutarlar güncellenir. Bu maliyet hesabı cari hareket veya stok düzeltmesi oluşturmaz.</p>
  </Form></div>;
}
