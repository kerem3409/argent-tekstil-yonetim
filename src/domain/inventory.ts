import type { AccountChoice } from './common';
export const materialCategories = ['Ütü & Paket Malzemeleri', 'Etiket', 'Aksesuar', 'İplikler', 'Diğer Üretim Malzemeleri'] as const;
export const units = ['Adet', 'Kg', 'Metre', 'Top', 'Paket', 'Diğer'] as const;
export const machineStatuses = ['Aktif', 'Arızalı', 'Bakımda', 'Kullanım Dışı'] as const;
export interface Purchase { id: string; companyId: string; date: string; note: string; account: AccountChoice; purchaseMinor: number; active: boolean }
export interface FabricColor { id: string; color: string; rolls: number; kg: number }
export interface Fabric extends Purchase { name: string; grammage: string; content: string; width: string; lot: string; priceMinor: number; colors: FabricColor[] }
export interface FabricInput { name: string; grammage: string; content: string; width: string; lot: string; date: string; companyId: string; price: number; note: string; account: AccountChoice; colors: { color: string; rolls: number; kg: number }[] }
export interface Material extends Purchase { name: string; category: typeof materialCategories[number]; feature: string; quantity: number; unit: typeof units[number]; priceMinor: number }
export interface MaterialInput { name: string; category: Material['category']; feature: string; quantity: number; unit: Material['unit']; price: number; date: string; companyId: string; note: string; account: AccountChoice }
export interface Machine extends Purchase { name: string; type: string; model: string; quantity: number; status: typeof machineStatuses[number] }
export interface MachineInput { name: string; type: string; model: string; quantity: number; date: string; price: number; status: Machine['status']; companyId: string; note: string; account: AccountChoice }
export interface InventoryMovement { id: string; recordId: string; colorId?: string; date: string; type: 'Giriş' | 'Çıkış' | 'Sayım / Düzeltme' | 'İade'; incoming: number; outgoing: number; balance: number; rollDelta?: number; rollBalance?: number; description: string }
export interface InventoryStore<T> { version: 1; records: T[]; movements: InventoryMovement[] }
