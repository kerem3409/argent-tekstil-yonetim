import { useState } from 'react';
import { workflowRepository } from '../../data/production';
import { inventory } from '../../data/inventory';
import { ProductDefinitionSelect } from '../productDefinitions/ProductDefinitionSelect';
import { CompanySelect, Field, Form, Input, Section, Select, text, useResource } from '../shared/WorkshopUI';
import { today } from '../products/model';
import { cuttingTotal, cutRows, sizeSeries, validateSizes } from '../../domain/productionWorkflow';
import type { BrandSection, NewProductionInput, ProductionOrderItem, ProductionRecord, SizeDistribution } from '../../domain/productionWorkflow';
import type { Contact } from '../contacts/model';

export function NewProductionForm({ contacts, saved, orderCardId, orderItem }: { contacts: Contact[]; saved: (p: ProductionRecord) => void; orderCardId?: string; orderItem?: ProductionOrderItem }) {
  const [product, setProduct] = useState(orderItem?.productDefinitionId ?? ''); const [fabric, setFabric] = useState(''); const [gsm, setGsm] = useState(orderItem?.gsm ?? '');
  const fabrics = useResource(inventory.fabrics.load);
  return <Section title="Yeni Üretim Kaydı"><p className="ws-hint">Üretim numarası kayıtta otomatik oluşturulur. Ürün bilgileri kesim ve takip föylerine taşınır.</p>
    <Form onDone={() => {}} onSubmit={async (f) => { const p = await workflowRepository.create({ productDefinitionId: product, brand: text(f, 'brand'), orderCardId, orderItemId: orderItem?.id, selectedColorQuantities: orderItem?.colorQuantities, sewingCompanyId: text(f, 'sewingCompanyId'), fabricId: fabric, fabricName: orderItem?.fabricName ?? text(f, 'fabricName'), gsm, fabricProperties: orderItem?.fabricProperties ?? text(f, 'fabricProperties'), sizeSeries: text(f, 'sizeSeries') as NewProductionInput['sizeSeries'], cuttingMode: 'Kumaştan Çıktığı Kadar', targetQuantity: null, cutterCompanyId: text(f, 'cutterCompanyId'), date: text(f, 'date'), productInstructions: orderItem?.productDetails ?? text(f, 'instructions'), note: text(f, 'note') }); saved(p); }} label="Üretim Kartını Oluştur">
      <div className="ws-grid"><Field label="Üretim No"><input readOnly value="Otomatik" /></Field><Field label="Marka *"><input name="brand" required maxLength={200} /></Field>{orderItem ? <><Field label="Ürün / Model"><input readOnly value={orderItem.productName} /></Field><Field label="Sipariş Renkleri / Adet"><input readOnly value={orderItem.colorQuantities.map((row) => `${row.color}: ${row.quantity}`).join(' · ')} /></Field></> : <ProductDefinitionSelect value={product} onChange={setProduct} quickAdd />}
        <Field label="Kumaş"><select value={fabric} onChange={(e) => { setFabric(e.target.value); setGsm(fabrics.data?.records.find((r) => r.id === e.target.value)?.grammage ?? ''); }}><option value="">Stok dışı / belirtilmedi</option>{fabrics.data?.records.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.grammage || 'Gramaj yok'} · {r.date}</option>)}</select></Field>
        {!fabric && <Input label="Kumaş Adı *" name="fabricName" value={orderItem?.fabricName} required />}
        <Field label="Gramaj"><input value={gsm} maxLength={200} onChange={(e) => setGsm(e.target.value)} /></Field>
        <Select label="Beden Serisi" name="sizeSeries" values={Object.keys(sizeSeries)} value="Yetişkin" />
        <CompanySelect label="Kesimci / Atölye" contacts={contacts} name="cutterCompanyId" preferredIds={contacts.filter((c) => c.services.includes('Kesim')).map((c) => c.id)} />
        <CompanySelect label="Dikim Firması" contacts={contacts} name="sewingCompanyId" preferredIds={contacts.filter((c) => c.services.includes('Dikim')).map((c) => c.id)} />
        <Input label="Tarih *" name="date" type="date" value={today()} required />
        <Field label="Kumaş Özellikleri"><textarea name="fabricProperties" defaultValue={orderItem?.fabricProperties} rows={2} /></Field><Field label="Ürün Detayı / Talimat"><textarea name="instructions" defaultValue={orderItem?.productDetails} rows={3} maxLength={2000} /></Field><Field label="Not"><textarea name="note" rows={3} maxLength={2000} /></Field>
      </div>{fabrics.error && <p role="alert" className="ws-error">{fabrics.error}</p>}
    </Form>
  </Section>;
}

