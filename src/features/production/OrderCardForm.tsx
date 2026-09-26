import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { contactRepository } from '../../data/contacts';
import { productDefinitionRepository } from '../../data/productDefinitions';
import type { ProductDefinition } from '../../data/productDefinitions/repository';
import { workflowRepository } from '../../data/production';
import type { OrderItemInput } from '../../data/production/workflowRepository';
import type { ProductionOrderCard } from '../../domain/productionWorkflow';
import { normalizedContactName, selectableContacts } from '../../domain/contactSelection';
import { emptyContact } from '../contacts/model';
import type { Contact } from '../contacts/model';
import { Field, Form, Input, Section, text } from '../shared/WorkshopUI';
import { today } from '../products/model';
import { itemInstructions } from '../../domain/cuttingWorkflow';
import { validateOrderForm } from './orderValidation';

type DraftItem = OrderItemInput & { draftKey: string };
const emptyItem = (): DraftItem => ({ draftKey: crypto.randomUUID(), productDefinitionId: '', modelName: '', colorQuantities: [{ color: '', quantity: 0 }], fabricName: '', gsm: '', fabricProperties: '', productDetails: '', instructions: [''] });

function QuickCustomer({ done }: { done: (id: string) => void }) {
  const [existing, setExisting] = useState<Contact>();
  return <Section title="Yeni Müşteri Ekle"><Form onDone={() => {}} onSubmit={async (form) => {
    const name = text(form, 'name'); setExisting(undefined);
    try { const saved = await contactRepository.create({ ...emptyContact, name, roles: ['Hazır Giyim Müşterisi'] }); done(saved.id); }
    catch (e) { setExisting((await contactRepository.list()).find((c) => c.roles.includes('Hazır Giyim Müşterisi') && normalizedContactName(c.name) === normalizedContactName(name))); throw e; }
  }}><Input label="Müşteri / Firma Adı *" name="name" required />{existing && (existing.status === 'Aktif' ? <button type="button" className="button ws-secondary" onClick={() => done(existing.id)}>Mevcut müşteriyi seç: {existing.name}</button> : <p>Mevcut müşteri pasif. Firma / Kişiler ekranından aktif hale getirin.</p>)}</Form></Section>;
}

