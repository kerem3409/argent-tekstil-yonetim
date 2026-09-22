import { useState } from 'react';
import { workflowRepository } from '../../data/production';
import type { Contact } from '../contacts/model';
import { completionTargets, cutRows, processes } from '../../domain/productionWorkflow';
import type { CompletionLine, Process, ProductionRecord, WorkflowStage } from '../../domain/productionWorkflow';
import { CompanySelect, Field, Form, Input, Section, Select, numeric, text } from '../shared/WorkshopUI';
import { money, today } from '../products/model';

export function WorkflowStageForm({ production: p, contacts, done }: { production: ProductionRecord; contacts: Contact[]; done: () => void }) {
  const [process, setProcess] = useState<Process>('Nakış'); const [sent, setSent] = useState(1); const [returned, setReturned] = useState(0);
  const [price, setPrice] = useState(0); const [priceType, setPriceType] = useState<WorkflowStage['priceType']>('Adet Fiyatı');
  const status = returned === sent ? 'Tamamlandı' : returned > 0 ? 'Kısmi Geldi' : 'İşlemde';
  return <Section title="Üretim Aşaması Ekle"><Form onDone={done} label={status === 'Tamamlandı' ? 'Kaydet ve Onayla' : 'Aşamayı Kaydet'} onSubmit={(f) => workflowRepository.addStage(p.id, p.revision, { processType: process, companyId: text(f, 'companyId'), rowId: text(f, 'rowId'), sentQuantity: sent, returnedQuantity: returned, priceType, price, sentDate: text(f, 'sentDate'), returnDate: returned > 0 ? text(f, 'returnDate') : '', status, note: text(f, 'note') })}>
    <div className="ws-grid"><Field label="İşlem Türü"><select value={process} onChange={(e) => setProcess(e.target.value as Process)}>{processes.map((s) => <option key={s}>{s}</option>)}</select></Field>
      <CompanySelect label="İşlemi Yapan Firma / Kişi" key={process} contacts={contacts} own preferredIds={contacts.filter((c) => c.services.some((s) => s === process)).map((c) => c.id)} />
      <Field label="Marka / Renk *"><select name="rowId" required={!p.legacy} defaultValue=""><option value="">{p.legacy ? 'Eski kayıt — genel miktar' : 'Seçin'}</option>{cutRows(p).map((r) => <option key={r.id} value={r.id}>{r.brandName} / {r.color} · {r.quantity} adet</option>)}</select></Field>
      <Field label="Gönderilen Adet *"><input type="number" min={1} max={1e9} step="1" required value={Number.isNaN(sent) ? '' : sent} onChange={(e) => setSent(e.target.valueAsNumber)} /></Field>
      <Field label="Gelen Adet *"><input type="number" min={0} max={sent} step="1" required value={Number.isNaN(returned) ? '' : returned} onChange={(e) => setReturned(e.target.valueAsNumber)} /></Field>
      <Field label="Kalan Adet"><input readOnly value={Number.isFinite(sent - returned) ? sent - returned : '—'} /></Field>
      <Field label="Fiyat Türü"><select value={priceType} onChange={(e) => setPriceType(e.target.value as typeof priceType)}><option>Adet Fiyatı</option><option>Toplam Fiyat</option></select></Field>
      <Field label={`${priceType} (TL) *`}><input type="number" required min={0} step="0.01" value={Number.isNaN(price) ? '' : price} onChange={(e) => setPrice(e.target.valueAsNumber)} /></Field>
      <Field label="Tutar"><input readOnly value={Number.isFinite(price * sent) ? money(Math.round(price * 100) * (priceType === 'Adet Fiyatı' ? sent : 1)) : '—'} /></Field>
      <Input label="Gönderim Tarihi *" name="sentDate" type="date" min={p.date} value={today()} required />
      {returned > 0 && <Input label="Dönüş Tarihi *" name="returnDate" type="date" min={p.date} value={today()} required />}
      <Field label="Durum"><input readOnly value={status} /></Field><Input label="Not" name="note" />
    </div><p className="ws-hint">Tamamlanan iş onaylanır ve ilgili atölyenin carisine bir kez borç yansır. Kendi atölyemiz için cari hareket oluşmaz.</p>
  </Form></Section>;
}