const newRow = () => ({ id: crypto.randomUUID(), color: '', rollCount: 1, kg: null, quantity: null });
const newBrand = (): BrandSection => ({ id: crypto.randomUUID(), brandName: '', rows: [newRow()] });
export function CuttingEditor({ production: p, done }: { production: ProductionRecord; done: () => void }) {
  const [sections, setSections] = useState<BrandSection[]>(() => structuredClone(p.cuttingSheet.brandSections.length ? p.cuttingSheet.brandSections : [{ ...newBrand(), brandName: p.brand ?? '' }]));
  const [results, setResults] = useState(false);
  const [remove, setRemove] = useState<{ brandId: string; rowId?: string } | null>(null);
  function updateRow(brandId: string, rowId: string, changes: Partial<BrandSection['rows'][number]>) { setSections((prev) => prev.map((b) => b.id === brandId ? { ...b, rows: b.rows.map((r) => r.id === rowId ? { ...r, ...changes } : r) } : b)); }
  return <Section title={p.cuttingSheet.brandSections.length ? 'Kesim Föyü / Kesim Sonucu' : 'Kesim Föyü Oluştur'}>
    <p className="ws-hint">Marka, renk ve top sayısını hazırlayın. Kg ve adet boş kalabilir. Kesimci föyü getirdiğinde aynı satırlara sonuçları girin.</p>
    <Form onDone={done} label={results ? 'Kesim Sonucunu Kaydet' : 'Kesim Föyünü Kaydet'} onSubmit={() => workflowRepository.saveCutting(p.id, p.revision, sections, results)}>
      <Field label="Kayıt Şekli"><select value={results ? 'results' : 'sheet'} onChange={(e) => setResults(e.target.value === 'results')}><option value="sheet">Kesim föyünü hazırla</option><option value="results">Kesim tamamlandı — sonuçları kaydet</option></select></Field>
      {sections.map((b) => <div className="production-brand-editor" key={b.id}><Field label="Marka *"><input required maxLength={200} value={b.brandName} onChange={(e) => setSections((prev) => prev.map((item) => item.id === b.id ? { ...item, brandName: e.target.value } : item))} /></Field>
        {b.rows.map((r) => <div className="production-color-editor" key={r.id}>
          <Field label="Renk *"><input required readOnly={!!p.orderItemId} maxLength={100} value={r.color} onChange={(e) => updateRow(b.id, r.id, { color: e.target.value })} /></Field>
          <Field label="Top Sayısı *"><input type="number" required min={1} max={1e9} step="1" value={r.rollCount ?? ''} onChange={(e) => updateRow(b.id, r.id, { rollCount: e.target.value === '' ? null : e.target.valueAsNumber })} /></Field>
          <Field label={`Kg${results ? ' *' : ''}`}><input type="number" required={results} min={0} max={1e9} step="0.001" value={r.kg ?? ''} onChange={(e) => updateRow(b.id, r.id, { kg: e.target.value === '' ? null : e.target.valueAsNumber })} /></Field>
          <Field label={`Adet${results ? ' *' : ''}`}><input type="number" required={results} min={0} max={1e9} step="1" value={r.quantity ?? ''} onChange={(e) => updateRow(b.id, r.id, { quantity: e.target.value === '' ? null : e.target.valueAsNumber })} /></Field>
          <button type="button" className="button ws-secondary" disabled={!!p.orderItemId || b.rows.length === 1} onClick={() => setRemove({ brandId: b.id, rowId: r.id })}>Satırı Sil</button>
        </div>)}
        <div className="ws-tabs"><button type="button" className="button ws-secondary" disabled={!!p.orderItemId} onClick={() => setSections((prev) => prev.map((item) => item.id === b.id ? { ...item, rows: [...item.rows, newRow()] } : item))}>+ Renk Ekle</button><button type="button" disabled={!!p.orderItemId || sections.length === 1} className="button ws-secondary" onClick={() => setRemove({ brandId: b.id })}>Markayı Kaldır</button></div>
      </div>)}
      {remove && <div className="ws-error" role="alert"><p>{remove.rowId ? 'Bu renk satırındaki bilgiler kaldırılacak.' : 'Marka ve altındaki bütün renk satırları kaldırılacak.'}</p><button type="button" className="button ws-secondary" onClick={() => setRemove(null)}>Vazgeç</button> <button type="button" className="button" onClick={() => { setSections((prev) => remove.rowId ? prev.map((b) => b.id === remove.brandId ? { ...b, rows: b.rows.filter((r) => r.id !== remove.rowId) } : b) : prev.filter((b) => b.id !== remove.brandId)); setRemove(null); }}>Kaldırmayı Onayla</button></div>}
      <button type="button" className="button ws-secondary" disabled={!p.legacy} onClick={() => setSections((prev) => [...prev, newBrand()])}>+ Marka Ekle</button>
      <p className="ws-hint">Toplam kesim adedi: {sections.reduce((sum, b) => sum + b.rows.reduce((n, r) => n + (r.quantity ?? 0), 0), 0)}{results && ' · Sonuç onayından sonra kesim satırları kilitlenir.'}</p>
    </Form>
  </Section>;
}

