import type { ProductionRecord } from '../../domain/productionWorkflow';
import { commonSizeDistribution, productionSizes } from '../../domain/productionWorkflow';

export function CommonSizes({ production }: { production: ProductionRecord }) {
  const distribution = commonSizeDistribution(production);
  if (!distribution) return <p className="ws-hint">Eski kayıtta beden / pastal dağılımı belirtilmemiş.</p>;
  const sizes = productionSizes(production);
  return <div className="common-size-display">
    <div className="table-scroll"><table className="common-size-table"><thead><tr>{sizes.map((size) => <th key={size}>{size}</th>)}</tr></thead><tbody><tr>{sizes.map((size) => <td key={size}>{distribution[size] ?? 0}</td>)}</tr></tbody></table></div>
    <p className="ws-hint">Seri Toplamı: {sizes.reduce((sum, size) => sum + (distribution[size] ?? 0), 0)} parça</p>
  </div>;
}
