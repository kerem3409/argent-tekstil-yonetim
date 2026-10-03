import type { ProductionOrder } from '../../domain/productionOrder';
import { productApplicationCards } from '../../domain/productionOrder';
import { PlanSizes } from './PlanStages';

export function SeriesPackage({ order }: { order: ProductionOrder }) {
  const p = order.product;
  return <><p>{p.sizeSeries}</p><PlanSizes item={p} /><dl className="production-summary">{[['Bir paketteki ürün', p.packaging.unitsPerPack], ['Paket tipi', p.packaging.type], ['Beden / paket', p.packaging.sizeMode], ['Ambalaj notu', p.packaging.note]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></>;
}
export function DecorationInfo({ order }: { order: ProductionOrder }) {
  const cards = productApplicationCards(order.product);
  return cards.length ? <div className="decoration-info">{cards.map((card) => <div key={card.id}><strong>{card.name || card.type}</strong><ul>{card.notes.filter(Boolean).map((note, i) => <li key={i}>{note}</li>)}</ul></div>)}</div> : <p>Baskı / Nakış yok</p>;
}
