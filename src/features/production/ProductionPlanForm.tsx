import { useState } from 'react';
import { Link } from 'react-router-dom';
import { planRepository } from '../../data/production';
import type { ProductDefinition } from '../../data/productDefinitions/repository';
import { INTERNAL_CUSTOMER, INTERNAL_CUSTOMER_ID } from '../../domain/productionPlan';
import type { PlanInput, PlanItemInput, ProductionPlan } from '../../domain/productionPlan';
import { defaultSizeDistribution } from '../../domain/productionWorkflow';
import type { Contact } from '../contacts/model';
import { today } from '../products/model';
import { Field, Form, Input, Section, text } from '../shared/WorkshopUI';
import { PlannedSizes } from './ProductionCardEditor';

export function NoteList({ value, onChange, title = 'Madde' }: { value: string[]; onChange: (v: string[]) => void; title?: string }) {
  return <div className="plan-note-list">{value.map((s, index) => <div className="plan-note-row" key={index}><Field label={`${title} ${index + 1}`}><input value={s} maxLength={2000} onChange={(e) => onChange(value.map((v, i) => i === index ? e.target.value : v))} /></Field><button type="button" className="button ws-secondary" onClick={() => onChange(value.filter((_, i) => i !== index))}>Maddeyi Sil</button></div>)}<button type="button" className="button ws-secondary" disabled={value.length >= 50} onClick={() => onChange([...value, ''])}>+ Madde Ekle</button></div>;
}
const freshItem = (): PlanItemInput & { key: string } => ({ key: crypto.randomUUID(), productDefinitionId: '', modelName: '', brand: '', fabricName: '', gsm: '', fabricProperties: '', sizeSeries: 'Yetişkin', sizeDistribution: defaultSizeDistribution('Yetişkin'), colors: [{ color: '', quantity: 0 }], instructions: [''], materials: [], enabledStages: ['Kesim', 'Dikim', 'Ütü & Paket'] });

