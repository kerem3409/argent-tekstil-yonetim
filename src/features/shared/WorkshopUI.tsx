import { Component, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { contactRepository } from '../../data/contacts';
import type { Contact } from '../contacts/model';
import './workshop.css';

export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>(); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const loader = useRef(load); loader.current = load;
  useEffect(() => { let active = true; const read = async () => { try { const value = await loader.current(); if (active) { setData(value); setError(''); } } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Kayıtlar okunamadı.'); } }; void read(); window.addEventListener('storage', read); return () => { active = false; window.removeEventListener('storage', read); }; }, [revision]);
  return { data, error, reload: () => setRevision((value) => value + 1) };
}
export const useCompanies = () => useResource(() => contactRepository.list());
export const companyName = (contacts: Contact[] | undefined, id: string) => contacts?.find((item) => item.id === id)?.name ?? (id ? 'Firma kaydı bulunamadı' : '—');
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="ws-field"><span>{label}</span>{children}</label>; }
export function Input({ label, name, value, type = 'text', required = false, step, min, max }: { label: string; name: string; value?: string | number; type?: string; required?: boolean; step?: string; min?: string | number; max?: string | number }) { return <Field label={label}><input name={name} type={type} defaultValue={value} required={required} step={step} min={min} max={max} maxLength={2000} /></Field>; }
export function Select({ label, name, values, value = '' }: { label: string; name: string; values: readonly string[]; value?: string }) { return <Field label={label}><select name={name} defaultValue={value || values[0]}>{values.map((item) => <option key={item}>{item}</option>)}</select></Field>; }
export function AccountChoiceField({ debtOnly = false }: { debtOnly?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  return <><Field label="Cari hesaba işlensin mi?"><select value={enabled ? 'Evet' : 'Hayır'} onChange={(e) => setEnabled(e.target.value === 'Evet')}><option>Hayır</option><option>Evet</option></select></Field>{enabled ? <Select label="Cari İşlem Türü" name="account" values={debtOnly ? ['Borç oluştur'] : ['Borç oluştur', 'Alacaktan mahsup et']} /> : <input type="hidden" name="account" value="Hayır" />}</>;
}
export function CompanySelect({ contacts, role, name = 'companyId', value = '', required = false, own = false, preferredIds = [], label }: { contacts: Contact[]; role?: string; name?: string; value?: string; required?: boolean; own?: boolean; preferredIds?: string[]; label?: string }) {
  const active = contacts.filter((item) => item.status === 'Aktif');
  const preferred = (item: Contact) => preferredIds.length ? preferredIds.includes(item.id) : !!role && item.roles.some((r) => r === role);
  return <Field label={label ?? (own ? 'İşi Yapan / Atölye' : `Firma / Kişi${required ? ' *' : ''}`)}><select name={name} defaultValue={value} required={required}>
    <option value="">{own ? 'Kendi Atölyemiz' : 'Seçiniz'}</option>
    <optgroup label="Öncelikli kayıtlar">{active.filter(preferred).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
    <optgroup label="Diğer kayıtlar">{active.filter((item) => !preferred(item)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
  </select></Field>;
}
export const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
export const numeric = (form: FormData, key: string) => { const value = text(form, key); return value ? Number(value) : NaN; };
export function Form({ children, onSubmit, onDone, label = 'Kaydet' }: { children: ReactNode; onSubmit: (form: FormData) => Promise<unknown>; onDone: () => void; label?: string }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const running = useRef(false); const errorRef = useRef<HTMLParagraphElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (running.current) return; const form = new FormData(event.currentTarget); running.current = true; setBusy(true); setError(''); try { await onSubmit(form); onDone(); } catch (e) { setError(e instanceof Error ? e.message : 'İşlem başarısız.'); requestAnimationFrame(() => errorRef.current?.focus()); } finally { running.current = false; setBusy(false); } }
  return <form onSubmit={submit} className="ws-form">{error && <p className="ws-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}<fieldset disabled={busy}>{children}<div className="ws-actions"><button className="button">{busy ? 'Kaydediliyor…' : label}</button></div></fieldset></form>;
}
export function Action({ children, run, done, disabled = false }: { children: ReactNode; run: () => Promise<unknown>; done: () => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  return <span className="ws-action"><button type="button" className="button ws-secondary" disabled={disabled || busy} onClick={async () => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await run(); done(); } catch (e) { setError(e instanceof Error ? e.message : 'İşlem başarısız.'); } finally { lock.current = false; setBusy(false); } }}>{busy ? 'İşleniyor…' : children}</button>{error && <span className="ws-error" role="alert">{error}</span>}</span>;
}
export function Table({ headers, rows, caption = 'Kayıtlar' }: { headers: string[]; rows: ReactNode[][]; caption?: string }) { return <div className="table-panel"><div className="table-scroll"><table className="ws-table"><caption className="sr-only">{caption}</caption><thead><tr>{headers.map((item, i) => <th key={i} scope="col">{item}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}{!rows.length && <tr><td colSpan={headers.length}><div className="empty-state">Kayıt bulunmuyor.</div></td></tr>}</tbody></table></div></div>; }
export function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="ws-card"><h2>{title}</h2>{children}</section>; }
export function Page({ title, children, error, loading, reload }: { title: string; children: ReactNode; error?: string; loading?: boolean; reload?: () => void }) { return <div className="ws-page"><div className="page-heading"><h1>{title}</h1></div>{error && <p role="alert" className="ws-error">{error} {reload && <button onClick={reload}>Tekrar dene</button>}</p>}{loading ? <p role="status">Yükleniyor…</p> : children}</div>; }
export class ModuleBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div role="alert" className="ws-error">Bu ekran açılamadı. Diğer modülleri menüden kullanabilirsiniz. <button onClick={() => this.setState({ error: false })}>Tekrar dene</button></div> : this.props.children; }
}