export function WorkflowReturnForm({ production: p, stage: s, done }: { production: ProductionRecord; stage: WorkflowStage; done: () => void }) {
  return <Section title={`${s.processType} · Gelen Adet / Onay`}><Form onDone={done} onSubmit={(f) => workflowRepository.receiveStage(p.id, p.revision, s.id, numeric(f, 'returned'), text(f, 'date'), text(f, 'status') as WorkflowStage['status'], s.legacyLines?.map((_, i) => numeric(f, `legacy-${i}`)))}>
    <div className="ws-grid">{s.legacyLines ? s.legacyLines.map((l, i) => <Input key={i} label={`${l.operation} Gelen Toplam * (Gönderilen: ${l.quantity})`} name={`legacy-${i}`} type="number" value={l.returned} min={l.returned} max={l.quantity} step="1" required />) : <Input label={`Gelen Toplam * (Gönderilen: ${s.sentQuantity})`} name="returned" type="number" value={s.returnedQuantity} min={s.returnedQuantity} max={s.sentQuantity} step="1" required />}
      <Input label="Dönüş / Onay Tarihi *" name="date" type="date" min={s.returnDate || s.sentDate} value={today()} required /><Select label="Durum" name="status" values={['İşlemde', 'Kısmi Geldi', 'Tamamlandı']} value={s.status} />
    </div><p className="ws-hint">Tamamlandı seçildiğinde işlem onaylanır ve artık değiştirilemez.</p>
  </Form></Section>;
}

export function WorkflowCompletionForm({ production: p, done }: { production: ProductionRecord; done: () => void }) {
  const targets = completionTargets(p);
  const [lines, setLines] = useState<CompletionLine[]>(() => targets.map((t) => ({ rowId: t.rowId, size: t.size, good: t.quantity, waste: 0 })));
  const good = lines.reduce((n, l) => n + l.good, 0); const waste = lines.reduce((n, l) => n + l.waste, 0);
  return <Section title="Üretimi Tamamla"><Form onDone={done} label="Üretimi Tamamla" onSubmit={(f) => workflowRepository.complete(p.id, p.revision, lines, text(f, 'date'), text(f, 'note'))}>
    <div className="table-scroll"><table className="production-size-table"><thead><tr><th>Marka / Renk / Beden</th><th>Kesim</th><th>Sağlam Ürün Adedi</th><th>Fire / Hatalı Adet</th></tr></thead><tbody>{targets.map((t, i) => <tr key={`${t.rowId}-${t.size}`}><td>{t.brandName} / {t.color} / {t.size || 'Beden belirtilmemiş'}</td><td>{t.quantity}</td><td><input aria-label={`${t.brandName} ${t.color} ${t.size} sağlam`} type="number" min={0} max={t.quantity} required step="1" value={Number.isNaN(lines[i].good) ? '' : lines[i].good} onChange={(e) => { const good = e.target.valueAsNumber; setLines((prev) => prev.map((l, j) => i === j ? { ...l, good, waste: t.quantity - good } : l)); }} /></td><td><input aria-label={`${t.brandName} ${t.color} ${t.size} fire`} type="number" min={0} max={t.quantity} required step="1" value={Number.isNaN(lines[i].waste) ? '' : lines[i].waste} onChange={(e) => { const waste = e.target.valueAsNumber; setLines((prev) => prev.map((l, j) => i === j ? { ...l, waste, good: t.quantity - waste } : l)); }} /></td></tr>)}</tbody></table></div>
    <p className="ws-hint">Sağlam: {good} · Fire / Hatalı: {waste}. Tamamlamadan sonra yalnızca sağlam ürünler Stoğa Aktar işlemiyle kaydedilir.</p>
    <div className="ws-grid"><Input label="Tamamlama Tarihi *" name="date" type="date" min={p.date} value={today()} required /><Input label="Not" name="note" /></div>
  </Form></Section>;
}
