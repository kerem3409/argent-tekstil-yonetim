import { useState } from 'react';
import type { Contact, SubcontractService } from '../contacts/model';
import { CompanySelect, Field, Form, Section, text } from '../shared/WorkshopUI';
import { workflowRepository } from '../../data/production';
import { sizeSeries, validateCommonSizeDistribution } from '../../domain/productionWorkflow';
import type { CommonSizeDistribution, ProductionRecord, SizeSeries } from '../../domain/productionWorkflow';

export const assignmentFields = [
  ['cutterCompanyId', 'Kesim', 'Kesimci / Atölye'], ['embroideryCompanyId', 'Nakış', 'Nakışçı'], ['printingCompanyId', 'Baskı', 'Baskıcı'], ['sewingCompanyId', 'Dikim', 'Dikim Firması'], ['ironingPackagingCompanyId', 'Ütü & Paket', 'Ütü/Paket Firması'],
] as const;
export function AssignmentFields({ contacts, production }: { contacts: Contact[]; production?: ProductionRecord }) {
  return <>{assignmentFields.map(([field, service, label]) => {
    const locked = production && ((service === 'Kesim' && production.cuttingSheet.completedAt) || production.productionStages.some((s) => s.processType === service || s.legacyLines?.some((l) => l.operation === service)));
    return locked ? <Field key={field} label={label}><input readOnly value={contacts.find((c) => c.id === production[field])?.name ?? (production[field] ? 'Eski firma kaydı' : 'Kendi Atölyemiz')} /><input type="hidden" name={field} value={production[field] ?? ''} /><small>İşlem başladığı için firma korunur.</small></Field> : <CompanySelect key={field} label={label} contacts={contacts} name={field} value={production?.[field] ?? ''} own role="Fasoncu" service={service as SubcontractService} />;
  })}</>;
}
export function PlannedSizes({ series, value, onChange, onSeriesChange, locked = false }: { series: SizeSeries; value: CommonSizeDistribution; onChange: (value: CommonSizeDistribution) => void; onSeriesChange: (series: SizeSeries) => void; locked?: boolean }) {
  const total = Object.values(value).reduce((sum, amount) => sum + (amount || 0), 0);
  return <Section title="Beden Serisi / Pastal Dağılımı"><p className="ws-hint">Bu beden/pastal dağılımı Üretim Kartındaki tüm renklere ortak uygulanır.</p><Field label="Beden Serisi"><select disabled={locked} value={series} onChange={(e) => { onSeriesChange(e.target.value as SizeSeries); onChange({}); }}>{Object.keys(sizeSeries).map((s) => <option key={s}>{s}</option>)}</select></Field>
    <div className="common-size-grid">{sizeSeries[series].map((size) => <Field key={size} label={size}><input aria-label={size} className="common-size-input" type="number" min={0} step={1} disabled={locked} value={value[size] || ''} onChange={(e) => onChange({ ...value, [size]: Number(e.target.value) })} /></Field>)}</div>
    <p className="ws-hint">Seri Toplamı: {total} parça</p>
  </Section>;
}

export function ProductionCardEditor({ production: p, contacts, done }: { production: ProductionRecord; contacts: Contact[]; done: () => void }) {
  const [series, setSeries] = useState(p.sizeSeries);
  const [sizes, setSizes] = useState(p.sizeDistribution ?? {});
  return <Section title="Üretim Kartını Güncelle"><p className="ws-hint">Marka değişiyorsa yeni Üretim Kartı oluşturulmalıdır. Sipariş bağlantıları ve ayrılan renk/adetler korunur.</p>
    <Form label="Üretim Kartını Güncelle" onDone={done} validate={() => { try { if (Object.keys(sizes).length) validateCommonSizeDistribution(series, sizes); return []; } catch (e) { return [e instanceof Error ? e.message : 'Beden dağılımını kontrol edin.']; } }} onSubmit={(f) => workflowRepository.updateProduction(p.id, p.revision, {
      brand: p.brand, sizeSeries: series, sizeDistribution: sizes,
      cutterCompanyId: text(f, 'cutterCompanyId'), embroideryCompanyId: text(f, 'embroideryCompanyId'), printingCompanyId: text(f, 'printingCompanyId'), sewingCompanyId: text(f, 'sewingCompanyId'), ironingPackagingCompanyId: text(f, 'ironingPackagingCompanyId'),
      fabricProperties: text(f, 'fabricProperties'), productInstructions: text(f, 'instructions'), note: text(f, 'note'),
    })}>
      <Field label="Marka"><input readOnly value={p.brand ?? ''} /></Field>
      <PlannedSizes series={series} value={sizes} onChange={setSizes} onSeriesChange={setSeries} locked={!!p.cuttingSheet.completedAt} />
      <div className="ws-grid"><AssignmentFields contacts={contacts} production={p} /><Field label="Kumaş Özellikleri"><textarea name="fabricProperties" defaultValue={p.fabricProperties} maxLength={2000} /></Field><Field label="Ürün Detayı / Talimat"><textarea name="instructions" defaultValue={p.productInstructions} maxLength={2000} /></Field><Field label="Not"><textarea name="note" defaultValue={p.note} maxLength={2000} /></Field></div>
      <button type="button" className="button ws-secondary" onClick={done}>Vazgeç</button>
    </Form>
  </Section>;
}
