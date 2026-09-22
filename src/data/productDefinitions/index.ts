import { browserLock } from '../shared/store';
import { createProductDefinitionRepository } from './repository';
export const productDefinitionRepository = createProductDefinitionRepository(() => window.localStorage, browserLock);
