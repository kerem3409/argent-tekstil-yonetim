import { useState } from 'react';
import type { Contact, SubcontractService } from '../contacts/model';
import { CompanySelect, Field, Form, Section, text } from '../shared/WorkshopUI';
import { workflowRepository } from '../../data/production';
import { sizeSeries, validatePlannedSizes } from '../../domain/productionWorkflow';
import type { PlannedSizeDistribution, ProductionRecord, SizeSeries } from '../../domain/productionWorkflow';

export const assignmentFields = [
  ['cutterCompanyId', 'Kesim', 'Kesimci / Atölye'], ['embroideryCompanyId', 'Nakış', 'Nakışçı'], ['printingCompanyId', 'Baskı', 'Baskıcı'], ['sewingCompanyId', 'Dikim', 'Dikim Firması'], ['ironingPackagingCompanyId', 'Ütü & Paket', 'Ütü/Paket Firması'],
] as const;
export function AssignmentFields({ contacts, production }: { contacts: Contact[]; production?: ProductionRecord }) {
  return <>{assignmentFields.map(([field, service, label]) => {
    const locked = production && ((service === 'Kesim' && production.cuttingSheet.completedAt) || production.productionStages.some((s) => s.processType === service || s.legacyLines?.some((l) => l.operation === service)));
    return locked ? <Field key={field} label={label}><input readOnly value={contacts.find((c) => c.id === production[field])?.name ?? (production[field] ? 'Eski firma kaydı' : 'Kendi Atölyemiz')} /><input type="hidden" name={field} value={production[field] ?? ''} /><small>İşlem başladığı için firma korunur.</small></Field> : <CompanySelect key={field} label={label} contacts={contacts} name={field} value={production?.[field] ?? ''} own role="Fasoncu" service={service as SubcontractService} />;
  })}</>;
}
export function PlannedSizes({ series, selected, value, onChange, onSeriesChange, locked = false }: { series: SizeSeries; selected: { color: string; quantity: number }[]; value: PlannedSizeDistribution[]; onChange: (value: PlannedSizeDistribution[]) => void; onSeriesChange: (series: SizeSeries) => void; locked?: boolean }) {
  const total = value.reduce((sum, d) => sum + Object.values(d.sizes).reduce((n, q) => n + (q || 0), 0), 0);
  return <Section title="Planlanan Beden Dağılımı"><Field label="Beden Serisi"><select disabled={locked} value={series} onChange={(e) => { onSeriesChange(e.target.value as SizeSeries); onChange(selected.map((r) => ({ color: r.color, sizes: {} }))); }}>{Object.keys(sizeSeries).map((s) => <option key={s}>{s}</option>)}</select></Field>
    <p className="ws-hint">{sizeSeries[series].join(' · ')}</p>
    {!selected.length && <p>Önce bu üretime alınacak renk ve adetleri seçin.</p>}
    {selected.map((row) => <div key={row.color}><strong>{row.color} · Bu üretime ayrılan: {row.quantity} adet</strong><div className="ws-grid">{sizeSeries[series].map((size) => <Field key={size} label={`${row.color} ${size}`}><input type="number" min={0} max={row.quantity} step={1} disabled={locked} value={value.find((d) => d.color === row.color)?.sizes[size] || ''} onChange={(e) => {
      const next = selected.map((r) => ({ color: r.color, sizes: { ...value.find((d) => d.color === r.color)?.sizes } }));
      next.find((d) => d.color === row.color)!.sizes[size] = Number(e.target.value); onChange(next);
    }} /></Field>)}</div></div>)}
    <p className="ws-hint">Seri Toplamı: {total} adet · Bu Üretim Kartına ayrılan toplam: {selected.reduce((n, r) => n + r.quantity, 0)} adet</p>
  </Section>;
}

export function ProductionCardEditor({ production: p, contacts, done }: { production: ProductionRecord; contacts: Contact[]; done: () => void }) {
  const [series, setSeries] = useState(p.sizeSeries);
  const [sizes, setSizes] = useState(p.plannedSizeDistributions ?? []);
  return <Section title="Üretim Kartını Güncelle"><p className="ws-hint">Marka değişiyorsa yeni Üretim Kartı oluşturulmalıdır. Sipariş bağlantıları ve ayrılan renk/adetler korunur.</p>
    <Form label="Üretim Kartını Güncelle" onDone={done} validate={() => { try { if (p.orderItemId && !p.cuttingSheet.completedAt && (p.plannedSizeDistributions?.length || sizes.length || series !== p.sizeSeries)) validatePlannedSizes(series, p.selectedColorQuantities ?? [], sizes); return []; } catch (e) { return [e instanceof Error ? e.message : 'Beden dağılımını kontrol edin.']; } }} onSubmit={(f) => workflowRepository.updateProduction(p.id, p.revision, {
      brand: p.brand, sizeSeries: series, plannedSizeDistributions: sizes,
      cutterCompanyId: text(f, 'cutterCompanyId'), embroideryCompanyId: text(f, 'embroideryCompanyId'), printingCompanyId: text(f, 'printingCompanyId'), sewingCompanyId: text(f, 'sewingCompanyId'), ironingPackagingCompanyId: text(f, 'ironingPackagingCompanyId'),
      fabricProperties: text(f, 'fabricProperties'), productInstructions: text(f, 'instructions'), note: text(f, 'note'),
    })}>
      <Field label="Marka"><input readOnly value={p.brand ?? ''} /></Field>
      {!p.cuttingSheet.completedAt && p.orderItemId ? <PlannedSizes series={series} selected={p.selectedColorQuantities ?? []} value={sizes} onChange={setSizes} onSeriesChange={setSeries} /> : <Field label="Beden Serisi"><select value={series} disabled={!!p.cuttingSheet.completedAt} onChange={(e) => setSeries(e.target.value as SizeSeries)}>{Object.keys(sizeSeries).map((s) => <option key={s}>{s}</option>)}</select></Field>}
      <div className="ws-grid"><AssignmentFields contacts={contacts} production={p} /><Field label="Kumaş Özellikleri"><textarea name="fabricProperties" defaultValue={p.fabricProperties} maxLength={2000} /></Field><Field label="Ürün Detayı / Talimat"><textarea name="instructions" defaultValue={p.productInstructions} maxLength={2000} /></Field><Field label="Not"><textarea name="note" defaultValue={p.note} maxLength={2000} /></Field></div>
      <button type="button" className="button ws-secondary" onClick={done}>Vazgeç</button>
    </Form>
  </Section>;
}
