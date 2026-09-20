import { contactRepository } from '../contacts';
import { productRepository } from '../products';
import { browserLock } from '../shared/store';
import { createFinanceRepository } from './repository';
export const financeRepository = createFinanceRepository(() => window.localStorage, contactRepository,
  async (id) => !!(await productRepository.load()).openResponsibles?.some((p) => p.id === id), browserLock);
