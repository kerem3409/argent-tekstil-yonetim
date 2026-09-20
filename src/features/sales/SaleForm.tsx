import { useState } from 'react';
import { productRepository } from '../../data/products';
import { OPEN_ACCOUNT_ID } from '../../domain/sales';
import type { Contact } from '../contacts/model';
import type { ProductStore, StockRecord } from '../products/model';
import { money, today } from '../products/model';
import { Field, Form, Input, Section, text } from '../shared/WorkshopUI';

export function SaleForm({ stock, data, contacts, done }: { stock: StockRecord; data: ProductStore; contacts: Contact[]; done: () => void }) {
  const [open, setOpen] = useState(false); const [responsible, setResponsible] = useState(''); const [kind, setKind] = useState<'Adet' | 'Paket'>('Adet'); const [qty, setQty] = useState(1); const [price, setPrice] = useState(0);
  const count = qty * (kind === 'Paket' ? stock.packSize : 1);
  return <div className="ws-page"><Section title="Satış Yap / Stok Çıkışı"><p className="ws-hint">{stock.name} · {stock.batch} · {stock.color} · {stock.series || '—'} / {stock.assortment || '—'}<br />Mevcut stok: {stock.quantity} adet · Paket içeriği: {stock.packSize} adet · Birim maliyet: {money(stock.unitCostMinor)}</p>
    <Form label="Satışı Kaydet" onDone={done} onSubmit={(f) => productRepository.sell({ stockId: stock.id, companyId: open ? OPEN_ACCOUNT_ID : text(f, 'companyId'), responsibleId: open ? responsible : '', responsibleName: text(f, 'responsibleName'), quantity: qty, quantityType: kind, price, date: text(f, 'date'), note: text(f, 'note') })}><div className="ws-grid">
      <Field label="Müşteri Türü"><select value={open ? 'open' : 'company'} onChange={(e) => setOpen(e.target.value === 'open')}><option value="company">Kayıtlı Firma</option><option value="open">Açığa Satış</option></select></Field>
      {open ? <><Field label="Sorumlu Kişi"><select value={responsible} onChange={(e) => setResponsible(e.target.value)}><option value="">Yeni sorumlu kişi</option>{(data.openResponsibles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>{!responsible && <Input label="Sorumlu Kişi Adı *" name="responsibleName" required />}</> : <Field label="Müşteri *"><select name="companyId" required><option value="">Seçiniz</option>{contacts.filter((c) => c.status === 'Aktif' && c.roles.includes('Hazır Giyim Müşterisi')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
      <Field label="Miktar Türü"><select value={kind} onChange={(e) => setKind(e.target.value as 'Adet' | 'Paket')}><option>Adet</option><option>Paket</option></select></Field><Field label="Miktar *"><input type="number" min="1" step="1" max={kind === 'Paket' ? Math.floor(stock.quantity / stock.packSize) : stock.quantity} required value={qty || ''} onChange={(e) => setQty(e.target.valueAsNumber)} /></Field><Field label="Birim Satış Fiyatı (TL / adet) *"><input type="number" min="0.01" step="0.01" required value={price || ''} onChange={(e) => setPrice(e.target.valueAsNumber)} /></Field><Input label="Tarih *" name="date" type="date" value={today()} required /><Input label="Açıklama" name="note" /></div><p className="ws-hint">Satış: {count || 0} adet · Toplam: {money(Math.round((count || 0) * (price || 0) * 100))}. Stok çıkışı ve cari alacak aynı satış kaydıyla oluşur.</p></Form>
  </Section></div>;
}
