import type { WorkshopSnapshot } from '../data/reports/snapshot';
import { accountName, selectAccountEntries } from './accountSelectors.ts';
import { accountBalances } from './finance.ts';
import { planQuantity, stageAmount, stageGiven, stageRemaining } from './production.ts';
import { displayDate, money, number } from '../features/products/model.ts';
export interface ReportFilters { from: string; to: string; companyId: string; responsibleId: string; productId: string; batch: string; operation: string }
export const emptyFilters: ReportFilters = { from: '', to: '', companyId: '', responsibleId: '', productId: '', batch: '', operation: '' };
export interface ReportTable { title: string; headers: string[]; rows: (string | number)[][] }
const during = (date: string, f: ReportFilters) => (!f.from || date >= f.from) && (!f.to || date <= f.to);
const byCompany = (id: string, f: ReportFilters) => !f.companyId || id === f.companyId;
function group(rows: { key: string; name: string; quantity: number; total?: number }[]) {
  const result = new Map<string, { name: string; quantity: number; total: number }>();
  for (const row of rows) { const item = result.get(row.key) ?? { name: row.name, quantity: 0, total: 0 }; item.quantity += row.quantity; item.total += row.total ?? 0; result.set(row.key, item); }
  return [...result.values()];
}
export function stockReport(data: WorkshopSnapshot, f: ReportFilters): ReportTable[] {
  const stock = (data.products?.records ?? []).filter((r) => byCompany(r.supplierId, f) && (!f.productId || (r.productId ?? r.id) === f.productId) && (!f.batch || r.batch === f.batch) && (!f.to || r.date <= f.to));
  const rows = stock.map((r) => { const movements = (data.products?.movements ?? []).filter((m) => m.stockId === r.id && (!f.to || m.date <= f.to)); const balance = movements.reduce((sum, m) => sum + m.incoming - m.outgoing, 0); const period = movements.filter((m) => during(m.date, f)); return { r, balance, incoming: period.reduce((s, m) => s + m.incoming, 0), outgoing: period.reduce((s, m) => s + m.outgoing, 0) }; });
  const tables: ReportTable[] = [{ title: `Ürün Stokları · ${number(rows.reduce((s, r) => s + r.balance, 0))} adet`, headers: ['Ürün', 'Parti', 'Renk', 'Seri', 'Asorti', 'Dönem Giriş', 'Dönem Çıkış', 'Kalan Adet', 'Durum'], rows: rows.map(({ r, balance, incoming, outgoing }) => [r.name, r.batch, r.color, r.series || '—', r.assortment || '—', incoming, outgoing, balance, r.status]) }];
  for (const type of ['Ürün', 'Parti', 'Renk', 'Seri / Asorti'] as const) {
    const grouped = group(rows.map(({ r, balance }) => ({ key: type === 'Ürün' ? r.productId ?? r.id : type === 'Parti' ? r.batch : type === 'Renk' ? r.color : `${r.series}|${r.assortment}`, name: type === 'Ürün' ? r.name : type === 'Parti' ? r.batch : type === 'Renk' ? r.color : `${r.series || '—'} / ${r.assortment || '—'}`, quantity: balance })));
    tables.push({ title: `${type} Bazında`, headers: [type, 'Adet'], rows: grouped.map((g) => [g.name, number(g.quantity)]) });
  }
  const fabrics = (data.fabrics?.records ?? []).filter((r) => byCompany(r.companyId, f) && (!f.to || r.date <= f.to));
  let kg = 0; let rolls = 0;
  const fabricRows = fabrics.flatMap((r) => r.colors.map((c) => { const ms = (data.fabrics?.movements ?? []).filter((m) => m.recordId === r.id && m.colorId === c.id && (!f.to || m.date <= f.to)); const balance = ms.reduce((s, m) => s + m.incoming - m.outgoing, 0); const top = ms.reduce((s, m) => s + (m.rollDelta ?? 0), 0); kg += balance; rolls += top; return [r.name, r.lot, c.color, number(top), number(balance)]; }));
  tables.push({ title: `Kumaşlar · ${number(rolls)} top / ${number(kg)} kg`, headers: ['Kumaş', 'Lot / Parti', 'Renk', 'Top', 'Kg'], rows: fabricRows });
  tables.push({ title: 'Malzeme Stokları', headers: ['Malzeme', 'Kategori', 'Miktar', 'Birim'], rows: (data.materials?.records ?? []).filter((r) => byCompany(r.companyId, f) && (!f.to || r.date <= f.to)).map((r) => [r.name, r.category, number((data.materials?.movements ?? []).filter((m) => m.recordId === r.id && (!f.to || m.date <= f.to)).reduce((s, m) => s + m.incoming - m.outgoing, 0)), r.unit]) });
  return tables;
}
export function productionReport(data: WorkshopSnapshot, f: ReportFilters): ReportTable[] {
  const production = data.production;
  const selectedJobs = (production?.jobs ?? []).filter((j) => { const plan = production?.plans.find((p) => p.id === j.planId); return (!f.productId || plan?.productId === f.productId) && (!f.batch || j.number === f.batch) && (!f.companyId || production?.stages.some((s) => s.jobId === j.id && s.companyId === f.companyId)) && (!f.operation || production?.stages.some((s) => s.jobId === j.id && s.lines.some((l) => l.operation === f.operation))); });
  const receipts = (data.products?.productionReceipts ?? []).filter((r) => during(r.date, f));
  const stages = (production?.stages ?? []).filter((s) => selectedJobs.some((j) => j.id === s.jobId) && byCompany(s.companyId, f) && (!f.operation || s.lines.some((l) => l.operation === f.operation)) && during(s.date, f));
  const outside = stages.filter((s) => s.companyId && s.status !== 'Tamamlandı');
  return [
    { title: 'Üretim İşleri', headers: ['İş Kartı', 'Ürün', 'Adet', 'Başlangıç', 'Durum', 'Aşamalar'], rows: selectedJobs.filter((j) => during(j.startDate, f)).map((j) => { const plan = production!.plans.find((p) => p.id === j.planId)!; return [j.number, plan.name, planQuantity(plan), displayDate(j.startDate), data.products?.productionReceipts?.some((r) => r.jobId === j.id) ? 'Tamamlandı' : 'Üretimde', production!.stages.filter((s) => s.jobId === j.id).map((s) => `${s.lines.map((l) => l.operation).join('/')} (${s.status})`).join(', ')]; }) },
    { title: 'Fasoncularda Bulunan İşler', headers: ['Firma', 'İş Kartı', 'İşlemler', 'Verilen', 'Geri Gelen', 'Dışarıda', 'Tutar'], rows: outside.map((s) => [accountName(data, s.companyId), production!.jobs.find((j) => j.id === s.jobId)!.number, s.lines.map((l) => l.operation).join('/'), stageGiven(s), stageGiven(s) - stageRemaining(s), stageRemaining(s), money(stageAmount(s))]) },
    { title: 'Fasoncu Bazında Dışarıdaki Adet', headers: ['Fasoncu', 'Adet'], rows: group(outside.map((s) => ({ key: s.companyId, name: accountName(data, s.companyId), quantity: stageRemaining(s) }))).map((g) => [g.name, g.quantity]) },
    { title: 'Tamamlanan Üretimler', headers: ['İş Kartı', 'Ürün', 'Tarih', 'Sağlam', 'Fire / Hatalı', 'Not'], rows: receipts.filter((r) => selectedJobs.some((j) => j.id === r.jobId)).map((r) => { const j = selectedJobs.find((j) => j.id === r.jobId)!; return [j.number, production!.plans.find((p) => p.id === j.planId)!.name, displayDate(r.date), r.good, r.waste, r.note]; }) },
  ];
}
export function salesReport(data: WorkshopSnapshot, f: ReportFilters): ReportTable[] {
  const sales = (data.products?.sales ?? []).filter((s) => { const stock = data.products!.records.find((r) => r.id === s.stockId); return during(s.date, f) && byCompany(s.companyId, f) && (!f.responsibleId || s.responsibleId === f.responsibleId) && (!f.productId || (stock?.productId ?? stock?.id) === f.productId) && (!f.batch || stock?.batch === f.batch); });
  const companies = group(sales.map((s) => ({ key: `${s.companyId}|${s.responsibleId}`, name: accountName(data, s.companyId, s.responsibleId), quantity: s.quantity, total: s.quantity * s.unitPriceMinor })));
  const products = group(sales.map((s) => { const r = data.products!.records.find((r) => r.id === s.stockId)!; return { key: r.productId ?? r.id, name: r.name, quantity: s.quantity, total: s.quantity * s.unitPriceMinor }; }));
  return [
    { title: `Satışlar · ${number(sales.reduce((sum, s) => sum + s.quantity, 0))} adet / ${money(sales.reduce((sum, s) => sum + s.quantity * s.unitPriceMinor, 0))}`, headers: ['Tarih', 'Satış No', 'Firma', 'Ürün', 'Parti', 'Renk', 'Adet', 'Toplam'], rows: sales.map((s) => { const r = data.products!.records.find((r) => r.id === s.stockId)!; return [displayDate(s.date), s.number, accountName(data, s.companyId, s.responsibleId), r.name, r.batch, r.color, s.quantity, money(s.quantity * s.unitPriceMinor)]; }) },
    { title: 'Firma Bazında Satış', headers: ['Firma', 'Adet', 'Satış Tutarı'], rows: companies.map((g) => [g.name, g.quantity, money(g.total)]) },
    { title: 'Ürün Bazında Satış', headers: ['Ürün', 'Adet', 'Satış Tutarı'], rows: products.map((g) => [g.name, g.quantity, money(g.total)]) },
  ];
}
export function financeReport(data: WorkshopSnapshot, f: ReportFilters, accountOnly = false): ReportTable[] {
  const allEntries = selectAccountEntries(data).filter((e) => byCompany(e.companyId, f) && (!f.responsibleId || e.responsibleId === f.responsibleId) && (!f.to || e.date <= f.to));
  const entries = allEntries.filter((e) => during(e.date, f)); const balances = accountBalances(allEntries);
  const totalDebt = balances.reduce((sum, b) => sum + Math.max(-b.balance, 0), 0); const totalReceivable = balances.reduce((sum, b) => sum + Math.max(b.balance, 0), 0);
  const opening = f.from ? allEntries.filter((e) => e.date < f.from).reduce((s, e) => s + e.deltaMinor, 0) : 0;
  const tables: ReportTable[] = [{ title: `Dönem Sonu · Borç ${money(totalDebt)} / Alacak ${money(totalReceivable)}`, headers: ['Firma', 'Borç', 'Alacak'], rows: balances.map((b) => [accountName(data, b.companyId, b.responsibleId), money(Math.max(-b.balance, 0)), money(Math.max(b.balance, 0))]) }];
  if (accountOnly) {
    let balance = opening;
    tables.push({ title: `Cari Hareketler · Açılış: ${money(Math.abs(opening))} ${opening < 0 ? 'Borç' : 'Alacak'}`, headers: ['Tarih', 'Kaynak', 'Kaynak ID', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'], rows: entries.map((e) => { balance += e.deltaMinor; return [displayDate(e.date), e.source, e.sourceId, e.description, money(Math.max(-e.deltaMinor, 0)), money(Math.max(e.deltaMinor, 0)), `${money(Math.abs(balance))} ${balance < 0 ? 'Borç' : 'Alacak'}`]; }) });
    return tables;
  }
  for (const direction of ['paid', 'received'] as const) {
    const payments = (data.finance?.moneyMovements ?? []).filter((p) => p.direction === direction && during(p.date, f) && byCompany(p.companyId, f) && (!f.responsibleId || p.responsibleId === f.responsibleId));
    tables.push({ title: `${direction === 'paid' ? 'Yapılan Ödemeler' : 'Alınan Ödemeler'} · ${money(payments.reduce((s, p) => s + p.amountMinor, 0))}`, headers: ['Tarih', 'Firma', 'Tutar', 'Ödeme Şekli', 'Açıklama'], rows: payments.map((p) => [displayDate(p.date), accountName(data, p.companyId, p.responsibleId), money(p.amountMinor), p.method, p.description]) });
  }
  const expenses = (data.finance?.expenses ?? []).filter((e) => during(e.date, f) && byCompany(e.companyId, f));
  tables.push({ title: `Genel Giderler · ${money(expenses.reduce((s, e) => s + e.amountMinor, 0))}`, headers: ['Tarih', 'Gider Türü', 'Açıklama', 'Tutar'], rows: expenses.map((e) => [displayDate(e.date), e.category, e.description, money(e.amountMinor)]) });
  return tables;
}
export function dashboardSummary(data: WorkshopSnapshot) {
  const balances = accountBalances(selectAccountEntries(data)); const completed = new Set(data.products?.productionReceipts?.map((r) => r.jobId) ?? []);
  return { stock: data.products?.records.filter((r) => r.status === 'Aktif').reduce((sum, r) => sum + r.quantity, 0) ?? 0, jobs: data.production?.jobs.filter((j) => !completed.has(j.id)).length ?? 0, subcontractJobs: data.production?.stages.filter((s) => s.companyId && s.status !== 'Tamamlandı').length ?? 0, receivable: balances.reduce((sum, b) => sum + Math.max(b.balance, 0), 0), debt: balances.reduce((sum, b) => sum + Math.max(-b.balance, 0), 0) };
}
