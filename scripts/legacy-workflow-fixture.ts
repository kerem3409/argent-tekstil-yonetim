import type { WorkflowRepository, OrderInput } from '../src/data/production/workflowRepository';
import { PRODUCTION_STORAGE_KEY } from '../src/data/production/workflowRepository.ts';
import type { StoragePort } from '../src/data/shared/store';
/** Existing regression cases exercise pre-v2 stored documents, not the new entry route. */
export function legacyOrderFixture(repo: WorkflowRepository, storage: StoragePort): WorkflowRepository {
  return { ...repo, async createOrder(input: OrderInput) {
    const created = await repo.createOrder({ orderName: 'Eski sipariş test kaydı', ...input });
    const data = JSON.parse(storage.getItem(PRODUCTION_STORAGE_KEY)!);
    const stored = data.orderCards.find((o: { id: string }) => o.id === created.id);
    delete stored.workflowVersion;
    storage.setItem(PRODUCTION_STORAGE_KEY, JSON.stringify(data));
    delete created.workflowVersion;
    return created;
  } };
}
