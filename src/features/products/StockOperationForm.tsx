import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Contact } from '../contacts/model';
import type { AdjustmentInput, ReturnInput, StockRecord } from './model';
import { money, number, today } from './model';
import { Field, SupplierSelect } from './Fields';

export function StockOperationForm({ record, contacts, kind, minDate, onAdjust, onReturn, onCancel }: {
  record: StockRecord; contacts: Contact[]; kind: 'adjust' | 'return'; minDate: string;
  onAdjust: (input: AdjustmentInput) => Promise<void>; onReturn: (input: ReturnInput) => Promise<void>; onCancel: () => void;
}) {
  const [mode, setMode] = useState<AdjustmentInput['mode']>('total');
  const [amount, setAmount] = useState(kind === 'adjust' ? record.quantity : 1);
  const [date, setDate] = useState(today() < minDate ? minDate : today());
  const [description, setDescription] = useState('');
  const [postAccount, setPostAccount] = useState(false);
  const [supplierId, setSupplierId] = useState(record.supplierId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const next = kind === 'return' ? record.quantity - amount : mode === 'total' ? amount : record.quantity + amount;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      if (kind === 'adjust') await onAdjust({ mode, amount, date, description });
      else await onReturn({ quantity: amount, date, description, postAccount, supplierId });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'İşlem kaydedilemedi.'); }
    finally { busy.current = false; setSaving(false); }
  }
  return <form className="product-form" onSubmit={submit}>
    {error && <p role="alert" className="product-alert">{error}</p>}
    <fieldset className="product-card" disabled={saving}><legend>{kind === 'adjust' ? 'Sayım / Stok Düzeltme' : 'Tedarikçiye İade'}</legend>
      <p className="product-hint">{record.name} · {record.batch} · {record.color} · {record.series || 'Seri belirtilmedi'}<br />Mevcut stok: {number(record.quantity)} adet</p>
      <div className="product-grid">
        {kind === 'adjust' && <Field label="Düzeltme Yöntemi"><select value={mode} onChange={(event) => { setMode(event.target.value as AdjustmentInput['mode']); setAmount(event.target.value === 'total' ? record.quantity : 0); }}><option value="total">Yeni toplam adet</option><option value="difference">Fark miktarı (+ / −)</option></select></Field>}
        <Field label={kind === 'return' ? 'İade Adedi *' : mode === 'total' ? 'Yeni Adet *' : 'Fark Miktarı *'}><input type="number" step="1" required min={kind === 'return' ? 1 : mode === 'total' ? 0 : -record.quantity} max={kind === 'return' ? record.quantity : 1000000000} value={Number.isNaN(amount) ? '' : amount} onChange={(event) => setAmount(event.target.valueAsNumber)} /></Field>
        <Field label="Tarih *"><input type="date" required min={minDate} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Açıklama *"><textarea required maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        {kind === 'return' && <><Field label="Cari hesaba işlensin mi?"><select value={postAccount ? 'yes' : 'no'} onChange={(event) => setPostAccount(event.target.value === 'yes')}><option value="no">Hayır</option><option value="yes">Evet</option></select></Field>{postAccount && <SupplierSelect contacts={contacts} value={supplierId} required onChange={setSupplierId} />}</>}
      </div>
      <p className="product-total">İşlem sonrası stok: <strong>{Number.isFinite(next) ? number(next) : '—'} adet</strong></p>
      {kind === 'return' && postAccount && <p className="product-hint">İade tutarı: {Number.isFinite(amount) ? money(amount * record.unitCostMinor) : '—'}. Seçilen firmanın net borcunu azaltır; borcu aşan bölüm alacak bakiyesine dönüşür.</p>}
    </fieldset>
    <div className="product-actions"><button type="button" className="button product-secondary" disabled={saving} onClick={onCancel}>Vazgeç</button><button className="button" disabled={saving}>{saving ? 'Kaydediliyor…' : 'İşlemi Kaydet'}</button></div>
  </form>;
}
