import type { Contact } from '../contacts/model';
import { Link } from 'react-router-dom';
import type { ProductStore, StockRecord } from './model';
import { displayDate, money, number, procurement } from './model';

export function StockHistory({ record, data, contacts }: { record: StockRecord; data: ProductStore; contacts: Contact[] }) {
  const movements = data.movements.filter((item) => item.stockId === record.id);
  const ledger = data.accountMovements.filter((item) => item.stockId === record.id);
  return <>
    <section className="product-card"><h2>{record.name}</h2><dl className="product-detail-grid">{[
      ['Marka', record.brand], ['Parti / Renk', `${record.batch} / ${record.color}`], ['Seri / Asorti', `${record.series || '—'} / ${record.assortment || '—'}`],
      ['Kumaş / Gramaj', `${record.fabric || '—'} / ${record.grammage || '—'}`], ['Ürün Detayı', record.detail], ['Paket İçeriği', `${number(record.packSize)} adet`],
      ['Girişteki Paket Sayısı', number(record.initialPackCount)], ['Mevcut Adet', number(record.quantity)], ['Birim Maliyet', money(record.unitCostMinor)],
      ['Tedarikçi', contacts.find((item) => item.id === record.supplierId)?.name || (record.supplierId ? 'Firma kaydı bulunamadı' : 'Belirtilmedi')],
      ['Temin Türü', procurement[record.entryType]], ['Durum', record.status], ['Not', record.note],
      ...(record.productionNo ? [['Üretim No', record.productionNo], ['Beden', record.size || 'Belirtilmemiş']] : []),
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></section>
    <section className="table-panel"><div className="table-heading"><h2>Hareket Geçmişi</h2><span className="record-count">{movements.length} hareket</span></div><div className="table-scroll"><table><caption className="sr-only">Stok hareket geçmişi</caption><thead><tr>{['Tarih', 'İşlem Türü', 'Giriş', 'Çıkış', 'Kalan', 'Açıklama'].map((item) => <th key={item} scope="col">{item}</th>)}</tr></thead><tbody>{movements.map((item) => <tr key={item.id}><td>{displayDate(item.date)}</td><td>{item.type}</td><td>{item.incoming ? `+${number(item.incoming)}` : '—'}</td><td>{item.outgoing ? `−${number(item.outgoing)}` : '—'}</td><td>{number(item.balance)}</td><td className="product-wrap">{item.description}</td></tr>)}</tbody></table></div></section>
    {!!ledger.length && <section className="table-panel product-ledger"><div className="table-heading"><h2>Alış / İade Cari Hareketleri</h2></div><p className="product-hint">Bu kaynak hareketler ilgili firmanın cari hesabına otomatik yansır.</p><div className="table-scroll"><table><caption className="sr-only">Cari hareketler</caption><thead><tr>{['Tarih', 'Firma / Tedarikçi', 'İşlem', 'Tutar', 'Cari Hesap'].map((item) => <th key={item} scope="col">{item}</th>)}</tr></thead><tbody>{ledger.map((item) => <tr key={item.id}><td>{displayDate(item.date)}</td><td>{contacts.find((contact) => contact.id === item.contactId)?.name || 'Firma kaydı bulunamadı'}</td><td>{item.type}</td><td>{money(item.amountMinor)}</td><td><Link to={`/finans/cari-hesaplar?firma=${item.contactId}`}>Cari Hesabı Aç</Link></td></tr>)}</tbody></table></div></section>}
  </>;
}
