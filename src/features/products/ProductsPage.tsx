import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productRepository } from '../../data/products';
import { contactRepository } from '../../data/contacts';
import type { Contact } from '../contacts/model';
import { filterStock, money, number, procurement } from './model';
import type { ProductStore, StockRecord } from './model';
import { Field } from './Fields';
import { StockEntryForm } from './StockEntryForm';
import { StockOperationForm } from './StockOperationForm';
import { StockHistory } from './StockHistory';
import './products.css';
import { SaleForm } from '../sales/SaleForm';

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('islem') ?? '';
  const id = params.get('id') ?? '';
  const [data, setData] = useState<ProductStore | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const statusBusy = useRef(false);
  const filters = { search: params.get('ara') ?? '', brand: params.get('marka') ?? '', batch: params.get('parti') ?? '', color: params.get('renk') ?? '', status: params.get('durum') ?? '' };
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [next, people] = await Promise.all([productRepository.load(), contactRepository.list()]);
        if (active) { setData(next); setContacts(people); setError(''); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Kayıtlar yüklenemedi.'); }
    }
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('storage', refresh);
    return () => { active = false; window.removeEventListener('storage', refresh); };
  }, [attempt]);
  useEffect(() => { document.getElementById('products-heading')?.focus(); }, [mode, id]);
  function navigate(nextMode = '', stockId = '') {
    const next = new URLSearchParams(params); next.delete('islem'); next.delete('id');
    if (nextMode) next.set('islem', nextMode); if (stockId) next.set('id', stockId);
    setNotice(''); setParams(next);
  }
  function filter(key: string, value: string) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); }
  async function finish(stockId: string, message: string) {
    // Yazım tamamlandıktan sonraki okuma hatası, kaydı yeniden göndertmemelidir.
    try { setData(await productRepository.load()); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Liste yenilenemedi.'); }
    navigate('gecmis', stockId); setNotice(message);
  }
  async function toggle(record: StockRecord) {
    if (statusBusy.current) return; statusBusy.current = true; setBusy(true);
    try { await productRepository.setStatus(record.id, record.status === 'Aktif' ? 'Pasif' : 'Aktif'); await finish(record.id, 'Stok durumu güncellendi.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Durum değiştirilemedi.'); }
    finally { statusBusy.current = false; setBusy(false); }
  }
  const selected = data?.records.find((item) => item.id === id);
  const title = mode === 'satis' ? 'Satış Yap / Stok Çıkışı' : mode === 'yeni' ? 'Yeni Stok Girişi' : mode === 'duzelt' ? 'Stok Düzelt' : mode === 'iade' ? 'İade' : mode === 'gecmis' ? 'Stok Detayı ve Hareket Geçmişi' : 'Stoktaki Ürünler';
  const records = data ? filterStock(data.records, filters) : [];
  function options(key: 'brand' | 'batch' | 'color') { return [...new Set(data?.records.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')); }
  return <div className="products-module">
    <div className="page-heading"><div><h1 id="products-heading" tabIndex={-1}>{title}</h1><p>Hazır ürün stoklarını parti, renk ve seri / asorti bazında takip edin.</p></div><div className="product-actions">{mode ? <button className="button product-secondary" onClick={() => navigate()}>Listeye dön</button> : <button className="button" disabled={!data || !!error} onClick={() => navigate('yeni')}>Yeni Stok Girişi</button>}</div></div>
    {notice && <p className="product-notice" role="status">{notice}</p>}
    {error && <div className="product-alert" role="alert"><p>{error}</p><button className="button" onClick={() => setAttempt((value) => value + 1)}>Tekrar dene</button></div>}
    {!data && !error && <p role="status">Kayıtlar yükleniyor…</p>}
    {data && !error && <>
      {mode === 'yeni' ? <StockEntryForm records={data.records} contacts={contacts} nextBatch={data.nextBatch} onCancel={() => navigate()} onSave={async (input) => { const record = await productRepository.create(input); await finish(record.id, `${record.batch} için stok girişi kaydedildi.`); }} />
        : mode && (!selected || !['gecmis', 'duzelt', 'iade', 'satis'].includes(mode)) ? <div className="table-panel feedback">Stok kaydı veya ekran bulunamadı. Listeye dönerek bir kayıt seçin.</div>
        : selected && mode === 'satis' ? <SaleForm stock={selected} data={data} contacts={contacts} done={() => { void finish(selected.id, 'Satış, stok çıkışı ve cari alacak kaydedildi.'); }} />
        : selected && mode === 'gecmis' ? <><div className="product-actions product-history-actions"><button className="button product-secondary" disabled={selected.status === 'Pasif'} onClick={() => navigate('duzelt', selected.id)}>Stok Düzelt</button><button className="button product-secondary" disabled={selected.status === 'Pasif'} onClick={() => navigate('iade', selected.id)}>İade</button><button className="button" disabled={busy} onClick={() => void toggle(selected)}>{selected.status === 'Aktif' ? 'Pasif Yap' : 'Aktif Yap'}</button></div><StockHistory record={selected} data={data} contacts={contacts} /></>
        : selected && (mode === 'duzelt' || mode === 'iade') ? selected.status === 'Pasif' ? <p className="product-alert">Bu kayıt pasif. İşlem yapmak için hareket geçmişi ekranından aktif hale getirin.</p> : <StockOperationForm key={`${mode}-${id}`} record={selected} contacts={contacts} kind={mode === 'duzelt' ? 'adjust' : 'return'} minDate={data.movements.filter((item) => item.stockId === id).at(-1)?.date ?? selected.date} onCancel={() => navigate('gecmis', id)} onAdjust={async (input) => { await productRepository.adjust(id, input); await finish(id, 'Stok düzeltmesi kaydedildi.'); }} onReturn={async (input) => { await productRepository.returnStock(id, input); await finish(id, 'İade kaydedildi.'); }} />
        : <section className="table-panel"><div className="product-filters">
          <Field label="Arama"><input type="search" placeholder="Ürün, parti, renk, seri / asorti" value={filters.search} onChange={(event) => filter('ara', event.target.value)} /></Field>
          {([['brand', 'marka', 'Marka'], ['batch', 'parti', 'Parti'], ['color', 'renk', 'Renk']] as const).map(([key, param, label]) => <Field key={key} label={label}><select value={filters[key]} onChange={(event) => filter(param, event.target.value)}><option value="">Tümü</option>{options(key).map((item) => <option key={item}>{item}</option>)}</select></Field>)}
          <Field label="Durum"><select value={filters.status} onChange={(event) => filter('durum', event.target.value)}><option value="">Tümü</option><option>Aktif</option><option>Pasif</option></select></Field>
        </div><div className="table-heading"><h2>Ürün Stokları</h2><span className="record-count" role="status">{records.length} / {data.records.length} kayıt</span></div>
        <div className="table-scroll"><table className="product-table"><caption className="sr-only">Stoktaki Ürünler</caption><thead><tr>{['Ürün', 'Marka', 'Parti', 'Renk', 'Seri / Asorti', 'Paket Sayısı', 'Toplam Adet', 'Birim Maliyet', 'Tedarikçi', 'Temin Türü', 'Durum', 'İşlemler'].map((item) => <th key={item} scope="col">{item}</th>)}</tr></thead><tbody>{records.map((record) => <tr key={record.id}>
          <td><button className="product-link" onClick={() => navigate('gecmis', record.id)}>{record.name}</button></td><td>{record.brand || '—'}</td><td><strong>{record.batch}</strong></td><td>{record.color}</td><td>{record.series || '—'}<small>{record.assortment || 'Asorti belirtilmedi'}</small></td>
          <td>{number(Math.floor(record.quantity / record.packSize))}<small>{record.packSize} adet / paket{record.quantity % record.packSize ? ` + ${record.quantity % record.packSize} tek adet` : ''}</small></td><td><strong>{number(record.quantity)}</strong></td><td>{money(record.unitCostMinor)}</td>
          <td>{contacts.find((item) => item.id === record.supplierId)?.name || (record.supplierId ? 'Firma kaydı bulunamadı' : '—')}</td><td>{procurement[record.entryType]}</td><td><span className="badge">{record.status}</span></td>
          <td><div className="product-row-actions"><button disabled={record.status === 'Pasif' || record.quantity === 0} onClick={() => navigate('satis', record.id)}>Satış Yap / Stok Çıkışı</button><button onClick={() => navigate('gecmis', record.id)}>Hareket Geçmişi</button><button disabled={record.status === 'Pasif'} onClick={() => navigate('duzelt', record.id)}>Stok Düzelt</button><button disabled={record.status === 'Pasif'} onClick={() => navigate('iade', record.id)}>İade</button><button disabled={busy} onClick={() => void toggle(record)}>{record.status === 'Aktif' ? 'Pasif Yap' : 'Aktif Yap'}</button></div></td>
        </tr>)}{!records.length && <tr><td colSpan={12}><div className="empty-state"><h3>{data.records.length ? 'Filtrelere uygun stok bulunamadı' : 'Henüz ürün stoğu bulunmuyor'}</h3><p>{data.records.length ? 'Aramayı veya filtreleri değiştirebilirsiniz.' : 'Yeni Stok Girişi ile ilk kaydınızı oluşturun.'}</p></div></td></tr>}</tbody></table></div>
        <p className="product-hint">Paket sayısı, mevcut adedin paket içeriğine göre tam paket karşılığıdır; kalan tek adet ayrıca gösterilir.</p></section>}
    </>}
  </div>;
}
