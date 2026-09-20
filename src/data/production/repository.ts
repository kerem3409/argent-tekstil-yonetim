import { createStore } from '../shared/store.ts';
import type { StoragePort, StoreLock } from '../shared/store';
import type { ContactRepository } from '../contacts/repository';
import { checkDate, minor, quantity, requireText, uid } from '../../domain/common.ts';
import { operationTotals, operations, planQuantity, stageAmount, stageStatuses } from '../../domain/production.ts';
import type { PlanInput, ProductionStage, ProductionStore, StageInput } from '../../domain/production';

export function createProductionRepository(storage: () => StoragePort, contacts: Pick<ContactRepository, 'get'>, lock?: StoreLock, isCompleted: (jobId: string) => Promise<boolean> = async () => false) {
  const store = createStore<ProductionStore>('argent-tekstil.production.v1', () => ({ version: 1, plans: [], jobs: [], stages: [], nextPlan: 1, nextJob: 1, nextStage: 1 }), (value) => {
    const data = value as ProductionStore;
    if (!data || data.version !== 1 || !Array.isArray(data.plans) || !Array.isArray(data.jobs) || !Array.isArray(data.stages) || ![data.nextPlan, data.nextJob, data.nextStage].every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error();
    for (const p of data.plans) { requireText(p.name, 'Ürün'); if (!p.id || !Array.isArray(p.colors) || !p.colors.length) throw new Error(); quantity(planQuantity(p)); }
    for (const j of data.jobs) if (!data.plans.some((p) => p.id === j.planId)) throw new Error();
    if (new Set(data.jobs.map((j) => j.planId)).size !== data.jobs.length) throw new Error();
    for (const s of data.stages) { if (!data.jobs.some((j) => j.id === s.jobId) || !s.lines.length || !stageStatuses.includes(s.status)) throw new Error(); for (const line of s.lines) { quantity(line.quantity, 'Adet', true); quantity(line.returned, 'Gelen', true, true); if (line.returned > line.quantity || !operations.includes(line.operation) || !Number.isSafeInteger(line.priceMinor) || line.priceMinor < 0) throw new Error(); } }
  }, storage, lock);
  async function writable(jobId: string) { if (await isCompleted(jobId)) throw new Error('Tamamlanan üretim değiştirilemez.'); }
  function statusCheck(input: { status: ProductionStage['status']; lines: { quantity: number; returned: number }[] }) {
    if (!stageStatuses.includes(input.status)) throw new Error('Geçerli durum seçin.');
    const all = input.lines.every((line) => line.returned === line.quantity); const any = input.lines.some((line) => line.returned > 0);
    if (input.status === 'Tamamlandı' && !all) throw new Error('Tamamlamak için her işlemin geri gelen adedi verilen adede eşit olmalıdır.');
    if (input.status === 'Kısmi Geldi' && (!any || all)) throw new Error('Kısmi Geldi için bazı adetler dönmüş, bazıları dışarıda olmalıdır.');
    if (['Bekliyor', 'İşlemde'].includes(input.status) && any) throw new Error('Geri gelen adet varsa Kısmi Geldi veya Tamamlandı seçin.');
  }
  return {
    load: store.load,
    async createPlan(input: PlanInput) {
      requireText(input.name, 'Ürün'); checkDate(input.startDate); if (input.deliveryDate) { checkDate(input.deliveryDate); if (input.deliveryDate < input.startDate) throw new Error('Teslim tarihi başlangıçtan önce olamaz.'); }
      quantity(input.total, 'Planlanan toplam adet', true); if (!input.colors.length) throw new Error('Renk dağılımı girin.');
      input.colors.forEach((c) => { requireText(c.color, 'Renk'); quantity(c.quantity, 'Renk adedi', true); });
      if (input.colors.reduce((s, c) => s + c.quantity, 0) !== input.total) throw new Error('Renk adetleri planlanan toplam adede eşit olmalıdır.');
      if (new Set(input.colors.map((c) => c.color.trim().toLocaleLowerCase('tr'))).size !== input.colors.length) throw new Error('Aynı rengi tek satırda girin.');
      if (!['Planlandı', 'Beklemede', 'İptal'].includes(input.status)) throw new Error('Plan durumu seçin.');
      return store.transact((data) => { const plan = { id: uid(), number: `PL-${String(data.nextPlan++).padStart(4, '0')}`, productId: uid(), name: input.name.trim(), brand: input.brand.trim(), colors: input.colors.map((c) => ({ ...c, id: uid() })), startDate: input.startDate, deliveryDate: input.deliveryDate, note: input.note, status: input.status }; data.plans.push(plan); return plan; });
    },
    async setPlanStatus(id: string, status: PlanInput['status']) { if (!['Planlandı', 'Beklemede', 'İptal'].includes(status)) throw new Error('Durum seçin.'); return store.transact((data) => { if (data.jobs.some((j) => j.planId === id)) throw new Error('Başlatılmış plan değiştirilemez.'); const plan = data.plans.find((p) => p.id === id); if (!plan) throw new Error('Plan bulunamadı.'); plan.status = status; }); },
    async startPlan(id: string, date: string) {
      checkDate(date); return store.transact((data) => { const existing = data.jobs.find((j) => j.planId === id); if (existing) return existing; const plan = data.plans.find((p) => p.id === id); if (!plan || plan.status !== 'Planlandı') throw new Error('Başlatılabilir plan seçin.'); const job = { id: uid(), number: `IS-${String(data.nextJob++).padStart(4, '0')}`, planId: id, startDate: date }; data.jobs.push(job); return job; });
    },
    async addStage(input: StageInput) {
      checkDate(input.date); if (!input.lines.length) throw new Error('En az bir işlem seçin.');
      if (new Set(input.lines.map((l) => l.operation)).size !== input.lines.length) throw new Error('Aynı işlem bir aşamada bir kez seçilebilir.');
      input.lines.forEach((line) => { if (!operations.includes(line.operation) || !['Adet Fiyatı', 'Toplam Fiyat'].includes(line.priceType)) throw new Error('İşlem ve fiyat türü seçin.'); quantity(line.quantity, 'Verilen adet', true); quantity(line.returned, 'Geri gelen', true, true); if (line.returned > line.quantity) throw new Error('Geri gelen adet verilenden fazla olamaz.'); minor(line.price); }); statusCheck(input);
      if (input.companyId && (await contacts.get(input.companyId))?.status !== 'Aktif') throw new Error('Aktif firma seçin.');
      return store.transact(async (data) => { await writable(input.jobId); const job = data.jobs.find((j) => j.id === input.jobId); if (!job) throw new Error('İş kartı bulunamadı.'); if (input.date < job.startDate) throw new Error('Veriliş tarihi iş başlangıcından önce olamaz.'); const totals = operationTotals(data, input.jobId);
        for (const line of input.lines) { const remaining = totals.find((t) => t.operation === line.operation)!.remaining; if (line.quantity > remaining) throw new Error(`${line.operation} için en fazla ${remaining} adet daha verilebilir.`); }
        const stage: ProductionStage = { id: uid(), number: `${input.companyId ? 'FS' : 'AS'}-${String(data.nextStage++).padStart(4, '0')}`, jobId: input.jobId, companyId: input.companyId, lines: input.lines.map((l) => ({ operation: l.operation, quantity: l.quantity, returned: l.returned, priceType: l.priceType, priceMinor: minor(l.price) })), date: input.date, status: input.status, note: input.note, approvedDate: input.status === 'Tamamlandı' ? input.date : '' };
        if (!Number.isSafeInteger(stageAmount(stage))) throw new Error('İşlem tutarı sınırı aşıldı.'); data.stages.push(stage); return stage;
      });
    },
    async receiveStage(id: string, returned: number[], status: ProductionStage['status'], date: string) {
      checkDate(date); return store.transact(async (data) => { const stage = data.stages.find((s) => s.id === id); if (!stage) throw new Error('Aşama bulunamadı.'); await writable(stage.jobId); if (stage.status === 'Tamamlandı') throw new Error('Onaylanmış iş emri değiştirilemez.'); if (date < stage.date) throw new Error('Dönüş tarihi verilişten önce olamaz.'); if (returned.length !== stage.lines.length) throw new Error('Tüm işlemler için geri gelen adet girin.'); const lines = stage.lines.map((line, i) => { quantity(returned[i], 'Geri gelen', true, true); if (returned[i] < line.returned || returned[i] > line.quantity) throw new Error('Geri gelen adet önceki değerden az, verilenden fazla olamaz.'); return { ...line, returned: returned[i] }; }); statusCheck({ status, lines }); stage.lines = lines; stage.status = status; stage.approvedDate = status === 'Tamamlandı' ? date : ''; });
    },
  };
}
