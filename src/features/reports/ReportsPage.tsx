import { useState } from 'react';
import { loadSnapshot } from '../../data/reports/snapshot';
import { emptyFilters, financeReport, productionReport, salesReport, stockReport } from '../../domain/reportSelectors';
import { operations } from '../../domain/production';
import { Field, Page, Section, Table, useResource } from '../shared/WorkshopUI';
import { AccountSelect } from '../finance/PaymentForm';

export function ReportsPage({ kind }: { kind: string }) {
  const resource = useResource(loadSnapshot); const data = resource.data; const [filters, setFilters] = useState(emptyFilters);
  const finance = kind === 'finance-report' || kind === 'account-report';
  const title = { 'stock-report': 'Stok Raporu', 'production-report': 'Üretim Raporu', 'sales-report': 'Satış Raporu', 'finance-report': 'Finans Raporu', 'account-report': 'Cari Raporu' }[kind] ?? 'Rapor';
  const products = new Map<string, string>(); for (const r of data?.products?.records ?? []) products.set(r.productId ?? r.id, `${r.name} · ${r.brand}`); for (const p of data?.production?.plans ?? []) products.set(p.productId, `${p.name} · ${p.brand}`);
  const batches = kind === 'production-report' ? data?.production?.jobs.map((j) => j.number) ?? [] : [...new Set(data?.products?.records.map((r) => r.batch) ?? [])];
  const validRange = !filters.from || !filters.to || filters.from <= filters.to;
  const tables = data && validRange ? kind === 'stock-report' ? stockReport(data, filters) : kind === 'production-report' ? productionReport(data, filters) : kind === 'sales-report' ? salesReport(data, filters) : kind === 'account-report' && !filters.companyId ? [] : financeReport(data, filters, kind === 'account-report') : [];
  return <Page title={title} error={resource.error} loading={!data && !resource.error} reload={resource.reload}>{data && <>
    {!!data.errors.length && <p className="ws-error" role="alert">Eksik veri kaynakları var; rapor tam değildir. {data.errors.join(' ')}</p>}
    <div className="ws-filters"><Field label="Başlangıç Tarihi"><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field><Field label="Bitiş Tarihi"><input type="date" value={filters.to} min={filters.from} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field><AccountSelect data={data} value={filters.companyId ? `${filters.companyId}|${filters.responsibleId}` : ''} onChange={(value) => { const [companyId, responsibleId] = value.split('|'); setFilters({ ...filters, companyId, responsibleId: responsibleId || '' }); }} />
      {!finance && <><Field label="Ürün"><select value={filters.productId} onChange={(e) => setFilters({ ...filters, productId: e.target.value })}><option value="">Tümü</option>{[...products].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field><Field label="Parti / İş Kartı"><select value={filters.batch} onChange={(e) => setFilters({ ...filters, batch: e.target.value })}><option value="">Tümü</option>{batches.map((b) => <option key={b}>{b}</option>)}</select></Field></>}
      {kind === 'production-report' && <Field label="İşlem"><select value={filters.operation} onChange={(e) => setFilters({ ...filters, operation: e.target.value })}><option value="">Tümü</option>{operations.map((op) => <option key={op}>{op}</option>)}</select></Field>}
      <button className="button ws-secondary" onClick={() => setFilters(emptyFilters)}>Filtreleri Temizle</button>
    </div>
    {!validRange && <p role="alert" className="ws-error">Başlangıç tarihi bitişten sonra olamaz.</p>}
    {kind === 'account-report' && !filters.companyId && <p className="ws-hint">Cari rapor için bir firma veya açığa satış sorumlusu seçin.</p>}
    {kind === 'stock-report' && <p className="ws-hint">Kalan stok bitiş tarihi itibarıyladır; başlangıç tarihi ürün giriş/çıkış dönemini belirler. Ürün/parti filtreleri hazır ürünlere uygulanır; kumaş ve malzemeler firma/bitiş tarihine göre listelenir. Pasif stoklar da raporda yer alır.</p>}
    {finance && <p className="ws-hint">Borç/alacak bakiyesi bitiş tarihine kadarki tüm hareketlerden; ödeme, tahsilat ve gider tabloları seçilen tarih aralığından hesaplanır. Ürüne dağıtılmamış ödemeler için ürün filtresi uygulanmaz.</p>}
    {kind === 'production-report' && <p className="ws-hint">İşler başlangıç, fasonlar veriliş, tamamlanan üretimler tamamlanma tarihine göre süzülür. Durum ve dışarıdaki adetler günceldir.</p>}
    {tables.map((table) => <Section key={table.title} title={table.title}><Table headers={table.headers} rows={table.rows} /></Section>)}
  </>}</Page>;
}
