import { activeStages, colorKey, stageRecord } from '../../domain/productionPlan';
import { differenceText } from '../../domain/productionOrder';
import type { ProductionOrder } from '../../domain/productionOrder';
import { Section, Table } from '../shared/WorkshopUI';

export function QuantityTracking({ order }: { order: ProductionOrder }) {
  const p = order.product;
  const stages = activeStages(p);
  const results = stages.map((type) => stageRecord(p, type)?.result);
  const latest = [...results].reverse().find((result) => !!result);
  const amount = (result: typeof results[number], color: string) => result?.rows.find((r) => colorKey(r.color) === colorKey(color))?.quantity;
  const total = (result: typeof results[number]) => result ? result.rows.reduce((sum, r) => sum + r.quantity, 0) : undefined;
  const requested = p.colors.reduce((sum, r) => sum + r.quantity, 0);
  const completed = total(latest);
  return <div className="order-quantity-tracking"><Section title="Adet Takibi">
    <Table headers={['Renk', 'Sipariş', ...stages.map((s) => s === 'Ütü & Paket' ? 'Ütü/Paket' : s), 'Tamamlanan']}
      rows={[...p.colors.map((r) => [r.color, r.quantity, ...results.map((result) => amount(result, r.color) ?? '—'), amount(latest, r.color) ?? '—']),
        ['TOPLAM', requested, ...results.map((result) => total(result) ?? '—'), completed ?? '—']]} />
    <p>Toplam Sipariş: {requested} · Tamamlanan: {completed ?? '—'} · Genel Fark: {completed === undefined ? '—' : differenceText(requested, completed)}</p>
    <p className="ws-hint">Tamamlanan sütunu son kaydedilen aşama sonucudur. Üretimin tamamlanma ve stok durumu tüm aşamalara göre belirlenir.</p>
  </Section></div>;
}
