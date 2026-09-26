import { productDefinitionRepository } from '../productDefinitions';
import { contactRepository } from '../contacts';
import { browserLock } from '../shared/store';
import { createProductionRepository } from './repository';
import { productRepository } from '../products';
import { inventory } from '../inventory';
import { createWorkflowRepository } from './workflowRepository';
import { createPlanRepository } from './planRepository';
export const planRepository = createPlanRepository(() => window.localStorage, { contacts: contactRepository, definitions: productDefinitionRepository, products: productRepository }, browserLock);
export const workflowRepository = createWorkflowRepository(() => window.localStorage, { contacts: contactRepository, definitions: productDefinitionRepository, products: productRepository, fabrics: inventory.fabrics }, browserLock);
export const productionRepository = createProductionRepository(() => window.localStorage, contactRepository, browserLock,
  async (jobId) => !!(await productRepository.load()).productionReceipts?.some((r) => r.jobId === jobId), productDefinitionRepository);
