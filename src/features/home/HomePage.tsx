import { Link } from 'react-router-dom';
import { loadSnapshot } from '../../data/reports/snapshot';
import { dashboardSummary } from '../../domain/reportSelectors';
import { money, number } from '../products/model';
import { Page, useResource } from '../shared/WorkshopUI';

export function HomePage() {
  const resource = useResource(loadSnapshot); const data = resource.data; const summary = data ? dashboardSummary(data) : undefined;
  const incomplete = !!data?.errors.length;
  return <Page title="Ana Sayfa" error={resource.error} loading={!data && !resource.error} reload={resource.reload}>
    {incomplete && <p className="ws-error" role="alert">Bazı modüller okunamadığı için toplamlar gösterilmiyor. {data!.errors.join(' ')}</p>}
    {summary && <div className="ws-summary">{[
      ['Stoktaki Toplam Ürün Adedi', number(summary.stock), '/stok/urunler'],
      ['Devam Eden Üretim İşi', number(summary.jobs), '/uretim/takip'],
      ['Fasoncularda Devam Eden İş', number(summary.subcontractJobs), '/uretim/fason'],
      ['Toplam Alacak', money(summary.receivable), '/finans/alacaklar'],
      ['Toplam Borç', money(summary.debt), '/finans/borclar'],
    ].map(([label, value, path]) => <article key={label}><Link to={path}><span>{label}</span><strong>{incomplete ? '—' : value}</strong></Link></article>)}</div>}
    <p className="ws-hint">Ürün adedi aktif stok kayıtlarını kapsar. Borç ve alacak, firma / sorumlu kişi bazındaki net cari bakiyelerden hesaplanır.</p>
  </Page>;
}
