import { Link, useSearchParams } from 'react-router-dom';
import { productRepository } from '../../data/products';
import { OPEN_ACCOUNT_ID } from '../../domain/sales';
import { displayDate, money } from '../products/model';
import { Page, Section, Table, companyName, useCompanies, useResource } from '../shared/WorkshopUI';
export function SalesPage() {
  const resource = useResource(productRepository.load); const companies = useCompanies(); const [params, setParams] = useSearchParams(); const data = resource.data; const sale = data?.sales?.find((s) => s.id === params.get('satis'));
  const customer = (companyId: string, responsibleId: string) => companyId === OPEN_ACCOUNT_ID ? `Açığa Satış / ${data?.openResponsibles?.find((p) => p.id === responsibleId)?.name ?? '—'}` : companyName(companies.data, companyId);
  return <Page title="Satış Listesi" error={resource.error || companies.error} loading={!data && !resource.error} reload={resource.reload}><div className="ws-tabs"><Link className="button" to="/stok/urunler">Stoktan Satış Yap</Link>{sale && <button className="button ws-secondary" onClick={() => setParams({})}>Listeye Dön</button>}</div>
    {sale ? <Section title={`${sale.number} · ${customer(sale.companyId, sale.responsibleId)}`}><Table headers={['Bilgi', 'Değer']} rows={[
      ['Tarih', displayDate(sale.date)], ['Ürün', data?.records.find((r) => r.id === sale.stockId)?.name], ['Adet', sale.quantity], ['Birim Maliyet', money(sale.unitCostMinor)], ['Birim Satış', money(sale.unitPriceMinor)], ['Toplam', money(sale.quantity * sale.unitPriceMinor)], ['Durum', sale.status], ['Açıklama', sale.note],
      ['Stok Hareketi', <Link to={`/stok/urunler?islem=gecmis&id=${sale.stockId}`}>{sale.movementId}</Link>], ['Cari Hareketi', <Link to={`/finans/cari-hesaplar?firma=${sale.companyId}&sorumlu=${sale.responsibleId}`}>Satış / {sale.id}</Link>],
    ]} /></Section> : <Table headers={['Tarih', 'Satış No', 'Müşteri', 'Ürün', 'Parti', 'Renk', 'Adet', 'Birim Satış', 'Toplam', 'Durum']} rows={(data?.sales ?? []).map((s) => { const r = data?.records.find((r) => r.id === s.stockId); return [displayDate(s.date), <button className="button ws-secondary" onClick={() => setParams({ satis: s.id })}>{s.number}</button>, customer(s.companyId, s.responsibleId), r?.name, r?.batch, r?.color, s.quantity, money(s.unitPriceMinor), money(s.quantity * s.unitPriceMinor), s.status]; })} />}
  </Page>;
}
