import { colorKey, stageInput } from '../../domain/productionPlan';
import { groupResult, stageGroups } from '../../domain/productionPresentation';
import type { ProductionOrder } from '../../domain/productionOrder';
import { Section, Table } from '../shared/WorkshopUI';

export function QuantityTracking({ order }: { order: ProductionOrder }) {
  const p = order.product, groups = stageGroups(p), results = groups.map((g) => groupResult(p, g.types));
  const latest = [...results].reverse().find(Boolean);
  const amount = (rows: { color: string; quantity: number }[] | undefined, color?: string) => rows ? rows.filter((r) => !color || colorKey(r.color) === colorKey(color)).reduce((n, r) => n + r.quantity, 0) : undefined;
  const completed = amount(latest?.rows), requested = amount(p.colors)!;
  const cell = (index: number, color?: string) => {
    const actual = amount(results[index]?.rows, color), initial = amount(stageInput(p, groups[index].types[0]), color);
    if (actual === undefined) return '—';
    const delta = initial === undefined ? 0 : actual - initial;
    return `${actual}${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}`;
  };
  return <div className="order-quantity-tracking"><Section title="Adet Takibi"><Table headers={['Renk', 'Sipariş', ...groups.map((g) => g.name === 'Ütü & Paket' ? 'Ütü/Paket' : g.name), 'Tamamlanan']} rows={[
    ...p.colors.map((r) => [r.color, r.quantity, ...groups.map((_, i) => cell(i, r.color)), amount(latest?.rows, r.color) ?? '—']),
    ['TOPLAM', requested, ...groups.map((_, i) => cell(i)), completed ?? '—'],
  ]} /><p>Toplam Sipariş: {requested} · Tamamlanan Sağlam Ürün: {completed ?? '—'} · Sipariş Farkı: {completed === undefined ? '—' : `${completed - requested > 0 ? '+' : ''}${completed - requested}`}</p><p className="ws-hint">Parantez: aşama girişine göre fazla (+) veya fire (−). Tamamlanan, son kaydedilen sağlam çıktıdır; stok aktarımı tüm işlemler tamamlanınca açılır.</p></Section></div>;
}
