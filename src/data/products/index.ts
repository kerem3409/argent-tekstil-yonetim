import { contactRepository } from '../contacts';
import { createProductRepository } from './localStorageRepository';
import type { ProductRepository } from './repository';
import { browserLock } from '../shared/store';

// Tek depolama belgesi stok, hareket ve geçici cari işlemi birlikte saklar.
// Web Locks, aynı adresin farklı sekmelerindeki stok yazımlarını sıraya alır.
export const productRepository: ProductRepository = createProductRepository(
  () => window.localStorage,
  contactRepository,
  (work) => browserLock('argent-products-write', work),
);
