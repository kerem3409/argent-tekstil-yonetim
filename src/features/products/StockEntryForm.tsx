import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Contact } from '../contacts/model';
import { entryQuantity, entryTypes, money, newStockInput, number, procurement, validateStock } from './model';
import type { StockInput, StockRecord } from './model';
import { Field, SupplierSelect } from './Fields';
import { ProductDefinitionSelect } from '../productDefinitions/ProductDefinitionSelect';

export function StockEntryForm({ records, contacts, nextBatch, onSave, onCancel }: {
  records: StockRecord[]; contacts: Contact[]; nextBatch: number; onSave: (input: StockInput) => Promise<void>; onCancel: () => void;
}) {
  const [value, setValue] = useState<StockInput>(() => ({ ...newStockInput(), colors: [{ color: '', quantity: 1 }] }));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  function set<K extends keyof StockInput>(key: K, next: StockInput[K]) { setValue((previous) => ({ ...previous, [key]: next })); }
  const batches = records.filter((item, index) => records.findIndex((record) => record.batch === item.batch) === index);
  const quantity = entryQuantity(value);
  const total = quantity * Math.round(value.unitCost * 100);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    const validation = validateStock(value); if (!value.productDefinitionId) validation.push('Aktif bir ürün seçin.'); setErrors(validation);
    if (validation.length) { requestAnimationFrame(() => errorRef.current?.focus()); return; }
    busy.current = true; setSaving(true);
    try { await onSave(value); }
    catch (error) { setErrors([error instanceof Error ? error.message : 'Stok kaydedilemedi.']); requestAnimationFrame(() => errorRef.current?.focus()); }
    finally { busy.current = false; setSaving(false); }
  }
  function text(key: 'brand' | 'detail' | 'fabric' | 'grammage' | 'series' | 'assortment' | 'note', label: string, required = false) {
    const props = { value: value[key], required, maxLength: ['detail', 'note'].includes(key) ? 2000 : 300,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, event.target.value) };
    return <Field label={label}>{key === 'detail' || key === 'note' ? <textarea {...props} rows={3} /> : <input {...props} readOnly={!!value.existingBatch && key === 'brand'} />}</Field>;
  }
  return <form onSubmit={submit} className="product-form">
    <p className="product-hint">* zorunlu alanlar. Tutarlar TL cinsindedir.</p>
    {!!errors.length && <div ref={errorRef} tabIndex={-1} role="alert" className="product-alert"><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    <fieldset disabled={saving} className="product-card"><legend>Giriş Türü</legend>
      <Field label="Giriş Türü *"><select value={value.entryType} onChange={(event) => set('entryType', event.target.value as StockInput['entryType'])}>{entryTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
      {value.entryType === 'İade' && <p className="product-hint">Bu giriş, geri gelen ürünleri stoğa ekler. Tedarikçiye iade için listede ilgili kaydın İade işlemini kullanın.</p>}
      {value.entryType === 'Sayım / Stok Düzeltme' && <p className="product-hint">Burada yeni bir stok satırı açılır. Mevcut kaydın adedini değiştirmek için listedeki Stok Düzelt işlemini kullanın.</p>}
    </fieldset>
    <fieldset disabled={saving} className="product-card"><legend>Ürün Bilgileri</legend>
      <Field label="Parti seçimi"><select value={value.existingBatch} onChange={(event) => {
        const batch = records.find((item) => item.batch === event.target.value);
        setValue((previous) => ({ ...previous, existingBatch: event.target.value, ...(batch ? { productDefinitionId: batch.productDefinitionId, name: batch.name, brand: batch.brand, detail: batch.detail, fabric: batch.fabric, grammage: batch.grammage } : { productDefinitionId: '', name: '' }) }));
      }}><option value="">Yeni parti oluştur</option>{batches.map((item) => <option key={item.batch} value={item.batch}>{item.batch} · {item.name} {item.brand && `· ${item.brand}`}</option>)}</select></Field>
      <p className="product-hint">Aynı ürün için farklı renk veya seri/asorti girerken mevcut partiyi seçebilirsiniz.</p>
      <div className="product-grid"><ProductDefinitionSelect value={value.productDefinitionId ?? ''} disabled={!!value.existingBatch && !!records.find((r) => r.batch === value.existingBatch)?.productDefinitionId} quickAdd onChange={(productDefinitionId, name) => setValue((previous) => ({ ...previous, productDefinitionId, name }))} />{text('brand', 'Marka')}{text('detail', 'Ürün Detayı')}{text('fabric', 'Kumaş')}{text('grammage', 'Gramaj (g/m²)')}</div>
    </fieldset>
    <fieldset disabled={saving} className="product-card"><legend>Parti Bilgileri</legend>
      <section className="product-colors" aria-labelledby="color-distribution-heading"><h2 id="color-distribution-heading">Renk Dağılımı</h2>
        {(value.colors ?? []).map((row, index) => <div className="product-color-row" key={index}>
          <Field label={`Renk ${index + 1} *`}><input required maxLength={100} value={row.color} onChange={(event) => setValue((previous) => ({ ...previous, colors: previous.colors!.map((item, i) => i === index ? { ...item, color: event.target.value } : item) }))} /></Field>
          <Field label={`Adet ${index + 1} *`}><input type="number" required min="1" max="1000000000" step="1" value={Number.isNaN(row.quantity) ? '' : row.quantity} onChange={(event) => { const quantity = event.target.valueAsNumber; setValue((previous) => ({ ...previous, colors: previous.colors!.map((item, i) => i === index ? { ...item, quantity } : item) })); }} /></Field>
          <button type="button" className="button product-secondary" disabled={value.colors!.length === 1} aria-label={`${index + 1}. renk satırını sil`} onClick={() => setValue((previous) => ({ ...previous, colors: previous.colors!.filter((_, i) => i !== index) }))}>Satırı Sil</button>
        </div>)}
        <button type="button" className="button product-secondary" onClick={() => setValue((previous) => ({ ...previous, colors: [...previous.colors!, { color: '', quantity: 1 }] }))}>+ Renk Ekle</button>
      </section><div className="product-grid">
      <Field label="Parti No"><input value={value.existingBatch || `P-${String(nextBatch).padStart(4, '0')}`} readOnly /><small>Yeni parti numarası kayıt sırasında kesinleşir.</small></Field>
      {text('series', "Seri (ör. 5’li)")}{text('assortment', 'Asorti (ör. S1 / M1 / L2 / XL1)')}
      <Field label="Paket İçeriği (adet) *"><input type="number" min="1" max="1000000000" step="1" required value={Number.isNaN(value.packSize) ? '' : value.packSize} onChange={(event) => set('packSize', event.target.valueAsNumber)} /></Field>
      <Field label="Toplam Adet"><input readOnly value={Number.isFinite(quantity) ? number(quantity) : '—'} /><small>Renk adetlerinin toplamından otomatik hesaplanır.</small></Field>
      <Field label="Birim Maliyet (TL / adet) *"><input type="number" min="0" step="0.01" required value={Number.isNaN(value.unitCost) ? '' : value.unitCost} onChange={(event) => set('unitCost', event.target.valueAsNumber)} /></Field>
      <Field label="Giriş Tarihi *"><input type="date" required value={value.date} onChange={(event) => set('date', event.target.value)} /></Field>
      {text('note', 'Not')}
    </div><p className="product-hint">Her renk aynı parti altında ayrı stok satırı olarak kaydedilir. Seri ve asorti açıklama alanlarıdır. Paket içeriği, renk bazında paket satışlarında kullanılır; paket dışındaki adetler de stokta korunur.</p></fieldset>
    <fieldset disabled={saving} className="product-card"><legend>Tedarik ve Cari Hesap</legend><div className="product-grid">
      <SupplierSelect contacts={contacts} value={value.supplierId} required={value.postAccount} onChange={(id) => set('supplierId', id)} />
      <Field label="Temin Türü"><input readOnly value={procurement[value.entryType]} /></Field>
      <Field label="Cari hesaba işlensin mi?"><select value={value.postAccount ? 'yes' : 'no'} onChange={(event) => set('postAccount', event.target.value === 'yes')}><option value="no">Hayır</option><option value="yes">Evet</option></select></Field>
      {value.postAccount && <Field label="Cari İşlem Türü"><select value={value.accountAction} onChange={(event) => set('accountAction', event.target.value as StockInput['accountAction'])}><option>Borç oluştur</option><option>Alacaktan mahsup et</option></select></Field>}
    </div>
    {!contacts.some((item) => item.status === 'Aktif') && <p className="product-hint">Seçilebilir firma bulunmuyor. Firma / Kişiler modülünden aktif kayıt oluşturabilirsiniz.</p>}
    <p className="product-total">Toplam alış tutarı: <strong>{Number.isSafeInteger(total) && total >= 0 ? money(total) : '—'}</strong><span>{Number.isFinite(quantity) ? number(quantity) : '—'} adet × birim maliyet</span></p>
    {value.postAccount && <p className="product-hint">Bu alış ilgili firmanın cari hesabına otomatik yansır. Alacaktan mahsup, firmanın net alacağını azaltır; alacağı aşan bölüm borç bakiyesine dönüşür.</p>}
    </fieldset>
    <div className="product-actions"><button type="button" className="button product-secondary" disabled={saving} onClick={onCancel}>Vazgeç</button><button className="button" disabled={saving}>{saving ? 'Kaydediliyor…' : 'Stok Girişini Kaydet'}</button></div>
  </form>;
}
