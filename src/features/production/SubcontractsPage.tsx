import { useState } from 'react';
import { Link } from 'react-router-dom';
import { productionRepository } from '../../data/production';
import { operations, stageAmount, stageGiven, stageRemaining, stageStatuses } from '../../domain/production';
import { displayDate, money } from '../products/model';
import { Field, Page, Section, Table, companyName, useCompanies, useResource } from '../shared/WorkshopUI';

export function SubcontractsPage() {
  const resource = useResource(productionRepository.load); const companies = useCompanies(); const [company, setCompany] = useState(''); const [operation, setOperation] = useState(''); const [status, setStatus] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const rows = (resource.data?.stages ?? []).filter((s) => s.companyId && (!company || s.companyId === company) && (!operation || s.lines.some((l) => l.operation === operation)) && (!status || s.status === status) && (!from || s.date >= from) && (!to || s.date <= to));
  const summary = [...new Set(rows.map((s) => s.companyId))].map((id) => { const jobs = rows.filter((s) => s.companyId === id && s.status !== 'Tamamlandı'); return [companyName(companies.data, id), jobs.length, jobs.reduce((sum, s) => sum + stageRemaining(s), 0)]; });
  return <Page title="Fason Takibi" error={resource.error || companies.error} loading={!resource.data && !resource.error} reload={resource.reload}><div className="ws-filters"><Field label="Fasoncu"><select value={company} onChange={(e) => setCompany(e.target.value)}><option value="">Tümü</option>{(companies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="İşlem"><select value={operation} onChange={(e) => setOperation(e.target.value)}><option value="">Tümü</option>{operations.map((o) => <option key={o}>{o}</option>)}</select></Field><Field label="Durum"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tümü</option>{stageStatuses.map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Başlangıç"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Bitiş"><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field></div>
    <Section title="Fasoncu Özeti"><Table headers={['Fasoncu / Atölye', 'Devam Eden İş', 'Dışarıdaki Adet']} rows={summary} /></Section>
    <Table headers={['İş Emri', 'Fasoncu / Atölye', 'İş Kartı / Parti', 'Ürün', 'İşlem', 'Verilen', 'Geri Gelen', 'Kalan', 'Tutar', 'Veriliş Tarihi', 'Durum']} rows={rows.map((s) => { const j = resource.data?.jobs.find((j) => j.id === s.jobId); const p = resource.data?.plans.find((p) => p.id === j?.planId); return [s.number, companyName(companies.data, s.companyId), <Link to={`/uretim/devam-eden?is=${s.jobId}`}>{j?.number}</Link>, p?.name, s.lines.map((l) => l.operation).join(', '), stageGiven(s), stageGiven(s) - stageRemaining(s), stageRemaining(s), money(stageAmount(s)), displayDate(s.date), s.status]; })} />
    <p className="ws-hint">İş emirleri üretim iş kartlarından gelir. Geri gelen miktarı güncellemek ve işi onaylamak için İş Kartı bağlantısını kullanın. Çok işlemli aşamada dışarıdaki adet en yüksek kalan işlem miktarıdır.</p>
  </Page>;
}