export function SizeEditor({ production: p, done }: { production: ProductionRecord; done: () => void }) {
  const rows = cutRows(p); const sizes = sizeSeries[p.sizeSeries];
  const [distributions, setDistributions] = useState<SizeDistribution[]>(() => rows.map((r) => ({ rowId: r.id, sizes: { ...p.sizeDistributions.find((d) => d.rowId === r.id)?.sizes } })));
  let warning = ''; try { validateSizes(p, distributions); } catch (e) { warning = e instanceof Error ? e.message : 'Beden dağılımı geçersiz.'; }
  return <Section title={`Beden / Asorti Dağılımı · ${p.sizeSeries}`}><Form onDone={done} onSubmit={() => workflowRepository.saveSizes(p.id, p.revision, distributions)}>
    <div className="table-scroll"><table className="production-size-table"><thead><tr><th>Marka / Renk</th>{sizes.map((s) => <th key={s}>{s}</th>)}<th>Toplam / Kesim</th></tr></thead><tbody>{rows.map((r) => { const d = distributions.find((d) => d.rowId === r.id)!; const total = Object.values(d.sizes).reduce((n, q) => n + q, 0); return <tr key={r.id}><td>{r.brandName} / {r.color}</td>{sizes.map((s) => <td key={s}><input aria-label={`${r.brandName} ${r.color} ${s}`} type="number" min={0} max={r.quantity ?? 0} step="1" value={Number.isNaN(d.sizes[s]) ? '' : d.sizes[s] ?? 0} onChange={(e) => { const q = e.target.valueAsNumber; setDistributions((prev) => prev.map((v) => v.rowId === r.id ? { ...v, sizes: { ...v.sizes, [s]: q } } : v)); }} /></td>)}<td>{total} / {r.quantity}</td></tr>; })}</tbody></table></div>
    {warning ? <p role="alert" className="ws-error">{warning}</p> : <p className="ws-hint">Beden toplamları kesim sonuçlarıyla eşleşiyor. Toplam: {cuttingTotal(p)} adet.</p>}
  </Form></Section>;
}
