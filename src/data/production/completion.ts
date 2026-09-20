import type { ProductRepository } from '../products/repository';
import type { ProductionStore } from '../../domain/production';
import type { StoreLock } from '../shared/store';
import { checkDate, quantity } from '../../domain/common.ts';
import { planQuantity, stageAmount } from '../../domain/production.ts';

export function createCompletionService(production: { load(): Promise<ProductionStore> }, products: ProductRepository, lock: StoreLock = (_key, work) => work()) {
  return async (jobId: string, colors: { colorId: string; good: number }[], waste: number, date: string, note: string) => lock('argent-tekstil.production.v1', async () => {
    const data = await production.load(); const job = data.jobs.find((j) => j.id === jobId); const plan = data.plans.find((p) => p.id === job?.planId);
    if (!job || !plan) throw new Error('İş kartı bulunamadı.');
    const existing = (await products.load()).productionReceipts?.find((r) => r.jobId === jobId); if (existing) return existing;
    const stages = data.stages.filter((s) => s.jobId === jobId);
    if (stages.some((s) => s.status !== 'Tamamlandı')) throw new Error('Önce tüm üretim aşamalarını tamamlayıp onaylayın.');
    checkDate(date); if (date < job.startDate || stages.some((s) => date < s.approvedDate)) throw new Error('Tamamlama tarihi iş başlangıcından veya aşama onayından önce olamaz.');
    quantity(waste, 'Fire / Hatalı adet', true, true);
    if (colors.length !== plan.colors.length || new Set(colors.map((c) => c.colorId)).size !== colors.length) throw new Error('Her renk için sağlam adedi girin.');
    const entries = colors.map((c) => { const planned = plan.colors.find((p) => p.id === c.colorId); quantity(c.good, 'Sağlam adet', true, true); if (!planned || c.good > planned.quantity) throw new Error('Renk bazında sağlam adet planlanandan fazla olamaz.'); return { color: planned.color, quantity: c.good }; });
    const good = entries.reduce((sum, c) => sum + c.quantity, 0); if (good + waste !== planQuantity(plan)) throw new Error('Sağlam ürün + fire / hatalı adet, toplam iş adedine eşit olmalıdır.');
    const totalCost = stages.reduce((sum, s) => sum + stageAmount(s), 0);
    return products.receiveProduction({ jobId, productId: plan.productId, name: plan.name, brand: plan.brand, colors: entries, waste, date, note, unitCostMinor: good ? Math.round(totalCost / good) : 0 });
  });
}
