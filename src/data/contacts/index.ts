import { createLocalStorageContactRepository } from './localStorageRepository';
import type { ContactRepository } from './repository';

// Veri kaynağı değiştiğinde yalnızca bu adaptör seçimi değiştirilir.
export const contactRepository: ContactRepository = createLocalStorageContactRepository(() => window.localStorage);
