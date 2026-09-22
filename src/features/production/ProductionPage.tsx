import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { workflowRepository } from '../../data/production';
import { cuttingTotal, cutRows, processes, sizeSeries, stageRemainingQuantity, subcontractRows, workflowStageAmount } from '../../domain/productionWorkflow';
import type { ProductionRecord } from '../../domain/productionWorkflow';
import type { Contact } from '../contacts/model';
import { Action, Field, Page, Section, Table, companyName, useCompanies, useResource } from '../shared/WorkshopUI';
import { money } from '../products/model';
import { CuttingEditor, NewProductionForm, SizeEditor } from './ProductionForms';
import { WorkflowCompletionForm, WorkflowReturnForm, WorkflowStageForm } from './WorkflowStageForms';
import { ProductionPrint } from './ProductionPrint';
import './production.css';

const titles = { new: 'Yeni Üretim', sheets: 'Kesim Föyleri', tracking: 'Üretim Takibi', subcontracts: 'Fason Takibi', completed: 'Tamamlanan Üretimler' };
export type ProductionView = keyof typeof titles;
const detailHref = (p: ProductionRecord) => `/uretim/${p.status === 'Tamamlandı' ? 'tamamlanan' : 'takip'}?id=${encodeURIComponent(p.id)}`;
export function ProductionPage({ view }: { view: ProductionView }) {
  const resource = useResource(workflowRepository.list); const orders = useResource(workflowRepository.listOrders); const companies = useCompanies(); const [params, setParams] = useSearchParams(); const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const id = params.get('id') || params.get('is');
  const p = resource.data?.find((p) => p.id === id || p.legacy?.jobId === id);
  const print = params.get('yazdir');
  const name = (id: string) => id ? companyName(companies.data, id) : 'Kendi Atölyemiz';
  const error = resource.error || orders.error || companies.error;
  const done = () => { resource.reload(); };
  if (p && (print === 'cutting' || print === 'tracking')) return <Page title={print === 'cutting' ? 'Kesim Föyü / A4' : 'Üretim Takip Föyü / A4'} error={error}><div className="production-screen-only ws-tabs"><button className="button" onClick={() => window.print()}>Yazdır / A4 Föy</button><button className="button ws-secondary" onClick={() => setParams({ id: p.id })}>Üretime Dön</button></div><ProductionPrint production={p} kind={print} companyName={name} /></Page>;
  const orderNo = (id?: string) => orders.data?.find((o) => o.id === id)?.orderNo ?? (id ? 'Legacy sipariş' : '—');
  return <Page title={titles[view]} error={error} loading={(!resource.data || !orders.data || !companies.data) && !error} reload={() => { resource.reload(); orders.reload(); companies.reload(); }}>
    {view === 'new' ? companies.data && <NewProductionForm contacts={companies.data} saved={(p) => navigate(detailHref(p))} />
      : p ? <ProductionDetail key={`${p.id}:${p.revision}`} production={p} contacts={companies.data ?? []} done={done} print={(kind) => setParams({ id: p.id, yazdir: kind })} back={() => setParams({})} transferred={() => navigate(`/uretim/tamamlanan?id=${encodeURIComponent(p.id)}`)} />
      : id ? <p role="alert" className="ws-error">Üretim bulunamadı. <button onClick={() => setParams({})}>Listeye dön</button></p>
      : view === 'subcontracts' ? <WorkflowSubcontracts records={resource.data ?? []} contacts={companies.data ?? []} />
      : <><div className="ws-tabs"><Link className="button" to="/uretim/yeni">Yeni Üretim</Link><Field label="Üretim / Ürün Ara"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></Field></div>
        <Table headers={view === 'completed' ? ['Üretim No', 'Sipariş No', 'Marka', 'Ürün', 'Kesimden Çıkan', 'Sağlam Ürün', 'Dikim Firması', 'Tamamlanma Tarihi', 'İşlem'] : ['Üretim No', 'Sipariş No', 'Marka', 'Ürün / Model', 'Kesim Adedi', 'Güncel Durum', 'Dikim Firması', 'Tarih', 'İşlem']} rows={(resource.data ?? []).filter((p) => view === 'completed' ? p.status === 'Tamamlandı' : view === 'tracking' ? p.status !== 'Tamamlandı' : p.status !== 'Tamamlandı').filter((p) => `${p.productionNo} ${p.productName} ${p.brand ?? ''}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))).map((p) => view === 'completed'
          ? [p.productionNo, orderNo(p.orderCardId), p.brand ?? p.cuttingSheet.brandSections[0]?.brandName ?? '—', p.productName, cuttingTotal(p), p.completion?.good, p.sewingCompanyId ? name(p.sewingCompanyId) : '—', p.stockTransfer?.date, <Link className="button ws-secondary" to={detailHref(p)}>Geçmiş / Detay</Link>]
          : [p.productionNo, orderNo(p.orderCardId), p.brand ?? p.cuttingSheet.brandSections[0]?.brandName ?? '—', p.productName, p.cuttingSheet.completedAt ? cuttingTotal(p) : 'Kesim bekliyor', p.status, p.sewingCompanyId ? name(p.sewingCompanyId) : '—', p.date, <Link className="button ws-secondary" to={detailHref(p)}>Üretim Kartını Aç</Link>])} />
      </>}
  </Page>;
}

function ProductionDetail({ production: p, contacts, done, print, back, transferred }: { production: ProductionRecord; contacts: Contact[]; done: () => void; print: (kind: 'cutting' | 'tracking') => void; back: () => void; transferred: () => void }) {
  const [editing, setEditing] = useState('');
  const name = (id: string) => id ? companyName(contacts, id) : 'Kendi Atölyemiz';
  const cut = !!p.cuttingSheet.completedAt; const closed = !!p.completion;
  const finish = () => { setEditing(''); done(); };
  return <><div className="ws-tabs"><button className="button ws-secondary" onClick={back}>Listeye Dön</button>{!!p.cuttingSheet.brandSections.length && <button className="button ws-secondary" onClick={() => print('cutting')}>Kesim Föyü Yazdır / A4</button>}{cut && <button className="button ws-secondary" onClick={() => print('tracking')}>Üretim Takip Föyü Yazdır</button>}</div>
    <p className="production-progress">Yeni Üretim → Kesim Föyü → Kesim Sonucu → Üretimde → Üretim Tamamlama → Stoğa Aktarım<br /><strong>Güncel durum: {p.status}</strong></p>
    <Section title={`${p.productionNo} · ${p.productName}`}><dl className="production-summary">{[['Tarih', p.date], ['Kumaş', p.fabricName || '—'], ['Gramaj', p.gsm || '—'], ['Beden Serisi', p.legacy?.missingSizes && !p.sizeDistributions.length ? 'Eski kayıtta belirtilmemiş' : p.sizeSeries], ['Kesimci / Atölye', name(p.cutterCompanyId)], ['Kesim Şekli', p.cuttingMode === 'Hedef Adet' ? `Hedef ${p.targetQuantity} adet` : p.cuttingMode], ['Toplam Kesim Adedi', cut ? cuttingTotal(p) : 'Bekleniyor']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="ws-hint">{p.productInstructions}</p><p className="ws-hint">{p.note}</p></Section>
    {p.legacy && <p className="ws-hint">Eski üretim kaydı korunarak gösteriliyor. İlk durum: {p.legacy.planStatus}. Eski kayıtta bulunmayan kg ve top bilgileri boş bırakıldı; devam eden işin mevcut renk adetleri esas alındı. Beden dağılımı yoksa geçmiş miktarlar beden atanmadan korunur.</p>}
    {!cut && !closed && <CuttingEditor production={p} done={done} />}
    {cut && <><Section title="Kesim Sonuçları"><Table headers={['Marka', 'Renk', 'Top Sayısı', 'Kg', 'Kesimden Çıkan Adet']} rows={cutRows(p).map((r) => [r.brandName, r.color, r.rollCount ?? '—', r.kg ?? '—', r.quantity])} /></Section>
      {!!p.sizeDistributions.length && <Section title={`Beden Dağılımı · ${p.sizeSeries}`}><Table headers={['Marka / Renk', ...sizeSeries[p.sizeSeries], 'Toplam']} rows={cutRows(p).map((r) => { const d = p.sizeDistributions.find((d) => d.rowId === r.id); return [`${r.brandName} / ${r.color}`, ...sizeSeries[p.sizeSeries].map((s) => d?.sizes[s] ?? 0), d ? Object.values(d.sizes).reduce((a, b) => a + b, 0) : 0]; })} /></Section>}
      {!closed && <div className="ws-tabs"><button className="button ws-secondary" onClick={() => setEditing(editing === 'sizes' ? '' : 'sizes')}>Beden Dağılımı {p.sizeDistributions.length ? 'Düzenle' : 'Gir'}</button><button className="button" onClick={() => setEditing(editing === 'stage' ? '' : 'stage')}>+ Üretim Aşaması Ekle</button><button className="button ws-secondary" onClick={() => setEditing(editing === 'complete' ? '' : 'complete')}>Üretimi Tamamla</button></div>}
      <Section title="Dikim / Ütü Paket"><Table headers={['Renk', 'Kesim Adet', ...[...new Set(p.productionStages.map((s) => s.processType))].filter((s) => s !== 'Kesim').map((s) => `${s} Adet`)]} rows={cutRows(p).map((r) => [r.color, r.quantity ?? 0, ...[...new Set(p.productionStages.map((s) => s.processType))].filter((s) => s !== 'Kesim').map((process) => p.productionStages.filter((s) => s.processType === process && s.rowId === r.id).reduce((sum, s) => sum + s.returnedQuantity, 0))])} /></Section>
      {!closed && editing === 'sizes' && <SizeEditor production={p} done={finish} />}
      {!closed && editing === 'stage' && <WorkflowStageForm production={p} contacts={contacts} done={finish} />}
      {!closed && editing === 'complete' && <WorkflowCompletionForm production={p} done={finish} />}
      {!closed && p.productionStages.filter((s) => s.id === editing).map((s) => <WorkflowReturnForm key={s.id} production={p} stage={s} done={finish} />)}
      <Section title="Üretim Aşamaları / Fason Hareketleri"><Table headers={['İşlem', 'Firma / Atölye', 'Marka / Renk', 'Gönderilen', 'Gelen', 'Kalan', 'Fiyat', 'Tutar', 'Gönderim', 'Dönüş', 'Durum', 'Not', 'İşlem']} rows={p.productionStages.map((s) => { const row = cutRows(p).find((r) => r.id === s.rowId); const oldCut = s.processType === 'Kesim'; return [s.processType, name(s.companyId), row ? `${row.brandName} / ${row.color}` : 'Genel / Eski kayıt', oldCut ? '—' : s.sentQuantity, oldCut ? '—' : s.returnedQuantity, oldCut ? '—' : stageRemainingQuantity(s), s.legacyLines ? s.legacyLines.map((l) => `${l.operation}: ${money(l.priceMinor)} (${l.priceType})`).join(' / ') : `${money(s.priceMinor)} (${s.priceType})`, money(workflowStageAmount(s)), s.sentDate, s.returnDate || '—', s.status, s.note, !closed && s.status !== 'Tamamlandı' ? <button className="button ws-secondary" onClick={() => setEditing(s.id)}>Gelen / Onayla</button> : '—']; })} /></Section>
    </>}
    {p.completion && <Section title={p.stockTransfer ? 'Tamamlandı / Stoğa Aktarıldı' : 'Üretim Tamamlandı — Stoğa Aktarım Bekliyor'}><p>Sağlam ürün: {p.completion.good} · Fire / Hatalı: {p.completion.waste} · Tamamlama: {p.completion.date}</p><p className="ws-hint">{p.completion.note}</p>{!!p.completion.lines.length && <Table headers={['Marka / Renk', 'Beden', 'Sağlam', 'Fire / Hatalı']} rows={p.completion.lines.map((l) => { const row = cutRows(p).find((r) => r.id === l.rowId); return [`${row?.brandName} / ${row?.color}`, l.size || 'Belirtilmemiş', l.good, l.waste]; })} />}{!p.stockTransfer ? <Action run={() => workflowRepository.transfer(p.id)} done={transferred}>Stoğa Aktar</Action> : <><p className="ws-hint">Stoğa aktarım: {p.stockTransfer.date}. Kaynak: Üretim.</p><div className="ws-tabs">{p.stockTransfer.stockIds.map((id, i) => <Link className="button ws-secondary" key={id} to={`/stok/urunler?islem=gecmis&id=${id}`}>Stok Kaydı {i + 1}</Link>)}</div></>}</Section>}
  </>;
}

function WorkflowSubcontracts({ records, contacts }: { records: ProductionRecord[]; contacts: Contact[] }) {
  const [company, setCompany] = useState(''); const [process, setProcess] = useState(''); const [production, setProduction] = useState(''); const [status, setStatus] = useState('');
  const all = subcontractRows(records); const rows = all.filter(({ production: p, stage: s }) => (!company || s.companyId === company) && (!process || s.processType === process || s.legacyLines?.some((l) => l.operation === process)) && (!production || p.id === production) && (!status || s.status === status));
  return <><div className="ws-filters"><Field label="Firma"><select value={company} onChange={(e) => setCompany(e.target.value)}><option value="">Tümü</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="İşlem"><select value={process} onChange={(e) => setProcess(e.target.value)}><option value="">Tümü</option>{[...new Set([...processes, ...all.map((r) => r.stage.processType)])].map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Üretim"><select value={production} onChange={(e) => setProduction(e.target.value)}><option value="">Tümü</option>{records.map((p) => <option key={p.id} value={p.id}>{p.productionNo} · {p.productName}</option>)}</select></Field><Field label="Durum"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tümü</option>{['İşlemde', 'Kısmi Geldi', 'Tamamlandı'].map((s) => <option key={s}>{s}</option>)}</select></Field></div>
    <Section title="Atölyelerde Bekleyen Ürünler"><Table headers={['Firma / Atölye', 'İşlem', 'Beklenen Adet']} rows={[...new Set(rows.map((r) => `${r.stage.companyId}|${r.stage.processType}`))].map((key) => { const matching = rows.filter((r) => `${r.stage.companyId}|${r.stage.processType}` === key); return [companyName(contacts, matching[0].stage.companyId), matching[0].stage.processType, matching.reduce((n, r) => n + r.remaining, 0)]; })} /></Section>
    <Table headers={['Firma / Atölye', 'Üretim No', 'Ürün', 'İşlem', 'Gönderilen', 'Gelen', 'Kalan', 'Tutar', 'Durum']} rows={rows.map(({ production: p, stage: s, remaining, total }) => [companyName(contacts, s.companyId), <Link to={detailHref(p)}>{p.productionNo}</Link>, p.productName, s.processType, s.processType === 'Kesim' ? '—' : s.sentQuantity, s.processType === 'Kesim' ? '—' : s.returnedQuantity, s.processType === 'Kesim' ? '—' : remaining, money(total), s.status])} />
    <p className="ws-hint">Bu ekran üretim aşamalarından oluşur. Geri gelen adetleri üretim kaydından güncelleyin. Eski kesim iş emirleri yalnızca geçmiş kayıt olarak korunur.</p>
  </>;
}
