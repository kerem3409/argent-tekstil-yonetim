import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { contactRepository } from '../../data/contacts';
import { Icon } from '../../components/Icon';
import { ContactForm } from './ContactForm';
import { ContactDetails } from './ContactDetails';
import { contactRoles, emptyContact, filterContacts } from './model';
import type { Contact, ContactInput } from './model';
import './contacts.css';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; records: Contact[] };

export function ContactsPage() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('islem');
  const id = params.get('id');
  const query = params.get('ara') ?? '';
  const role = params.get('rol') ?? '';
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const records = await contactRepository.list();
        if (active) setState({ status: 'ready', records });
      } catch (error) {
        if (active) setState({ status: 'error', message: error instanceof Error ? error.message : 'Kayıtlar yüklenemedi.' });
      }
    }
    setState({ status: 'loading' });
    void load();
    const refresh = () => { void load(); };
    window.addEventListener('storage', refresh);
    return () => { active = false; window.removeEventListener('storage', refresh); };
  }, [attempt]);

  useEffect(() => {
    document.getElementById('contacts-heading')?.focus();
  }, [mode, id]);

  function navigate(nextMode?: string, contactId?: string) {
    const next = new URLSearchParams(params);
    next.delete('islem'); next.delete('id');
    if (nextMode) next.set('islem', nextMode);
    if (contactId) next.set('id', contactId);
    setNotice('');
    setParams(next);
  }

  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  async function save(input: ContactInput) {
    const contact = mode === 'duzenle' && id
      ? await contactRepository.update(id, input)
      : await contactRepository.create(input);
    setState((previous) => previous.status === 'ready' ? {
      status: 'ready', records: mode === 'duzenle' ? previous.records.map((item) => item.id === contact.id ? contact : item) : [...previous.records, contact],
    } : previous);
    navigate('detay', contact.id);
    setNotice(mode === 'duzenle' ? 'Kayıt güncellendi.' : 'Firma / kişi kaydedildi.');
  }

  const selected = state.status === 'ready' ? state.records.find((contact) => contact.id === id) : undefined;
  const isForm = mode === 'yeni' || mode === 'duzenle';
  const title = mode === 'yeni' ? 'Yeni Firma / Kişi' : mode === 'duzenle' ? 'Firma / Kişi Düzenle' : mode === 'detay' ? 'Firma / Kişi Detayı' : 'Firma / Kişi Listesi';
  const filtered = state.status === 'ready' ? filterContacts(state.records, query, role) : [];

  return <div className="contacts-module">
    <div className="page-heading"><div><h1 id="contacts-heading" tabIndex={-1}>{title}</h1><p>{mode ? 'Firma / kişi bilgileri, roller ve fatura bilgileri.' : 'Firma ve kişilerinizi, iletişim bilgilerini ve rollerini yönetin.'}</p></div>
      <div className="contact-actions">{mode ? <><button className="button contact-secondary" onClick={() => navigate()}>Listeye dön</button>{mode === 'detay' && selected && <button className="button" onClick={() => navigate('duzenle', selected.id)}>Düzenle</button>}</> : <button className="button" onClick={() => navigate('yeni')} disabled={state.status !== 'ready'}>Yeni Firma / Kişi</button>}</div>
    </div>
    {notice && <p className="contact-notice" role="status">{notice}</p>}
    {state.status === 'loading' && <div className="table-panel feedback" role="status">Kayıtlar yükleniyor…</div>}
    {state.status === 'error' && <div className="table-panel feedback" role="alert"><p>{state.message}</p><button className="button" onClick={() => setAttempt((previous) => previous + 1)}>Tekrar dene</button></div>}
    {state.status === 'ready' && <>
      {mode && mode !== 'yeni' && (!selected || !['duzenle', 'detay'].includes(mode)) ? <div className="table-panel feedback"><p>Kayıt veya ekran bulunamadı. Listeden bir kayıt seçin.</p><button className="button" onClick={() => navigate()}>Listeye dön</button></div>
        : isForm ? <ContactForm key={`${mode}-${id ?? ''}`} initial={selected ?? emptyContact} onSave={save} onCancel={() => navigate()} />
        : mode === 'detay' && selected ? <ContactDetails contact={selected} />
        : <section className="table-panel" aria-label="Firma / kişi kayıtları">
          <div className="contact-toolbar"><div className="contact-field"><label htmlFor="contact-search">Ara</label><input id="contact-search" type="search" placeholder="Ad, yetkili, telefon veya e-posta" value={query} onChange={(event) => filter('ara', event.target.value)} /></div>
            <div className="contact-field"><label htmlFor="contact-role-filter">Rol</label><select id="contact-role-filter" value={role} onChange={(event) => filter('rol', event.target.value)}><option value="">Tüm roller</option>{contactRoles.map((item) => <option key={item}>{item}</option>)}</select></div>
            <span className="record-count" role="status">{filtered.length} / {state.records.length} kayıt</span>
          </div>
          <div className="table-scroll"><table className="contact-table"><caption className="sr-only">Firma / Kişi Listesi</caption><thead><tr>{['Firma / Kişi Adı', 'Yetkili', 'Telefon', 'Roller', 'Durum', 'İşlemler'].map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>
            {filtered.map((contact) => <tr key={contact.id}><td><button className="contact-name" onClick={() => navigate('detay', contact.id)}>{contact.name}</button><span className="contact-type">{contact.type}</span></td><td>{contact.authorizedPerson || '—'}</td><td>{contact.phone || '—'}</td><td><div className="contact-tags">{contact.roles.map((item) => <span key={item}>{item}</span>)}</div></td><td><span className={`contact-status ${contact.status === 'Pasif' ? 'is-passive' : ''}`}>{contact.status}</span></td><td><div className="contact-row-actions"><button onClick={() => navigate('detay', contact.id)} aria-label={`${contact.name} detayını aç`}>Detay</button><button onClick={() => navigate('duzenle', contact.id)} aria-label={`${contact.name} kaydını düzenle`}>Düzenle</button></div></td></tr>)}
            {!filtered.length && <tr><td colSpan={6}><div className="empty-state"><span className="empty-icon"><Icon name="people" size={26} /></span><h3>{state.records.length ? 'Aramanıza uygun kayıt bulunamadı' : 'Henüz firma / kişi kaydı yok'}</h3><p>{state.records.length ? 'Arama metnini veya rol filtresini değiştirebilirsiniz.' : 'Yeni Firma / Kişi butonuyla ilk kaydınızı oluşturabilirsiniz.'}</p></div></td></tr>}
          </tbody></table></div>
        </section>}
    </>}
  </div>;
}
