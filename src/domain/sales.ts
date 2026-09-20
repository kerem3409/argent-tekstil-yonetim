export const OPEN_ACCOUNT_ID = 'system:open-sales';
export interface OpenResponsible { id: string; name: string }
export interface SaleInput { stockId: string; companyId: string; responsibleId: string; responsibleName: string; quantity: number; quantityType: 'Adet' | 'Paket'; price: number; date: string; note: string }
export interface Sale { id: string; number: string; stockId: string; movementId: string; companyId: string; responsibleId: string; quantity: number; unitCostMinor: number; unitPriceMinor: number; date: string; note: string; status: 'Tamamlandı' }
