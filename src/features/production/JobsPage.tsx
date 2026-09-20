import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productionRepository } from '../../data/production';
import { planQuantity, stageAmount, stageGiven, stageRemaining, stageStatuses } from '../../domain/production';
import type { ProductionStage } from '../../domain/production';
import { displayDate, money, today } from '../products/model';
import { Form, Input, Page, Section, Select, Table, companyName, numeric, text, useCompanies, useResource } from '../shared/WorkshopUI';
import { OperationSummary, StageForm } from './StageForm';
import { productRepository } from '../../data/products';
import { CompletionForm } from './CompletionForm';

export function JobsPage() {
  const resource = useResource(productionRepository.load); const companies = useCompanies(); const [params, setParams] = useSearchParams(); const [adding, setAdding] = useState(false); const [stageId, setStageId] = useState('');
  const data = resource.data; const job = data?.jobs.find((j) => j.id === params.get('is')); const plan = data?.plans.find((p) => p.id === job?.planId); const stage = data?.stages.find((s) => s.id === stageId);
  const products = useResource(productRepository.load); const receipt = products.data?.productionReceipts?.find((r) => r.jobId === job?.id);
  const done = () => { resource.reload(); products.reload(); setAdding(false); setStageId(''); };
  return <Page title="Üretim Aşamasındaki Ürünler" error={resource.error || companies.error} loading={!data && !resource.error} reload={resource.reload}>
    {products.error && <p className="ws-error">{products.error}</p>}
    {job && plan && data ? <><div className="ws-tabs"><button className="button ws-secondary" onClick={() => { setParams({}); setAdding(false); setStageId(''); }}>İş Kartları</button><button className="button" disabled={!companies.data || !!receipt || !!products.error} onClick={() => { setAdding(!adding); setStageId(''); }}>+ Üretim Aşaması Ekle</button></div>
      <Section title={`${job.number} · ${plan.name}`}><p className="ws-hint">Marka: {plan.brand || '—'} · Toplam: {planQuantity(plan)} adet · Başlangıç: {displayDate(job.startDate)} · Durum: {receipt ? 'Tamamlandı' : 'Üretimde'}<br />{plan.colors.map((c) => `${c.color}: ${c.quantity}`).join(' / ')}<br />{plan.note}</p><OperationSummary data={data} jobId={job.id} /></Section>
      {adding && <StageForm data={data} jobId={job.id} contacts={companies.data ?? []} done={done} />}
      {stage && <Section title={`${stage.number} · Geri Gelen / Durum`}><Form key={stage.id} onDone={done} onSubmit={(f) => productionRepository.receiveStage(stage.id, stage.lines.map((_, i) => numeric(f, `returned-${i}`)), text(f, 'status') as ProductionStage['status'], text(f, 'date'))}><div className="ws-grid">{stage.lines.map((line, i) => <Input key={line.operation} label={`${line.operation} · Verilen ${line.quantity} / Geri gelen toplam *`} name={`returned-${i}`} type="number" min={line.returned} max={line.quantity} step="1" value={line.returned} required />)}<Select label="Durum" name="status" values={stageStatuses} value={stage.status} /><Input label="Dönüş / Onay Tarihi *" name="date" type="date" min={stage.date} value={today()} required /></div></Form></Section>}
      <Section title="Üretim Aşamaları / Fason İş Emirleri"><Table headers={['Emir No', 'İşi Yapan', 'İşlemler', 'Verilen', 'Geri Gelen', 'Kalan', 'Fiyat / Tutar', 'Veriliş', 'Durum', 'Not', 'İşlem']} rows={data.stages.filter((s) => s.jobId === job.id).map((s) => [s.number, s.companyId ? companyName(companies.data, s.companyId) : 'Kendi Atölyemiz', s.lines.map((l) => `${l.operation}: ${l.quantity} / gelen ${l.returned}`).join(', '), stageGiven(s), stageGiven(s) - stageRemaining(s), stageRemaining(s), <>{s.lines.map((l) => `${l.operation}: ${money(l.priceMinor)} (${l.priceType})`).join(' / ')}<br /><strong>{money(stageAmount(s))}</strong></>, displayDate(s.date), s.status, s.note, <button className="button ws-secondary" disabled={s.status === 'Tamamlandı'} onClick={() => { setStageId(s.id); setAdding(false); }}>Geri Gelen / Onayla</button>])} /><p className="ws-hint">Bir aşamadaki çoklu işlemler aynı ürünler üzerinde yapılır. Verilen ve dışarıdaki adet, işlem adetleri toplanmadan en yüksek değer üzerinden gösterilir.</p></Section>
      {receipt ? <Section title="Üretim Tamamlandı"><p>Stoğa aktarılan: {receipt.good} adet · Fire / Hatalı: {receipt.waste} · {displayDate(receipt.date)}</p><p className="ws-hint">{receipt.note}</p></Section> : !products.error && <CompletionForm plan={plan} jobId={job.id} done={done} />}
    </> : <Table headers={['İş No / Parti', 'Ürün', 'Marka', 'Toplam Adet', 'Başlangıç', 'Durum', 'İşlemler']} rows={(data?.jobs ?? []).map((j) => { const p = data?.plans.find((p) => p.id === j.planId); return [j.number, p?.name, p?.brand, p ? planQuantity(p) : 0, displayDate(j.startDate), products.data?.productionReceipts?.some((r) => r.jobId === j.id) ? 'Tamamlandı' : 'Üretimde', <button className="button ws-secondary" onClick={() => setParams({ is: j.id })}>İş Kartı</button>]; })} />}
  </Page>;
}
