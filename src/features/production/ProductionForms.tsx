import { useState } from 'react';
import { workflowRepository } from '../../data/production';
import { inventory } from '../../data/inventory';
import { ProductDefinitionSelect } from '../productDefinitions/ProductDefinitionSelect';
import { Field, Form, Input, Section, text, useResource } from '../shared/WorkshopUI';
import { today } from '../products/model';
import { productionSizes, orderAllocation, validateCommonSizeDistribution } from '../../domain/productionWorkflow';
import type { BrandSection, ProductionOrderItem, ProductionRecord, CommonSizeDistribution, SizeSeries } from '../../domain/productionWorkflow';
import { AssignmentFields, PlannedSizes } from './ProductionCardEditor';
import type { Contact } from '../contacts/model';

export function NewProductionForm({ contacts, saved, orderCardId, orderItem, records = [] }: { contacts: Contact[]; saved: (p: ProductionRecord) => void; orderCardId?: string; orderItem?: ProductionOrderItem; records?: ProductionRecord[] }) {
  const [product, setProduct] = useState(orderItem?.productDefinitionId ?? ''); const [fabric, setFabric] = useState(''); const [gsm, setGsm] = useState(orderItem?.gsm ?? '');
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [series, setSeries] = useState<SizeSeries>('Yetişkin'); const [sizes, setSizes] = useState<CommonSizeDistribution>({});
  const fabrics = useResource(inventory.fabrics.load);
  const allocation = orderItem ? orderAllocation(orderItem, records) : [];
  const selected = allocation.filter((r) => (amounts[r.color] ?? 0) > 0).map((r) => ({ color: r.color, quantity: amounts[r.color] }));
  function validate(f: FormData) {
    const errors: string[] = []; if (!text(f, 'brand')) errors.push('Marka');
    if (orderItem) {
      if (!selected.length) errors.push('Üretime alınacak en az bir renk ve pozitif adet seçin.');
      for (const row of allocation) { const q = amounts[row.color] ?? 0; if (!Number.isSafeInteger(q) || q < 0) errors.push(row.color + ': adet sıfır veya pozitif tam sayı olmalıdır.'); else if (q > row.remaining) errors.push(row.color + ' renk için üretime alınabilecek en fazla miktar ' + row.remaining + ' adettir.'); }
      try { validateCommonSizeDistribution(series, sizes); } catch (e) { errors.push(e instanceof Error ? e.message : 'Beden dağılımı geçersiz.'); }
    }
    return errors;
  }
  return <Section title="Yeni Üretim Kaydı"><p className="ws-hint">Her Üretim Kartı tek markaya aittir. Sipariş kalemini farklı markalar için ayrı kartlara bölebilirsiniz.</p>
    <Form validate={validate} onDone={() => {}} onSubmit={async (f) => { const p = await workflowRepository.create({ productDefinitionId: product, brand: text(f, 'brand'), orderCardId, orderItemId: orderItem?.id, selectedColorQuantities: selected, sizeDistribution: sizes, sewingCompanyId: text(f, 'sewingCompanyId'), embroideryCompanyId: text(f, 'embroideryCompanyId'), printingCompanyId: text(f, 'printingCompanyId'), ironingPackagingCompanyId: text(f, 'ironingPackagingCompanyId'), fabricId: fabric, fabricName: orderItem?.fabricName ?? text(f, 'fabricName'), gsm, fabricProperties: text(f, 'fabricProperties'), sizeSeries: series, cuttingMode: 'Kumaştan Çıktığı Kadar', targetQuantity: null, cutterCompanyId: text(f, 'cutterCompanyId'), date: text(f, 'date'), productInstructions: text(f, 'instructions'), note: text(f, 'note') }); saved(p); }} label="Üretim Kartını Oluştur">
      <div className="ws-grid"><Field label="Üretim No"><input readOnly value="Otomatik" /></Field><Field label="Marka *"><input name="brand" required maxLength={200} /></Field>{orderItem ? <><Field label="Ürün Tanımı"><input readOnly value={orderItem.productName} /></Field><Field label="Ürün / Model"><input readOnly value={orderItem.modelName ?? orderItem.productName} /></Field></> : <ProductDefinitionSelect value={product} onChange={setProduct} quickAdd />}
        <Field label="Kumaş"><select value={fabric} onChange={(e) => { setFabric(e.target.value); setGsm(fabrics.data?.records.find((r) => r.id === e.target.value)?.grammage ?? ''); }}><option value="">Stok dışı / belirtilmedi</option>{fabrics.data?.records.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.grammage || 'Gramaj yok'} · {r.date}</option>)}</select></Field>
        {!fabric && <Input label="Kumaş Adı *" name="fabricName" value={orderItem?.fabricName} required />}
        <Field label="Gramaj"><input value={gsm} maxLength={200} onChange={(e) => setGsm(e.target.value)} /></Field>
        <AssignmentFields contacts={contacts} />
        <Input label="Tarih *" name="date" type="date" value={today()} required />
        <Field label="Kumaş Özellikleri"><textarea name="fabricProperties" defaultValue={orderItem?.fabricProperties} rows={2} /></Field><Field label="Ürün Detayı / Talimat"><textarea name="instructions" defaultValue={orderItem?.productDetails} rows={3} maxLength={2000} /></Field><Field label="Not"><textarea name="note" rows={3} maxLength={2000} /></Field>
      </div>
      {orderItem && <Section title="Sipariş Renkleri / Adet"><div className="table-scroll"><table className="ws-table"><thead><tr>{['Renk', 'Sipariş', 'Daha Önce Aktarılan', 'Kalan', 'Bu Üretime Al'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{allocation.map((r) => <tr key={r.color}><td>{r.color}</td><td>{r.quantity}</td><td>{r.allocated}</td><td>{r.remaining}</td><td><input aria-label={r.color + ' Bu Üretime Al'} type="number" min={0} max={r.remaining} step={1} value={amounts[r.color] || ''} onChange={(e) => { const q = Number(e.target.value); setAmounts((prev) => ({ ...prev, [r.color]: q })); }} /></td></tr>)}</tbody></table></div></Section>}
      <PlannedSizes series={series} value={sizes} onChange={setSizes} onSeriesChange={setSeries} />
      {fabrics.error && <p role="alert" className="ws-error">{fabrics.error}</p>}
    </Form>
  </Section>;
}

const newRow = () => ({ id: crypto.randomUUID(), color: '', rollCount: null, kg: null, quantity: null });
const newBrand = (): BrandSection => ({ id: crypto.randomUUID(), brandName: '', rows: [newRow()] });
export function CuttingEditor({ production: p, done }: { production: ProductionRecord; done: () => void }) {
  const [sections, setSections] = useState<BrandSection[]>(() => structuredClone(p.cuttingSheet.brandSections.length ? p.cuttingSheet.brandSections : [{ ...newBrand(), brandName: p.brand ?? '' }]));
  const [remove, setRemove] = useState<{ brandId: string; rowId?: string } | null>(null);
  function updateRow(brandId: string, rowId: string, changes: Partial<BrandSection['rows'][number]>) { setSections((prev) => prev.map((b) => b.id === brandId ? { ...b, rows: b.rows.map((r) => r.id === rowId ? { ...r, ...changes } : r) } : b)); }
  return <Section title="Kesim Sonucu Gir">
    <p className="ws-hint">Kesim tamamlandıktan sonra kesimcinin bildirdiği top sayısı, kg ve çıkan adetleri girin. Kesime gönderilecek boş föy için Kesime Föy Hazırla düğmesini kullanın.</p>
    <Form onDone={done} label="Kesim Sonucunu Kaydet" onSubmit={() => workflowRepository.saveCutting(p.id, p.revision, sections, true)}>
      {sections.map((b) => <div className="production-brand-editor" key={b.id}><Field label="Marka *"><input required readOnly={!!p.singleBrand} maxLength={200} value={b.brandName} onChange={(e) => setSections((prev) => prev.map((item) => item.id === b.id ? { ...item, brandName: e.target.value } : item))} /></Field>
        {b.rows.map((r) => <div className="production-color-editor" key={r.id}>
          <Field label="Renk *"><input required readOnly={!!p.orderItemId} maxLength={100} value={r.color} onChange={(e) => updateRow(b.id, r.id, { color: e.target.value })} /></Field>
          <Field label="Top Sayısı *"><input type="number" required min={1} max={1e9} step="1" value={r.rollCount ?? ''} onChange={(e) => updateRow(b.id, r.id, { rollCount: e.target.value === '' ? null : e.target.valueAsNumber })} /></Field>
          <Field label="Kg *"><input type="number" required min={0} max={1e9} step="0.001" value={r.kg ?? ''} onChange={(e) => updateRow(b.id, r.id, { kg: e.target.value === '' ? null : e.target.valueAsNumber })} /></Field>
          <Field label="Çıkan Adet *"><input type="number" required min={0} max={1e9} step="1" value={r.quantity ?? ''} onChange={(e) => updateRow(b.id, r.id, { quantity: e.target.value === '' ? null : e.target.valueAsNumber })} /></Field>
          <button type="button" className="button ws-secondary" disabled={!!p.orderItemId || b.rows.length === 1} onClick={() => setRemove({ brandId: b.id, rowId: r.id })}>Satırı Sil</button>
        </div>)}
        <div className="ws-tabs"><button type="button" className="button ws-secondary" disabled={!!p.orderItemId} onClick={() => setSections((prev) => prev.map((item) => item.id === b.id ? { ...item, rows: [...item.rows, newRow()] } : item))}>+ Renk Ekle</button><button type="button" disabled={!!p.orderItemId || sections.length === 1} className="button ws-secondary" onClick={() => setRemove({ brandId: b.id })}>Markayı Kaldır</button></div>
      </div>)}
      {remove && <div className="ws-error" role="alert"><p>{remove.rowId ? 'Bu renk satırındaki bilgiler kaldırılacak.' : 'Marka ve altındaki bütün renk satırları kaldırılacak.'}</p><button type="button" className="button ws-secondary" onClick={() => setRemove(null)}>Vazgeç</button> <button type="button" className="button" onClick={() => { setSections((prev) => remove.rowId ? prev.map((b) => b.id === remove.brandId ? { ...b, rows: b.rows.filter((r) => r.id !== remove.rowId) } : b) : prev.filter((b) => b.id !== remove.brandId)); setRemove(null); }}>Kaldırmayı Onayla</button></div>}
      <button type="button" className="button ws-secondary" disabled={!p.legacy} onClick={() => setSections((prev) => [...prev, newBrand()])}>+ Marka Ekle</button>
      <p className="ws-hint">Toplam kesim adedi: {sections.reduce((sum, b) => sum + b.rows.reduce((n, r) => n + (r.quantity ?? 0), 0), 0)} · Sonuç onayından sonra kesim satırları kilitlenir.</p>
    </Form>
  </Section>;
}

export function SizeEditor({ production: p, done }: { production: ProductionRecord; done: () => void }) {
  const sizes = productionSizes(p); const [distribution, setDistribution] = useState<CommonSizeDistribution>(() => p.sizeDistribution ?? p.sizeDistributions[0]?.sizes ?? {});
  let warning = ''; try { validateCommonSizeDistribution(p.sizeSeries, distribution); } catch (e) { warning = e instanceof Error ? e.message : 'Beden dağılımı geçersiz.'; }
  return <Section title={`Beden Serisi / Ortak Pastal Dağılımı · ${p.sizeSeries}`}><Form onDone={done} onSubmit={() => workflowRepository.saveCommonSizeDistribution(p.id, p.revision, p.sizeSeries, distribution)}>
    <p className="ws-hint">Bu beden/pastal dağılımı Üretim Kartındaki tüm renklere ortak uygulanır.</p><div className="common-size-grid">{sizes.map((size) => <Field key={size} label={size}><input aria-label={size} className="common-size-input" type="number" min={0} step={1} value={distribution[size] || ''} onChange={(e) => setDistribution((prev) => ({ ...prev, [size]: Number(e.target.value) }))} /></Field>)}</div>
    {warning ? <p role="alert" className="ws-error">{warning}</p> : <p className="ws-hint">Seri Toplamı: {Object.values(distribution).reduce((n, q) => n + (q || 0), 0)} parça</p>}
  </Form></Section>;
}
