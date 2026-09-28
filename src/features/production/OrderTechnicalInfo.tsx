import type { ProductionOrder } from '../../domain/productionOrder';
import { PlanSizes } from './PlanStages';

export function SeriesPackage({ order }: { order: ProductionOrder }) {
  const p = order.product;
  return <><p>{p.sizeSeries}</p><PlanSizes item={p} /><dl className="production-summary">{[['Bir paketteki ürün', p.packaging.unitsPerPack], ['Paket tipi', p.packaging.type], ['Beden / paket', p.packaging.sizeMode], ['Ambalaj notu', p.packaging.note]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></>;
}
export function DecorationInfo({ order }: { order: ProductionOrder }) {
  const types = (['Nakış', 'Baskı'] as const).filter((s) => order.product.enabledStages.includes(s));
  return types.length ? <div className="decoration-info">{types.map((type) => {
    const info = type === 'Nakış' ? order.product.embroidery : order.product.printing;
    return <p key={type}><strong>{type}</strong> · Konum: {info?.position || '—'} · Ölçü: {info?.size || '—'}{[...(info?.notes ?? []), info?.technicalNote, info?.color].filter(Boolean).length > 0 && <> · Not: {[...(info?.notes ?? []), info?.technicalNote, info?.color].filter(Boolean).join('; ')}</>}</p>;
  })}</div> : <p>Nakış / Baskı yok</p>;
}
