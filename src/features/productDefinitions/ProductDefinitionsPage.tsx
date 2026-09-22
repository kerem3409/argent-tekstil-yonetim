import { useState } from 'react';
import { productDefinitionRepository } from '../../data/productDefinitions';
import type { ProductDefinition } from '../../data/productDefinitions/repository';
import { Action, Field, Form, Page, Section, Table, text, useResource } from '../shared/WorkshopUI';

export function ProductDefinitionsPage() {
  const resource = useResource(productDefinitionRepository.list);
  const [editing, setEditing] = useState<ProductDefinition | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const current = editing && editing !== 'new' ? editing : undefined;
  const done = () => { setEditing(null); resource.reload(); };
  return <Page title="Ürün Tanımları" error={resource.error} loading={!resource.data && !resource.error} reload={resource.reload}>
    <div className="ws-tabs"><button className="button" onClick={() => setEditing('new')}>Yeni Ürün Tanımla</button></div>
    {editing && <Section title={current ? 'Ürün Tanımını Düzenle' : 'Yeni Ürün Tanımla'}><Form key={current?.id ?? 'new'} onDone={done} onSubmit={(f) => productDefinitionRepository.save({ name: text(f, 'name'), note: text(f, 'note'), status: text(f, 'status') as ProductDefinition['status'] }, current?.id)}>
      <div className="ws-grid"><Field label="Ürün Adı *"><input name="name" required minLength={2} maxLength={200} defaultValue={current?.name ?? ''} /></Field><Field label="Açıklama / Not"><textarea name="note" maxLength={2000} defaultValue={current?.note ?? ''} /></Field><Field label="Durum"><select name="status" defaultValue={current?.status ?? 'Aktif'}><option>Aktif</option><option>Pasif</option></select></Field></div>
      <button type="button" className="button ws-secondary" onClick={() => setEditing(null)}>Vazgeç</button>
    </Form></Section>}
    <Field label="Ürün ara"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ürün adı" /></Field>
    <Table headers={['Ürün Adı', 'Durum', 'İşlemler']} rows={(resource.data ?? []).filter((d) => d.name.toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR'))).map((d) => [d.name, d.status, <><button className="button ws-secondary" onClick={() => setEditing(d)}>Düzenle</button><Action run={() => productDefinitionRepository.setStatus(d.id, d.status === 'Aktif' ? 'Pasif' : 'Aktif')} done={resource.reload}>{d.status === 'Aktif' ? 'Pasif Yap' : 'Aktif Yap'}</Action></>])} />
  </Page>;
}
