import { contactRepository } from '../contacts';
import { productRepository } from '../products';
import { inventory } from '../inventory';
import { productionRepository } from '../production';
import { financeRepository } from '../finance';
import type { Contact } from '../../features/contacts/model';
import type { ProductStore } from '../../features/products/model';
import type { Fabric, Material, Machine, InventoryStore } from '../../domain/inventory';
import type { ProductionStore } from '../../domain/production';
import type { FinanceStore } from '../../domain/finance';
export interface WorkshopSnapshot { contacts: Contact[]; products?: ProductStore; fabrics?: InventoryStore<Fabric>; materials?: InventoryStore<Material>; machines?: InventoryStore<Machine>; production?: ProductionStore; finance?: FinanceStore; errors: string[] }
export async function loadSnapshot(): Promise<WorkshopSnapshot> {
  const results = await Promise.allSettled([contactRepository.list(), productRepository.load(), inventory.fabrics.load(), inventory.materials.load(), inventory.machines.load(), productionRepository.load(), financeRepository.load()] as const);
  const labels = ['Firma / Kişiler', 'Ürün Stokları', 'Kumaş Stokları', 'Malzeme Stokları', 'Makineler', 'Üretim', 'Finans'];
  return { contacts: results[0].status === 'fulfilled' ? results[0].value : [], products: results[1].status === 'fulfilled' ? results[1].value : undefined, fabrics: results[2].status === 'fulfilled' ? results[2].value : undefined, materials: results[3].status === 'fulfilled' ? results[3].value : undefined, machines: results[4].status === 'fulfilled' ? results[4].value : undefined, production: results[5].status === 'fulfilled' ? results[5].value : undefined, finance: results[6].status === 'fulfilled' ? results[6].value : undefined, errors: results.flatMap((result, i) => result.status === 'rejected' ? [`${labels[i]}: ${result.reason instanceof Error ? result.reason.message : 'Okunamadı'}`] : []) };
}