export function ProductionPlanForm({ initial, contacts, definitions, done, cancel }: { initial?: ProductionPlan; contacts: Contact[]; definitions: ProductDefinition[]; done: (id: string) => void; cancel: () => void }) {
  const [items, setItems] = useState(() => initial ? initial.items.map((i) => ({ ...i, key: i.id })) : [freshItem()]);
  let savedId = initial?.id ?? '';
  const update = (index: number, item: Partial<PlanItemInput>) => setItems((values) => values.map((v, i) => i === index ? { ...v, ...item } : v));
  const customers = contacts.filter((c) => c.status === 'Aktif' && c.roles.includes('Hazır Giyim Müşterisi'));
  return <Section title={initial ? 'Üretim Planını Düzenle' : 'Yeni Üretim Planı'}><Form label={initial ? 'Planı Güncelle' : 'Üretim Planını Oluştur'} cancel={cancel} onDone={() => done(savedId)} onSubmit={async (f) => {
    const input: PlanInput = { name: text(f, 'name'), customerId: text(f, 'customerId'), date: text(f, 'date'), dueDate: text(f, 'dueDate'), customerReference: text(f, 'customerReference'), note: text(f, 'note'), items: items.map(({ key: _key, ...i }) => ({ ...i, instructions: i.instructions.map((s) => s.trim()).filter(Boolean) })) };
    const saved = initial ? await planRepository.update(initial.id, initial.revision, input) : await planRepository.create(input); savedId = saved.id;
  }}>
    <div className="ws-grid"><Field label="Plan No"><input readOnly value={initial?.planNo ?? 'Otomatik'} /></Field><Input name="name" label="Üretim Planı Adı *" value={initial?.name} required />
      <Field label="Müşteri *"><select name="customerId" defaultValue={initial?.customerId ?? ''} required><option value="">Müşteri seçin</option><option value={INTERNAL_CUSTOMER_ID}>{INTERNAL_CUSTOMER.name} · Kendi stokumuz</option>{initial?.customerId && initial.customerId !== INTERNAL_CUSTOMER_ID && !customers.some((c) => c.id === initial.customerId) && <option value={initial.customerId}>{contacts.find((c) => c.id === initial.customerId)?.name ?? 'Eski müşteri'}</option>}{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Input name="date" label="Plan / Sipariş Tarihi *" type="date" value={initial?.date ?? today()} required /><Input name="dueDate" label="Termin Tarihi *" type="date" value={initial?.dueDate} required /><Input name="customerReference" label="Müşteri Referans No" value={initial?.customerReference} /><Field label="Genel Not"><textarea name="note" maxLength={2000} defaultValue={initial?.note} /></Field></div>
    {!definitions.some((d) => d.status === 'Aktif') && <p>Önce <Link to="/stok/urun-tanimlari">Ürün Tanımları</Link> bölümünden ürün ekleyin.</p>}
    {items.map((item, index) => <section className="order-item-card" key={item.key} aria-label={`Ürün Kalemi ${index + 1}`}><h3>Ürün Kalemi {index + 1}</h3><div className="order-item-section"><div className="ws-grid">
      <Field label="Ürün Tanımı / Türü *"><select required value={item.productDefinitionId} onChange={(e) => update(index, { productDefinitionId: e.target.value })}><option value="">Ürün seçin</option>{definitions.filter((d) => d.status === 'Aktif' || d.id === item.productDefinitionId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Ürün / Model Adı *"><input required value={item.modelName} maxLength={200} onChange={(e) => update(index, { modelName: e.target.value })} /></Field>
      <Field label="Marka *"><input required list="plan-brands" value={item.brand} maxLength={200} onChange={(e) => update(index, { brand: e.target.value })} /></Field><button type="button" className="button ws-secondary" onClick={() => update(index, { brand: 'Markasız' })}>Markasız</button>
      <Field label="Kumaş Türü / Adı *"><input required value={item.fabricName} onChange={(e) => update(index, { fabricName: e.target.value })} /></Field><Field label="Gramaj"><input value={item.gsm} onChange={(e) => update(index, { gsm: e.target.value })} /></Field><Field label="Kumaş Özellikleri"><textarea value={item.fabricProperties} maxLength={2000} onChange={(e) => update(index, { fabricProperties: e.target.value })} /></Field></div>
      <PlannedSizes series={item.sizeSeries} value={item.sizeDistribution} onSeriesChange={(s) => update(index, { sizeSeries: s })} onChange={(s) => update(index, { sizeDistribution: s })} />
      <h4>Renk / İstenen Adet</h4>{item.colors.map((r, row) => <div className="order-color-editor" key={row}><Field label="Renk *"><input required value={r.color} onChange={(e) => update(index, { colors: item.colors.map((v, i) => i === row ? { ...v, color: e.target.value } : v) })} /></Field><Field label="İstenen Adet *"><input required type="number" min={1} step={1} value={r.quantity || ''} onChange={(e) => update(index, { colors: item.colors.map((v, i) => i === row ? { ...v, quantity: Number(e.target.value) } : v) })} /></Field><button type="button" className="button ws-secondary" onClick={() => update(index, { colors: item.colors.filter((_, i) => i !== row) })}>Rengi Sil</button></div>)}<button type="button" className="button ws-secondary" onClick={() => update(index, { colors: [...item.colors, { color: '', quantity: 0 }] })}>+ Renk Ekle</button>
      <h4>Ürün Özellikleri / Talimatları</h4><NoteList value={item.instructions} onChange={(instructions) => update(index, { instructions })} />
      <h4>Gerekli Malzemeler / Aksesuarlar</h4>{item.materials.map((m, row) => <div className="ws-grid plan-material" key={row}>{(['name', 'description', 'quantity'] as const).map((key) => <Field key={key} label={{ name: 'Malzeme Adı *', description: 'Açıklama', quantity: 'Miktar' }[key]}><input list={key === 'name' ? 'plan-materials' : undefined} required={key === 'name'} value={m[key]} onChange={(e) => update(index, { materials: item.materials.map((v, i) => i === row ? { ...v, [key]: e.target.value } : v) })} /></Field>)}<button type="button" className="button ws-secondary" onClick={() => update(index, { materials: item.materials.filter((_, i) => i !== row) })}>Malzemeyi Sil</button></div>)}<button type="button" className="button ws-secondary" onClick={() => update(index, { materials: [...item.materials, { name: '', description: '', quantity: '' }] })}>+ Malzeme Ekle</button>
      <h4>Kullanılacak Aşamalar</h4><p>Kesim → Dikim → Ütü / Paket</p><div className="ws-tabs">{(['Nakış', 'Baskı'] as const).map((s) => <label key={s}><input type="checkbox" checked={item.enabledStages.includes(s)} onChange={(e) => update(index, { enabledStages: e.target.checked ? [...item.enabledStages, s] : item.enabledStages.filter((v) => v !== s) })} /> {s}</label>)}</div>
      <button type="button" className="button ws-secondary" onClick={() => setItems((values) => values.filter((_, i) => i !== index))}>Ürün Kalemini Sil</button>
    </div></section>)}
    <datalist id="plan-brands"><option value="Markasız" /></datalist><datalist id="plan-materials">{['Fermuar', 'Dokuma Etiket', 'Yıkama Talimatı', 'İplik', 'Kordon', 'Metal Uç', 'Diğer'].map((s) => <option key={s} value={s} />)}</datalist>
    <button type="button" className="button ws-secondary" onClick={() => setItems((values) => [...values, freshItem()])}>+ Ürün Kalemi Ekle</button>
  </Form></Section>;
}
