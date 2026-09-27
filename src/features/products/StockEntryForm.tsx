import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Contact } from '../contacts/model';
import { entryQuantity, money, newStockInput, validateStock } from './model';
import type { StockInput, StockRecord } from './model';
import { Field, SupplierSelect } from './Fields';
import { ProductDefinitionSelect } from '../productDefinitions/ProductDefinitionSelect';
import { PlannedSizes } from '../production/ProductionCardEditor';
import { defaultSizeDistribution, validateCommonSizeDistribution } from '../../domain/productionWorkflow';
import type { SizeSeries } from '../../domain/productionWorkflow';
import { orderRepository } from '../../data/production';
import { productRepository } from '../../data/products';
import { useResource } from '../shared/WorkshopUI';
import { StockOperationForm } from './StockOperationForm';
import '../production/production.css';

export function StockEntryForm({ records, contacts, onSave, onCancel, onOperationDone }: {
  records: StockRecord[]; contacts: Contact[]; nextBatch: number; onSave: (input: StockInput) => Promise<void>; onCancel: () => void; onOperationDone: (id: string) => Promise<void>;
}) {
  const [value, setValue] = useState<StockInput>(() => ({ ...newStockInput(), colors: [{ color: '', quantity: 1 }], postAccount: true }));
  const [series, setSeries] = useState<SizeSeries>('Yetişkin'), [sizes, setSizes] = useState(defaultSizeDistribution('Yetişkin'));
  const [errors, setErrors] = useState<string[]>([]), [saving, setSaving] = useState(false), [stockId, setStockId] = useState('');
  const [returnQty, setReturnQty] = useState(1), [saleId, setSaleId] = useState('');
  const brands = useResource(orderRepository.listBrands), stockData = useResource(productRepository.load), busy = useRef(false);
  const set = <K extends keyof StockInput>(key: K, next: StockInput[K]) => setValue((p) => ({ ...p, [key]: next }));
  const quantity = entryQuantity(value), total = Math.round(quantity * value.unitCost * 100), selected = records.find((r) => r.id === stockId);
  const purchase = value.entryType === 'Hazır Ürün Alımı', operation = value.entryType === 'İade' || value.entryType === 'Sayım / Stok Düzeltme';
  const types = <Field label="Giriş Türü *"><select value={value.entryType} onChange={(e) => { set('entryType', e.target.value as StockInput['entryType']); setErrors([]); }}>{['Hazır Ürün Alımı', 'İade', 'Sayım / Stok Düzeltme', 'Diğer'].map((type) => <option key={type} value={type}>{type === 'Sayım / Stok Düzeltme' ? 'Sayım Düzeltmesi' : type}</option>)}</select></Field>;
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy.current) return;
    const input = { ...value, existingBatch: '', series, assortment: Object.entries(sizes).map(([s, n]) => `${s}${n}`).join(' '), packSize: Object.values(sizes).reduce((n, v) => n + v, 0), postAccount: purchase, accountAction: 'Borç oluştur' as const };
    const validation = validateStock(input);
    if (!input.productDefinitionId) validation.push('Ürün seçin.');
    if (!brands.data?.some((b) => b.name === input.brand)) validation.push('Kayıtlı marka seçin.');
    try { validateCommonSizeDistribution(series, sizes); } catch (e) { validation.push((e as Error).message); }
    if (validation.length) { setErrors(validation); return; }
    busy.current = true; setSaving(true); setErrors([]);
    try { await onSave(input); } catch (e) { setErrors([(e as Error).message]); } finally { busy.current = false; setSaving(false); }
  }
  if (operation) return <div className="product-form"><div className="product-card">{types}<Field label="Stoktaki Ürün *"><select value={stockId} onChange={(e) => { setStockId(e.target.value); setSaleId(''); }}><option value="">Seçin</option>{records.filter((r) => r.status === 'Aktif').map((r) => <option key={r.id} value={r.id}>{r.name} · {r.brand} · {r.color} · {r.batch} · {r.quantity} adet</option>)}</select></Field></div>
    {selected && (value.entryType === 'Sayım / Stok Düzeltme' ? <StockOperationForm key={selected.id} record={selected} contacts={contacts} kind="adjust" minDate={stockData.data?.movements.filter((m) => m.stockId === selected.id).at(-1)?.date ?? selected.date} onCancel={onCancel} onAdjust={async (input) => { await productRepository.adjust(selected.id, input); await onOperationDone(selected.id); }} onReturn={async () => {}} /> : <form className="product-card" onSubmit={async (e) => { e.preventDefault(); if (busy.current) return; busy.current = true; setSaving(true); setErrors([]); try { await productRepository.receiveReturn(selected.id, { quantity: returnQty, saleId, date: value.date, description: value.note }); await onOperationDone(selected.id); } catch (e) { setErrors([(e as Error).message]); } finally { busy.current = false; setSaving(false); } }}>
      <fieldset disabled={saving}><legend>Müşteriden Gelen İade</legend><Field label="İlgili Satış / Müşteri"><select value={saleId} onChange={(e) => setSaleId(e.target.value)}><option value="">Bağlantısız iade</option>{stockData.data?.sales?.filter((s) => s.stockId === selected.id).map((s) => <option key={s.id} value={s.id}>{s.number} · {contacts.find((c) => c.id === s.companyId)?.name ?? 'Açığa Satış'} · {s.quantity} adet</option>)}</select></Field>
      <Field label="İade Adedi *"><input type="number" min="1" step="1" required value={returnQty} onChange={(e) => setReturnQty(e.target.valueAsNumber)} /></Field><Field label="Tarih *"><input type="date" required value={value.date} onChange={(e) => set('date', e.target.value)} /></Field><Field label="Açıklama *"><textarea required value={value.note} onChange={(e) => set('note', e.target.value)} /></Field><p>İşlem sonrası stok: {selected.quantity + (returnQty || 0)}</p><p className="product-hint">İade stok miktarını artırır. Ödeme/iade tutarı gerekiyorsa mevcut finans hareketinden işlenir.</p>{errors.map((e) => <p key={e} role="alert">{e}</p>)}<button className="button">İadeyi Kaydet</button></fieldset></form>)}
  </div>;
  return <form className="product-form" onSubmit={submit}>{errors.map((e) => <p key={e} role="alert" className="product-alert">{e}</p>)}<fieldset disabled={saving}><div className="product-card">{types}</div>
    <section className="product-card"><h2>Ürün Bilgileri</h2><div className="product-grid"><ProductDefinitionSelect value={value.productDefinitionId ?? ''} quickAdd onChange={(productDefinitionId, name) => setValue((p) => ({ ...p, productDefinitionId, name }))} /><Field label="Marka *"><select required value={value.brand} onChange={(e) => set('brand', e.target.value)}><option value="">Seçin</option>{brands.data?.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}</select></Field></div>{brands.error && <p role="alert">{brands.error}</p>}
      <div className="product-fabric-row"><Field label="Kumaş"><input value={value.fabric} onChange={(e) => set('fabric', e.target.value)} /></Field><Field label="Gramaj"><input value={value.grammage} onChange={(e) => set('grammage', e.target.value)} /></Field></div><Field label="Ürün Detayı"><textarea maxLength={2000} value={value.detail} onChange={(e) => set('detail', e.target.value)} /></Field></section>
    <section className="product-card"><h2>Renk Dağılımları</h2><div className="stock-colors-compact">{value.colors!.map((r, i) => <div className="product-color-row" key={i}><Field label={`Renk ${i + 1} *`}><input required value={r.color} onChange={(e) => set('colors', value.colors!.map((v, n) => i === n ? { ...v, color: e.target.value } : v))} /></Field><Field label={`Adet ${i + 1} *`}><input type="number" required min="1" step="1" value={r.quantity || ''} onChange={(e) => set('colors', value.colors!.map((v, n) => i === n ? { ...v, quantity: e.target.valueAsNumber } : v))} /></Field><button type="button" className="button product-secondary" aria-label={`Renk ${i + 1} sil`} disabled={value.colors!.length === 1} onClick={() => set('colors', value.colors!.filter((_, n) => n !== i))}>−</button></div>)}<button type="button" className="button product-secondary" onClick={() => set('colors', [...value.colors!, { color: '', quantity: 1 }])}>+ Renk Ekle</button></div></section>
    <section className="product-card"><h2>Seri / Asorti</h2><PlannedSizes series={series} value={sizes} onSeriesChange={setSeries} onChange={setSizes} /></section>
    <section className="product-card"><Field label="Giriş Tarihi *"><input type="date" required value={value.date} onChange={(e) => set('date', e.target.value)} /></Field><Field label={purchase ? 'Not' : 'Açıklama / Not *'}><textarea required={!purchase} maxLength={2000} value={value.note} onChange={(e) => set('note', e.target.value)} /></Field></section>
    <section className="product-card"><h2>Tedarikçi / Finans</h2><div className="product-grid">{purchase && <SupplierSelect contacts={contacts} value={value.supplierId} required onChange={(id) => set('supplierId', id)} />}<Field label="Toplam Adet"><input readOnly value={Number.isFinite(quantity) ? quantity : ''} /></Field><Field label="Birim Fiyat *"><input required type="number" min={purchase ? '0.01' : '0'} step="0.01" value={Number.isNaN(value.unitCost) ? '' : value.unitCost} onChange={(e) => set('unitCost', e.target.valueAsNumber)} /></Field><Field label="Toplam Tutar"><input readOnly value={Number.isSafeInteger(total) ? money(total) : '—'} /></Field></div>{purchase && <p className="product-hint">Hazır Ürün Alımı tedarikçinin cari hesabına borç olarak otomatik yansır.</p>}</section>
    <div className="product-actions"><button type="button" className="button product-secondary" onClick={onCancel}>Vazgeç</button><button className="button">{saving ? 'Kaydediliyor…' : 'Stok Girişini Kaydet'}</button></div></fieldset></form>;
}
