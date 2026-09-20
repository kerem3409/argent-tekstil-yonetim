import { contactRepository } from '../contacts';
import { browserLock } from '../shared/store';
import { createInventoryRepositories } from './repository';
export const inventory = createInventoryRepositories(() => window.localStorage, contactRepository, browserLock);
