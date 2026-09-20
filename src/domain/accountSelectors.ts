import type { WorkshopSnapshot } from '../data/reports/snapshot';
import type { AccountEntry } from './finance';
import { OPEN_ACCOUNT_ID } from './sales.ts';
import { stageAmount } from './production.ts';

export function accountName(data: WorkshopSnapshot, companyId: string, responsibleId = '') {
  return companyId === OPEN_ACCOUNT_ID ? `Açığa Satış / ${data.products?.openResponsibles?.find((p) => p.id === responsibleId)?.name ?? 'Sorumlu bulunamadı'}` : data.contacts.find((c) => c.id === companyId)?.name ?? 'Firma kaydı bulunamadı';
}
export function selectAccountEntries(data: WorkshopSnapshot): AccountEntry[] {
  const entries: AccountEntry[] = [];
  for (const item of data.products?.accountMovements ?? []) {
    const record = data.products?.records.find((r) => r.id === item.stockId);
    entries.push({ id: `product:${item.id}`, sourceId: item.stockId, source: item.type === 'Alacaktan mahsup et' ? 'Mahsup / Hazır Ürün Alımı' : item.type === 'Tedarikçiye iade' ? 'Ürün İadesi' : 'Hazır Ürün Alımı', companyId: item.contactId, responsibleId: '', date: item.date, description: item.description, deltaMinor: item.effect === 'payable-decrease' ? item.amountMinor : -item.amountMinor, href: `/stok/urunler?islem=gecmis&id=${item.stockId}`, stockId: item.stockId, productId: record?.productId ?? record?.id });
  }
  for (const [store, source, path] of [[data.fabrics, 'Kumaş Alımı', '/stok/kumaslar'], [data.materials, 'Malzeme Alımı', '/stok/malzemeler'], [data.machines, 'Makine Alımı', '/stok/makine-techizat']] as const) {
    for (const record of store?.records ?? []) if (record.account !== 'Hayır') entries.push({ id: `${source}:${record.id}`, sourceId: record.id, source: record.account === 'Alacaktan mahsup et' ? `Mahsup / ${source}` : source, companyId: record.companyId, responsibleId: '', date: record.date, description: `${record.name} · ${record.note}`, deltaMinor: -record.purchaseMinor, href: `${path}?kayit=${record.id}` });
  }
  for (const stage of data.production?.stages ?? []) if (stage.companyId && stage.status === 'Tamamlandı' && stageAmount(stage) > 0) {
    const job = data.production?.jobs.find((j) => j.id === stage.jobId); const plan = data.production?.plans.find((p) => p.id === job?.planId);
    entries.push({ id: `stage:${stage.id}`, sourceId: stage.id, source: 'Fason İş Emri', companyId: stage.companyId, responsibleId: '', date: stage.approvedDate, description: `${stage.number} · ${stage.lines.map((l) => l.operation).join(', ')} · ${stage.note}`, deltaMinor: -stageAmount(stage), href: `/uretim/devam-eden?is=${stage.jobId}`, productId: plan?.productId });
  }
  for (const sale of data.products?.sales ?? []) entries.push({ id: `sale:${sale.id}`, sourceId: sale.id, source: 'Satış', companyId: sale.companyId, responsibleId: sale.responsibleId, date: sale.date, description: `${sale.number} · ${sale.note}`, deltaMinor: sale.quantity * sale.unitPriceMinor, href: `/satislar?satis=${sale.id}`, stockId: sale.stockId, productId: data.products?.records.find((r) => r.id === sale.stockId)?.productId ?? sale.stockId });
  for (const payment of data.finance?.moneyMovements ?? []) entries.push({ id: `payment:${payment.id}`, sourceId: payment.id, source: payment.direction === 'paid' ? 'Yapılan Ödeme' : 'Alınan Ödeme', companyId: payment.companyId, responsibleId: payment.responsibleId, date: payment.date, description: payment.description, deltaMinor: payment.direction === 'paid' ? payment.amountMinor : -payment.amountMinor, href: `/finans/${payment.direction === 'paid' ? 'yapilan' : 'alinan'}-odemeler?hareket=${payment.id}` });
  for (const loan of data.finance?.manualDebts ?? []) entries.push({ id: `loan:${loan.id}`, sourceId: loan.id, source: loan.type, companyId: loan.companyId, responsibleId: '', date: loan.date, description: `${loan.source} · ${loan.description}`, deltaMinor: loan.type === 'Alınan Borç' ? -loan.amountMinor : loan.amountMinor, href: `/finans/${loan.type === 'Alınan Borç' ? 'borclar' : 'alacaklar'}?kaynak=${loan.id}` });
  for (const item of data.finance?.adjustments ?? []) entries.push({ id: `adjustment:${item.id}`, sourceId: item.id, source: item.type, companyId: item.companyId, responsibleId: item.responsibleId, date: item.date, description: item.description, deltaMinor: item.direction === 'Borç' ? -item.amountMinor : item.amountMinor, href: `/finans/cari-hesaplar?firma=${item.companyId}&sorumlu=${item.responsibleId}` });
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
