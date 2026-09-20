import { createCompletionService } from './completion';
import { productionRepository } from './index';
import { productRepository } from '../products';
import { browserLock } from '../shared/store';
export const completeProduction = createCompletionService(productionRepository, productRepository, browserLock);
