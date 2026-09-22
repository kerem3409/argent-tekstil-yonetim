import { useRef, useState } from 'react';
import { productDefinitionRepository } from '../../data/productDefinitions';
import { Field, useResource } from '../shared/WorkshopUI';

// İç içe form açılmaz; hızlı ekleme stok formunun alanlarını ve değerlerini korur.
export function ProductDefinitionSelect({ value, onChange, disabled = false, quickAdd = false }: { value: string; onChange: (id: string, name: string) => void; disabled?: boolean; quickAdd?: boolean }) {
  const resource = useResource(productDefinitionRepository.list);
  const [adding, setAdding] = useState(false); const [name, setName] = useState('');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const busy = useRef(false);
  const active = (resource.data ?? []).filter((d) => d.status === 'Aktif');
  const selected = active.some((d) => d.id === value) ? value : '';
  async function save() {
    if (busy.current) return; busy.current = true; setSaving(true); setError('');
    try { const record = await productDefinitionRepository.save({ name, note: '', status: 'Aktif' }); resource.reload(); onChange(record.id, record.name); setAdding(false); setName(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ürün kaydedilemedi.'); }
    finally { busy.current = false; setSaving(false); }
  }
  return <div>
    <Field label="Ürün Seç *"><select name="productDefinitionId" required disabled={disabled || saving || !resource.data || !!resource.error} value={selected} onChange={(e) => onChange(e.target.value, active.find((d) => d.id === e.target.value)?.name ?? '')}><option value="">Ürün seçin</option>{active.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
    {resource.error && <p role="alert" className="ws-error">{resource.error} <button type="button" onClick={resource.reload}>Tekrar dene</button></p>}
    {resource.data && !active.length && <p className="ws-hint">Aktif ürün tanımı bulunmuyor. Önce yeni ürün tanımlayın.</p>}
    {value && !selected && resource.data && <p role="alert" className="ws-error">Seçilen ürün aktif değil veya bulunamadı. Aktif bir ürün seçin.</p>}
    {quickAdd && !disabled && <button type="button" className="button ws-secondary" disabled={saving} onClick={() => { setAdding(!adding); setError(''); }}>+ Yeni Ürün Tanımla</button>}
    {adding && <div className="ws-card" role="group" aria-label="Yeni Ürün Tanımla"><h3>Yeni Ürün Tanımla</h3><Field label="Yeni Ürün Adı"><input value={name} maxLength={200} disabled={saving} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} /></Field>{error && <p role="alert" className="ws-error">{error}</p>}<button type="button" className="button" disabled={saving} onClick={() => void save()}>{saving ? 'Kaydediliyor…' : 'Ürünü Kaydet'}</button> <button type="button" className="button ws-secondary" disabled={saving} onClick={() => setAdding(false)}>Vazgeç</button></div>}
  </div>;
}
