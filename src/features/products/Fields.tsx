import type { ReactNode } from 'react';
import type { Contact } from '../contacts/model';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="product-field"><span>{label}</span>{children}</label>;
}
export function SupplierSelect({ contacts, value, onChange, required = false }: { contacts: Contact[]; value: string; onChange: (value: string) => void; required?: boolean }) {
  const active = contacts.filter((item) => item.status === 'Aktif');
  const preferred = active.filter((item) => item.roles.includes('Hazır Giyim Tedarikçisi'));
  const others = active.filter((item) => !item.roles.includes('Hazır Giyim Tedarikçisi'));
  return <Field label={`Firma / Tedarikçi${required ? ' *' : ''}`}><select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
    <option value="">Seçiniz</option>
    <optgroup label="Hazır Giyim Tedarikçileri">{preferred.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
    <optgroup label="Diğer aktif firma / kişiler">{others.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
  </select></Field>;
}
