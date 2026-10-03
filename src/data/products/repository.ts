import type { AdjustmentInput, ProductStore, ProductionReceipt, ProductionReceiptInput, ReturnInput, StockInput, StockRecord } from '../../features/products/model';
import type { Sale, SaleInput } from '../../domain/sales';

export interface ProductRepository {
  deletionPin: ReturnType<typeof import('../production/deletionPin').createDeletionPin>;
  trash(id: string, pin: string, expectedQuantity: number): Promise<void>;
  restore(id: string, deletedAt: string): Promise<void>;
  permanentlyDelete(id: string, pin: string, deletedAt: string): Promise<void>;
  load(): Promise<ProductStore>;
  sell(input: SaleInput): Promise<Sale>;
  receiveProduction(input: ProductionReceiptInput): Promise<ProductionReceipt>;
  // Renk dağılımını tek işlemde kaydeder; detay yönlendirmesi için ilk satırı döndürür.
  create(input: StockInput): Promise<StockRecord>;
  adjust(id: string, input: AdjustmentInput): Promise<void>;
  returnStock(id: string, input: ReturnInput): Promise<void>;
  receiveReturn(id: string, input: { quantity: number; saleId: string; date: string; description: string }): Promise<void>;
  setStatus(id: string, status: StockRecord['status']): Promise<void>;
}
