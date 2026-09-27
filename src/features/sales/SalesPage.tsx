import { SaleForm } from './SaleForm';
import { Field } from '../shared/WorkshopUI';
import { Link, useSearchParams } from 'react-router-dom';
import { productRepository } from '../../data/products';
import { OPEN_ACCOUNT_ID } from '../../domain/sales';
import { displayDate, money } from '../products/model';
import { Page, Section, Table, companyName, useCompanies, useResource } from '../shared/WorkshopUI';
export function SalesPage() {
  const resource = useResource(productRepository.load); const companies = useCompanies(); const [params, setParams] = useSearchParams(); const data = resource.data; const sale = data?.sales?.find((s) => s.id === params.get('satis'));
  const creating = params.get('islem') === 'yeni', selectedStock = data?.records.find((r) => r.id === params.get('stok') && r.status === 'Aktif' && r.quantity > 0);
  const customer = (companyId: string, responsibleId: string) => companyId === OPEN_ACCOUNT_ID ? `Açığa Satış / ${data?.openResponsibles?.find((p) => p.id === responsibleId)?.name ?? '—'}` : companyName(companies.data, companyId);
  return <Page title="Satış Listesi" error={resource.error || companies.error} loading={!data && !resource.error} reload={resource.reload}><div className="ws-tabs"><button className="button" onClick={() => setParams({ islem: 'yeni' })}>Yeni Satış</button>{creating && <button className="button ws-secondary" onClick={() => setParams({})}>Listeye Dön</button>}{sale && <button className="button ws-secondary" onClick={() => setParams({})}>Listeye Dön</button>}</div>
    {creating ? <><Field label="Stoktaki Ürünü Seç"><select value={selectedStock?.id ?? ''} onChange={(e) => setParams({ islem: 'yeni', stok: e.target.value })}><option value="">Seçin</option>{data?.records.filter((r) => r.status === 'Aktif' && r.quantity > 0).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.brand} · {r.detail} · {r.color} · {r.quantity} adet</option>)}</select></Field>{selectedStock && data && companies.data && <SaleForm key={selectedStock.id} stock={selectedStock} data={data} contacts={companies.data} done={() => { resource.reload(); setParams({}); }} />}</> : sale ? <Section title={`${sale.number} · ${customer(sale.companyId, sale.responsibleId)}`}><Table headers={['Bilgi', 'Değer']} rows={[
      ['Tarih', displayDate(sale.date)], ['Ürün', data?.records.find((r) => r.id === sale.stockId)?.name], ['Adet', sale.quantity], ['Birim Maliyet', money(sale.unitCostMinor)], ['Birim Satış', money(sale.unitPriceMinor)], ['Toplam', money(sale.quantity * sale.unitPriceMinor)], ['Durum', sale.status], ['Açıklama', sale.note],
      ['Stok Hareketi', <Link to={`/stok/urunler?islem=gecmis&id=${sale.stockId}`}>{sale.movementId}</Link>], ['Cari Hareketi', <Link to={`/finans/cari-hesaplar?firma=${sale.companyId}&sorumlu=${sale.responsibleId}`}>Satış / {sale.id}</Link>],
    ]} /></Section> : <Table headers={['Tarih', 'Satış No', 'Müşteri', 'Ürün', 'Marka', 'Parti', 'Renk', 'Adet', 'Birim Satış', 'Toplam', 'Durum']} rows={(data?.sales ?? []).map((s) => { const r = data?.records.find((r) => r.id === s.stockId); return [displayDate(s.date), <button className="button ws-secondary" onClick={() => setParams({ satis: s.id })}>{s.number}</button>, customer(s.companyId, s.responsibleId), r?.name, r?.brand, r?.batch, r?.color, s.quantity, money(s.unitPriceMinor), money(s.quantity * s.unitPriceMinor), s.status]; })} />}
  </Page>;
}