function QuickProduct({ done }: { done: (id: string) => void }) {
  const [name, setName] = useState(''); const [note, setNote] = useState(''); const [status, setStatus] = useState<'Aktif' | 'Pasif'>('Aktif');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const running = useRef(false);
  async function save() {
    if (running.current) return; running.current = true; setBusy(true); setError('');
    try { const record = await productDefinitionRepository.save({ name, note, status }); done(record.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ürün kaydedilemedi.'); }
    finally { running.current = false; setBusy(false); }
  }
  return <div className="ws-card" role="group" aria-label="Yeni Ürün Ekle"><Field label="Ürün Adı *"><input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} /></Field><Field label="Ürün Notu"><textarea value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></Field><Field label="Ürün Durumu"><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option>Aktif</option><option>Pasif</option></select></Field>{error && <p className="ws-error" role="alert">{error}</p>}<button type="button" disabled={busy} className="button" onClick={() => void save()}>Ürünü Kaydet</button></div>;
}

function ItemEditor({ item, index, definitions, update, remove, reload, selectProduct }: { index: number; item: OrderItemInput; definitions: ProductDefinition[]; update: (item: OrderItemInput) => void; remove: () => void; reload: () => void; selectProduct: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  return <section className="order-item-card" aria-label={`Sipariş Kalemi ${index + 1}`}><h3>Sipariş Kalemi {index + 1}</h3><div className="order-item-section"><h4>Ürün bilgileri</h4><div className="ws-grid">
    <Field label="Ürün Tanımı *"><select value={item.productDefinitionId} onChange={(e) => update({ ...item, productDefinitionId: e.target.value })} required><option value="">Ürün seçin</option>{definitions.filter((d) => d.status === 'Aktif' || d.id === item.productDefinitionId).map((d) => <option key={d.id} value={d.id}>{d.name}{d.status !== 'Aktif' && ' (Pasif)'}</option>)}</select></Field>
    <button type="button" className="button ws-secondary order-quick-add" onClick={() => setAdding(!adding)}>+ Yeni Ürün Ekle</button>
    {adding && <QuickProduct done={(id) => { selectProduct(id); reload(); setAdding(false); }} />}
    <Field label="Ürün Adı / Model Adı *"><input value={item.modelName ?? ''} required maxLength={200} onChange={(e) => update({ ...item, modelName: e.target.value })} /></Field>
    </div></div><div className="order-item-section"><h4>Renk Dağılımı</h4>
    {item.colorQuantities.map((row, i) => <div className="order-color-editor" key={i}><Field label="Renk *"><input value={row.color} required onChange={(e) => update({ ...item, colorQuantities: item.colorQuantities.map((r, j) => i === j ? { ...r, color: e.target.value } : r) })} /></Field><Field label="Adet *"><input type="number" min={1} step={1} required value={row.quantity || ''} onChange={(e) => update({ ...item, colorQuantities: item.colorQuantities.map((r, j) => i === j ? { ...r, quantity: Number(e.target.value) } : r) })} /></Field>{item.colorQuantities.length > 1 && <button type="button" className="button ws-secondary" onClick={() => update({ ...item, colorQuantities: item.colorQuantities.filter((_, j) => i !== j) })}>Satırı Sil</button>}</div>)}
    <button type="button" className="button ws-secondary" onClick={() => update({ ...item, colorQuantities: [...item.colorQuantities, { color: '', quantity: 0 }] })}>+ Renk Ekle</button>
    <p className="ws-hint">Toplam Sipariş Adedi: {item.colorQuantities.reduce((sum, row) => sum + (row.quantity || 0), 0)}</p>
    </div><div className="order-item-section"><h4>Kumaş bilgileri</h4><div className="ws-grid">{(['fabricName', 'gsm', 'fabricProperties'] as const).map((key) => <Field key={key} label={{ fabricName: 'Kumaş Adı *', gsm: 'Gramaj', fabricProperties: 'Kumaş Özellikleri', productDetails: 'Ürüne Ait Özellikler / Talimatlar' }[key]}>{key === 'fabricName' || key === 'gsm' ? <input value={item[key]} required={key === 'fabricName'} maxLength={2000} onChange={(e) => update({ ...item, [key]: e.target.value })} /> : <textarea value={item[key]} maxLength={2000} rows={2} onChange={(e) => update({ ...item, [key]: e.target.value })} />}</Field>)}</div>
    </div><div className="order-item-section"><h4>Ürün talimatları</h4><p className="ws-hint">Ürüne Ait Özellikler / Talimatlar</p>{(item.instructions ?? (item.productDetails ? [item.productDetails] : [])).map((line, i, lines) => <div className="order-color-editor" key={i}><Field label={`Madde ${i + 1}`}><input value={line} maxLength={2000} onChange={(e) => update({ ...item, instructions: lines.map((v, j) => i === j ? e.target.value : v) })} /></Field><button type="button" className="button ws-secondary" onClick={() => update({ ...item, instructions: lines.filter((_, j) => i !== j) })}>Maddeyi Kaldır</button></div>)}<button type="button" className="button ws-secondary" onClick={() => update({ ...item, instructions: [...(item.instructions ?? (item.productDetails ? [item.productDetails] : [])), ''] })}>+ Madde Ekle</button></div><div className="order-item-actions"><button type="button" className="button ws-secondary" onClick={remove}>Sipariş Kalemini Kaldır</button></div>
  </section>;
}

export function OrderCardForm({ initial: initialOrder, definitions, contacts, reloadDefinitions, reloadContacts, done, cancel }: { initial?: ProductionOrderCard; definitions: ProductDefinition[]; contacts: Contact[]; reloadDefinitions: () => void; reloadContacts: () => void; done: () => void; cancel: () => void }) {
  const [initial] = useState(initialOrder);
  const [orderType, setOrderType] = useState<ProductionOrderCard['orderType']>(initial?.orderType ?? 'Ön Sipariş');
  const [customerId, setCustomerId] = useState(initial?.customerId ?? ''); const [quick, setQuick] = useState(false);
  const [items, setItems] = useState<DraftItem[]>(() => initial ? structuredClone(initial.items).map((i) => ({ ...i, draftKey: i.id, modelName: i.modelName ?? i.productName, instructions: itemInstructions(i) })) : [emptyItem()]);
  const customers = selectableContacts(contacts, 'Hazır Giyim Müşterisi');
  const historicalCustomer = initial?.customerId === customerId && customerId && !customers.some((c) => c.id === customerId);
  return <Section title={initial ? 'Sipariş Kartını Güncelle' : 'Yeni Sipariş Kartı'}>
    {!definitions.some((d) => d.status === 'Aktif') && <div role="status"><p>Henüz aktif ürün tanımı bulunmuyor. Sipariş oluşturabilmek için önce Ürün Tanımları bölümünden ürün ekleyin.</p><Link className="button ws-secondary" to="/stok/urun-tanimlari">Ürün Tanımlarına Git</Link></div>}
    {quick && orderType === 'Ön Sipariş' && <QuickCustomer done={(id) => { setCustomerId(id); setQuick(false); reloadContacts(); }} />}
    <Form cancel={cancel} label={initial ? 'Güncelle' : 'Sipariş Kartını Oluştur'} leadingAction={<button type="button" className="button ws-secondary order-add-item" onClick={() => setItems((prev) => [...prev, emptyItem()])}>+ Ürün Ekle</button>} validate={(form) => { form.set('customerId', customerId); return validateOrderForm(form, items); }} onDone={done} onSubmit={async (form) => {
      const input = { orderName: text(form, 'orderName'), orderType, customerId: orderType === 'Ön Sipariş' ? customerId || undefined : undefined, date: text(form, 'date'), dueDate: text(form, 'dueDate'), note: text(form, 'note'), items: items.map(({ draftKey: _key, ...item }) => ({ ...item, instructions: item.instructions?.map((s) => s.trim()).filter(Boolean) })) };
      if (initial) await workflowRepository.updateOrder(initial.id, initial.revision ?? 0, input); else await workflowRepository.createOrder(input);
    }}>
      <div className="ws-grid"><Field label="Sipariş No"><input readOnly value={initial?.orderNo ?? "Otomatik oluşturulur"} /></Field><Input label="Sipariş Adı *" name="orderName" value={initial?.orderName ?? ''} required /><Field label="Sipariş Türü"><select name="orderType" value={orderType} disabled={!!initial} onChange={(e) => setOrderType(e.target.value as typeof orderType)}><option>Ön Sipariş</option><option>Stok İçin Üretim</option></select>{initial && <input type="hidden" name="orderType" value={orderType} />}</Field>
        {orderType === 'Ön Sipariş' && <div className="order-customer-field"><Field label={orderType === 'Ön Sipariş' ? 'Müşteri *' : 'Müşteri'}><select name="customerId" required={orderType === 'Ön Sipariş'} value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Müşteri seçin</option>{historicalCustomer && <option value={customerId} disabled>{contacts.find((c) => c.id === customerId)?.name ?? 'Eski müşteri'} (mevcut kayıt)</option>}{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <button type="button" className="button ws-secondary order-quick-add" onClick={() => setQuick(!quick)}>+ Yeni Müşteri Ekle</button></div>}<Input label="Sipariş Tarihi *" name="date" type="date" value={initial?.date ?? today()} required /><Input label="Termin Tarihi" name="dueDate" type="date" value={initial?.dueDate ?? ''} /><Field label="Genel Not"><textarea name="note" defaultValue={initial?.note ?? ''} maxLength={2000} rows={2} /></Field></div>
      <Section title="Sipariş Kalemleri">{items.map((item, index) => <ItemEditor index={index} key={item.draftKey} item={item} definitions={definitions} reload={reloadDefinitions} selectProduct={(id) => setItems((prev) => prev.map((current) => current.draftKey === item.draftKey ? { ...current, productDefinitionId: id } : current))} update={(next) => setItems((prev) => prev.map((current) => current.draftKey === item.draftKey ? { ...current, ...next } : current))} remove={() => setItems((prev) => prev.filter((current) => current.draftKey !== item.draftKey))} />)}</Section>
    </Form>
  </Section>;
}
