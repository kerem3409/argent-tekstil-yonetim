import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createNetworkRepository, networkCategories, networkContactInput, networkStatuses } from '../../data/contacts/networkRepository';
import type { NetworkInput, NetworkRecord } from '../../data/contacts/networkRepository';
import { contactRepository } from '../../data/contacts';
import { browserLock } from '../../data/shared/store';
import { Field, Form, Input, Page, Table, text, useResource } from '../shared/WorkshopUI';
import { today } from '../products/model';
import { ContactForm } from './ContactForm';
import './contacts.css';

export const networkRepository = createNetworkRepository(() => window.localStorage, contactRepository, browserLock);
export function NetworkPage() {
  const resource = useResource(networkRepository.list);
  const [editing, setEditing] = useState<NetworkRecord | 'new'>(), [transfer, setTransfer] = useState<NetworkRecord>(), [search, setSearch] = useState('');
  const done = () => { setEditing(undefined); setTransfer(undefined); resource.reload(); };
  const initial = editing && editing !== 'new' ? editing : undefined;
  return <Page title="İş Ağı" loading={!resource.data} error={resource.error} reload={resource.reload}><p>İleride birlikte çalışabileceğiniz kişi ve firmalar. Bu kayıtlar kendiliğinden cari hesap oluşturmaz.</p>
    {transfer ? <><h2>Firma / Kişi Listesine Aktar</h2><p>Bilgileri ve rolleri kontrol edin. Aynı adla mevcut firma varsa yeni kayıt oluşturulmadan bağlanır.</p><ContactForm initial={networkContactInput(transfer)} onCancel={done} onSave={async (input) => { await networkRepository.transfer(transfer.id, transfer.revision, input); done(); }} /></> : editing ? <Form key={initial?.id ?? 'new'} label="İş Ağı Kaydet" cancel={done} onDone={done} onSubmit={(f) => {
      const input = Object.fromEntries(['name', 'company', 'category', 'phone', 'city', 'note', 'metDate', 'status'].map((key) => [key, text(f, key)])) as unknown as NetworkInput;
      return networkRepository.save(input, initial?.id, initial?.revision);
    }}><div className="ws-grid"><Input label="Ad Soyad *" name="name" required value={initial?.name} /><Input label="Firma Adı" name="company" value={initial?.company} /><Field label="Kategori / Alan *"><input name="category" list="network-categories" required defaultValue={initial?.category ?? 'Diğer'} /><datalist id="network-categories">{networkCategories.map((v) => <option key={v}>{v}</option>)}</datalist></Field><Input label="Telefon" name="phone" value={initial?.phone} /><Input label="Şehir" name="city" value={initial?.city} /><Input label="Tanışma Tarihi *" name="metDate" type="date" required value={initial?.metDate ?? today()} /><Field label="Durum"><select name="status" defaultValue={initial?.status ?? 'Bağlantı'}>{networkStatuses.map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Not"><textarea name="note" maxLength={2000} defaultValue={initial?.note} /></Field></div></Form> : <><button className="button" onClick={() => setEditing('new')}>Yeni Bağlantı</button><Field label="İş Ağında Ara"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></Field><Table headers={['Ad Soyad', 'Firma', 'Kategori', 'Telefon', 'Şehir', 'Tanışma Tarihi', 'Durum', 'Not', 'İşlemler']} rows={(resource.data ?? []).filter((r) => [r.name, r.company, r.category, r.city].join(' ').toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))).map((r) => [r.name, r.company, r.category, r.phone, r.city, r.metDate, r.status, r.note, <div className="ws-tabs"><button className="button ws-secondary" onClick={() => setEditing(r)}>Düzenle</button>{r.contactId ? <Link to={`/firma-kisiler?islem=detay&id=${r.contactId}`}>Firma / Kişi Kaydı</Link> : <button className="button ws-secondary" onClick={() => setTransfer(r)}>Firma / Kişi Listesine Aktar</button>}</div>])} /></>}
  </Page>;
}
