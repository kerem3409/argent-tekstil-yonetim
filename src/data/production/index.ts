import { contactRepository } from '../contacts';
import { browserLock } from '../shared/store';
import { createProductionRepository } from './repository';
import { productRepository } from '../products';
export const productionRepository = createProductionRepository(() => window.localStorage, contactRepository, browserLock,
  async (jobId) => !!(await productRepository.load()).productionReceipts?.some((r) => r.jobId === jobId));
