import type { OrderDraft, ProductionOrderInput } from '../../domain/productionOrder';
import type { StoragePort } from '../shared/store';

export const DRAFT_KEY = 'argent-tekstil.order-drafts.v1';
export function createOrderDrafts(storage: () => StoragePort) {
  function list(): OrderDraft[] {
    const raw = storage().getItem(DRAFT_KEY); if (!raw) return [];
    try { const data = JSON.parse(raw); if (!Array.isArray(data) || data.some((d) => !d.id || !Number.isInteger(d.revision) || !d.input?.product || !Array.isArray(d.input.product.colors))) throw new Error(); return data; }
    catch { throw new Error('Taslaklar okunamadı. Mevcut taslak verileri korunuyor.'); }
  }
  return { list,
    save(id: string, revision: number, input: ProductionOrderInput) {
      const data = list(), previous = data.find((d) => d.id === id);
      if ((previous?.revision ?? 0) !== revision) throw new Error('Taslak başka sekmede değişti. Sayfayı yenileyin.');
      const draft = { id, revision: revision + 1, input: structuredClone(input), updatedAt: new Date().toISOString() };
      try { storage().setItem(DRAFT_KEY, JSON.stringify([...data.filter((d) => d.id !== id), draft])); }
      catch { throw new Error('Taslak kaydedilemedi. Bu sayfadan ayrılmadan depolama alanını kontrol edin.'); }
      return draft;
    },
  };
}
export const orderDrafts = createOrderDrafts(() => window.localStorage);
