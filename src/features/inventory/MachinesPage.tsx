import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { inventory } from '../../data/inventory';
import { machineStatuses } from '../../domain/inventory';
import type { Machine } from '../../domain/inventory';
import type { AccountChoice } from '../../domain/common';
import { displayDate, money, today } from '../products/model';
import { AccountChoiceField, Action, CompanySelect, Form, Input, Page, Section, Select, Table, companyName, numeric, text, useCompanies, useResource } from '../shared/WorkshopUI';

export function MachinesPage() {
  const [params] = useSearchParams();
  const resource = useResource(inventory.machines.load); const companies = useCompanies(); const [create, setCreate] = useState(false); const [id, setId] = useState(params.get('kayit') ?? '');
  const item = resource.data?.records.find((r) => r.id === id); const done = () => { setCreate(false); resource.reload(); };
  return <Page title="Makine & Teçhizat" error={resource.error || companies.error} loading={!resource.data && !resource.error} reload={resource.reload}>
    <div className="ws-tabs"><button className="button ws-secondary" onClick={() => { setCreate(false); setId(''); }}>Liste</button><button className="button" disabled={!companies.data || !!resource.error} onClick={() => { setCreate(true); setId(''); }}>Yeni Makine / Teçhizat</button></div>
    {create ? <Form onDone={done} onSubmit={(f) => inventory.machines.create({ name: text(f, 'name'), type: text(f, 'type'), model: text(f, 'model'), quantity: numeric(f, 'quantity'), price: numeric(f, 'price'), date: text(f, 'date'), companyId: text(f, 'companyId'), account: text(f, 'account') as AccountChoice, status: text(f, 'status') as Machine['status'], note: text(f, 'note') })}><Section title="Makine Bilgileri"><div className="ws-grid"><Input label="Makine / Teçhizat Adı *" name="name" required /><Input label="Tür *" name="type" required /><Input label="Marka / Model" name="model" /><Input label="Adet *" name="quantity" type="number" min="1" step="1" value={1} required /><Input label="Alış Tarihi *" name="date" type="date" value={today()} required /><Input label="Alış Bedeli (toplam TL) *" name="price" type="number" min="0" step="0.01" required /><Select label="Durum" name="status" values={machineStatuses} /><CompanySelect contacts={companies.data ?? []} /><AccountChoiceField debtOnly /><Input label="Not" name="note" /></div></Section></Form>
    : item ? <Section title={item.name}><p className="ws-hint">{item.type} · {item.model} · {item.quantity} adet · {displayDate(item.date)} · {money(item.purchaseMinor)} · {companyName(companies.data, item.companyId)}<br />{item.note}</p><Form onDone={done} onSubmit={(f) => inventory.machines.updateStatus(item.id, text(f, 'status') as Machine['status'])}><Select label="Durum" name="status" value={item.status} values={machineStatuses} /></Form><Action run={() => inventory.machines.toggle(item.id)} done={done}>{item.active ? 'Arşivle' : 'Arşivden Çıkar'}</Action></Section>
    : <Table headers={['Makine', 'Tür', 'Marka / Model', 'Adet', 'Alış Tarihi', 'Alış Bedeli', 'Durum', 'Kayıt', 'İşlemler']} rows={(resource.data?.records ?? []).map((r) => [r.name, r.type, r.model, r.quantity, displayDate(r.date), money(r.purchaseMinor), r.status, r.active ? 'Aktif' : 'Arşiv', <button className="button ws-secondary" onClick={() => setId(r.id)}>Detay / Düzenle</button>])} />}
  </Page>;
}
