import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { contactRoles, subcontractServices, normalizeContact, validateContact } from './model';
import type { ContactErrors, ContactInput } from './model';

type Props = { initial: ContactInput; onSave: (input: ContactInput) => Promise<void>; onCancel: () => void };

export function ContactForm({ initial, onSave, onCancel }: Props) {
  const [value, setValue] = useState<ContactInput>(initial);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  function set<K extends keyof ContactInput>(key: K, next: ContactInput[K]) {
    setValue((previous) => ({ ...previous, [key]: next }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const normalized = normalizeContact(value);
    const nextErrors = validateContact(normalized);
    setErrors(nextErrors);
    setSaveError('');
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstError}"]`)?.focus();
      return;
    }
    submitting.current = true;
    setSaving(true);
    try { await onSave(normalized); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Kayıt saklanamadı. Tekrar deneyin.'); }
    finally { submitting.current = false; setSaving(false); }
  }

  function errorFor(key: keyof ContactInput) {
    return errors[key] ? <span id={`error-${key}`} className="contact-field-error">{errors[key]}</span> : null;
  }

  function field(key: 'name' | 'authorizedPerson' | 'phone' | 'email' | 'address' | 'note' | 'taxOffice' | 'taxNumber' | 'billingAddress', label: string, options: { multiline?: boolean; type?: string; limit: number; required?: boolean } ) {
    const props = {
      id: `contact-${key}`, name: key, value: value[key], maxLength: options.limit,
      required: options.required, 'aria-invalid': !!errors[key],
      'aria-describedby': errors[key] ? `error-${key}` : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, event.target.value),
    };
    return <div className={`contact-field ${options.multiline ? 'contact-full-width' : ''}`}>
      <label htmlFor={props.id}>{label}{options.required && <span aria-hidden="true"> *</span>}</label>
      {options.multiline ? <textarea {...props} rows={3} /> : <input {...props} type={options.type ?? 'text'} inputMode={key === 'taxNumber' ? 'numeric' : undefined} />}
      {errorFor(key)}
    </div>;
  }

  return <form ref={formRef} className="contact-form" onSubmit={submit} noValidate>
    <p className="contact-form-hint">* işaretli alanlar zorunludur. Diğer bilgileri daha sonra tamamlayabilirsiniz.</p>
    {Object.values(errors).some(Boolean) && <p className="contact-alert" role="alert">Lütfen işaretlenen alanları kontrol edin.</p>}
    {saveError && <p className="contact-alert" role="alert">{saveError}</p>}
    <fieldset className="contact-form-section" disabled={saving}>
      <legend>Temel Bilgiler</legend>
      <div className="contact-form-grid">
        <div className="contact-field"><label htmlFor="contact-type">Kayıt Türü *</label><select id="contact-type" name="type" value={value.type} onChange={(e) => set('type', e.target.value as ContactInput['type'])}><option>Firma</option><option>Şahıs</option></select></div>
        <div className="contact-field"><label htmlFor="contact-status">Durum *</label><select id="contact-status" name="status" value={value.status} onChange={(e) => set('status', e.target.value as ContactInput['status'])}><option>Aktif</option><option>Pasif</option></select></div>
        {field('name', value.type === 'Firma' ? 'Firma Adı / Unvanı' : 'Adı Soyadı / Unvanı', { limit: 200, required: true })}
        {field('authorizedPerson', 'Yetkili Adı Soyadı', { limit: 150 })}
        {field('phone', 'Telefon', { limit: 30, type: 'tel' })}
        {field('email', 'E-posta', { limit: 254, type: 'email' })}
        {field('address', 'Adres', { limit: 1000, multiline: true })}
        {field('note', 'Not', { limit: 2000, multiline: true })}
      </div>
    </fieldset>
    <fieldset className="contact-form-section" disabled={saving}><legend>Fatura Bilgileri</legend><div className="contact-form-grid">
      {field('taxOffice', 'Vergi Dairesi', { limit: 150 })}
      {field('taxNumber', 'Vergi No / T.C. No', { limit: 11 })}
      {field('billingAddress', 'Fatura Adresi', { limit: 1000, multiline: true })}
      <div className="contact-field"><label htmlFor="contact-invoice">E-Fatura / E-Arşiv Durumu</label><select id="contact-invoice" value={value.invoiceStatus} onChange={(e) => set('invoiceStatus', e.target.value as ContactInput['invoiceStatus'])}><option value="">Belirtilmedi</option><option>E-Fatura</option><option>E-Arşiv</option></select></div>
    </div></fieldset>
    <fieldset className="contact-form-section" disabled={saving} aria-describedby={errors.roles ? 'error-roles' : undefined}><legend>Roller *</legend>
      <p className="contact-form-hint">Birden fazla rol seçebilirsiniz.</p>
      <div className="contact-choice-grid">{contactRoles.map((role) => <label className="contact-choice" key={role}><input type="checkbox" name="roles" value={role} checked={value.roles.includes(role)} aria-invalid={!!errors.roles} aria-describedby={errors.roles ? 'error-roles' : undefined} onChange={(event) => {
        const roles = event.target.checked ? [...value.roles, role] : value.roles.filter((item) => item !== role);
        setValue((previous) => ({ ...previous, roles, services: roles.includes('Fasoncu') ? previous.services : [] }));
        setErrors((previous) => ({ ...previous, roles: undefined }));
      }} />{role}</label>)}</div>{errorFor('roles')}
      {value.roles.includes('Fasoncu') && <fieldset className="contact-services"><legend>Fason Hizmetleri</legend><p className="contact-form-hint">İsteğe bağlı, birden fazla hizmet seçebilirsiniz.</p><div className="contact-choice-grid">{subcontractServices.map((service) => <label key={service} className="contact-choice"><input type="checkbox" name="services" checked={value.services.includes(service)} onChange={(event) => set('services', event.target.checked ? [...value.services, service] : value.services.filter((item) => item !== service))} />{service}</label>)}</div></fieldset>}
    </fieldset>
    <div className="contact-actions"><button type="button" className="button contact-secondary" disabled={saving} onClick={onCancel}>Vazgeç</button><button type="submit" className="button" disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
  </form>;
}
