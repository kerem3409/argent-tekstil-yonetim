import type { OpenResponsible, Sale } from '../../domain/sales';
export const entryTypes = ['Hazır Ürün Alımı', 'Üretimden Gelen', 'İade', 'Sayım / Stok Düzeltme', 'Diğer'] as const;
export type EntryType = typeof entryTypes[number];
export type AccountAction = 'Borç oluştur' | 'Alacaktan mahsup et';
export const procurement: Record<EntryType, string> = {
  'Hazır Ürün Alımı': 'Hazır Alım', 'Üretimden Gelen': 'Üretim', 'İade': 'İade',
  'Sayım / Stok Düzeltme': 'Stok Düzeltme', 'Diğer': 'Diğer',
};

export interface StockInput {
  // Eski tek renkli çağrılar desteklenir; yeni form renk dağılımı gönderir.
  colors?: { color: string; quantity: number }[];
  productDefinitionId?: string;
  entryType: EntryType;
  name: string; brand: string; detail: string; fabric: string; grammage: string;
  existingBatch: string;
  color: string; series: string; assortment: string;
  packSize: number; packCount: number; quantityMode: 'automatic' | 'manual'; quantity: number;
  unitCost: number; date: string; note: string; supplierId: string;
  postAccount: boolean; accountAction: AccountAction;
}
export interface StockRecord {
  productionNo?: string; productionRowId?: string; size?: string;
  productDefinitionId?: string;
  productId?: string; productionJobId?: string;
  id: string; batch: string; entryType: EntryType;
  name: string; brand: string; detail: string; fabric: string; grammage: string;
  color: string; series: string; assortment: string; packSize: number; initialPackCount: number;
  quantity: number; unitCostMinor: number; date: string; note: string; supplierId: string;
  status: 'Aktif' | 'Pasif'; createdAt: string;
}
export interface StockMovement {
  id: string; stockId: string; date: string; createdAt: string;
  type: EntryType | 'Satış'; incoming: number; outgoing: number; balance: number; description: string;
}
// Finans adaptörü bu hareketleri kaynak kimlikleriyle tekilleştirerek işleyebilir.
export interface PendingAccountMovement {
  id: string; source: 'product-stock'; stockId: string; movementId: string; contactId: string;
  type: AccountAction | 'Tedarikçiye iade'; effect: 'payable-increase' | 'receivable-decrease' | 'payable-decrease';
  amountMinor: number; currency: 'TRY'; date: string; description: string; status: 'pending';
}
export interface ProductStore {
  version: 1; nextBatch: number; records: StockRecord[];
  movements: StockMovement[]; accountMovements: PendingAccountMovement[];
  productionReceipts?: ProductionReceipt[];
  sales?: Sale[]; openResponsibles?: OpenResponsible[];
}
export interface ProductionReceipt { jobId: string; stockIds: string[]; good: number; waste: number; date: string; note: string }
export interface ProductionReceiptInput { productDefinitionId?: string; productionNo?: string; fabric?: string; grammage?: string; sizeSeries?: string; jobId: string; productId: string; name: string; brand: string; colors: { color: string; quantity: number; brand?: string; size?: string; rowId?: string }[]; waste: number; date: string; note: string; unitCostMinor: number }
export interface AdjustmentInput { mode: 'total' | 'difference'; amount: number; date: string; description: string }
export interface ReturnInput { quantity: number; date: string; description: string; postAccount: boolean; supplierId: string }

export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function newStockInput(): StockInput {
  return { entryType: 'Hazır Ürün Alımı', name: '', brand: '', detail: '', fabric: '', grammage: '', existingBatch: '',
    color: '', series: '', assortment: '', packSize: 1, packCount: 1, quantityMode: 'automatic', quantity: 1,
    unitCost: 0, date: today(), note: '', supplierId: '', postAccount: false, accountAction: 'Borç oluştur' };
}
export const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000;
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const entryQuantity = (input: StockInput) => input.colors !== undefined ? input.colors.reduce((sum, row) => sum + row.quantity, 0) : input.quantityMode === 'automatic' ? input.packSize * input.packCount : input.quantity;
export function purchaseAmount(quantity: number, unitCostMinor: number) {
  const amount = quantity * unitCostMinor;
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Toplam tutar hesaplama sınırını aşıyor.');
  return amount;
}
export function validateStock(input: StockInput): string[] {
  const errors: string[] = [];
  if (!entryTypes.includes(input.entryType)) errors.push('Giriş türü seçin.');
  if (input.name.trim().length < 2 || input.name.length > 200) errors.push('Ürün adı 2–200 karakter olmalıdır.');
  if (input.colors !== undefined) {
    if (!input.colors.length) errors.push('En az bir renk ekleyin.');
    const names = new Set<string>();
    for (const [index, row] of input.colors.entries()) {
      const name = row.color.trim().toLocaleLowerCase('tr-TR');
      if (!name || row.color.length > 100) errors.push(`${index + 1}. satırda renk girin (en fazla 100 karakter).`);
      if (!validCount(row.quantity) || row.quantity < 1) errors.push(`${index + 1}. satırda adet pozitif tam sayı olmalıdır.`);
      if (name && names.has(name)) errors.push('Aynı renk aynı stok girişinde iki kez girilemez.');
      names.add(name);
    }
  } else if (!input.color.trim() || input.color.length > 100) errors.push('Renk girin (en fazla 100 karakter).');
  if (!validCount(input.packSize) || input.packSize < 1) errors.push('Paket içeriği pozitif bir tam sayı olmalıdır.');
  if (input.colors === undefined && !validCount(input.packCount)) errors.push('Paket sayısı sıfır veya pozitif bir tam sayı olmalıdır.');
  if ((input.colors === undefined && !['automatic', 'manual'].includes(input.quantityMode)) || !validCount(entryQuantity(input)) || entryQuantity(input) < 1) errors.push('Toplam adet pozitif bir tam sayı olmalıdır (en fazla 1 milyar).');
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0 || Math.abs(input.unitCost * 100 - Math.round(input.unitCost * 100)) > 0.00001) errors.push('Birim maliyet sıfır veya pozitif, en fazla 2 ondalıklı olmalıdır.');
  if (!validDate(input.date)) errors.push('Geçerli bir giriş tarihi girin.');
  if (input.postAccount && !input.supplierId) errors.push('Cari işlem için firma / tedarikçi seçin.');
  if (input.postAccount && !['Borç oluştur', 'Alacaktan mahsup et'].includes(input.accountAction)) errors.push('Cari işlem türünü seçin.');
  if (input.postAccount && input.unitCost <= 0) errors.push('Cari işlem için birim maliyet sıfırdan büyük olmalıdır.');
  for (const key of ['brand', 'fabric', 'grammage', 'series', 'assortment', 'detail', 'note'] as const) {
    if (input[key].length > (key === 'note' || key === 'detail' ? 2000 : 300)) errors.push('Metin alanlarından biri izin verilen uzunluğu aşıyor.');
  }
  try { purchaseAmount(entryQuantity(input), Math.round(input.unitCost * 100)); } catch { errors.push('Toplam alış tutarı hesaplama sınırını aşıyor.'); }
  return errors;
}
export const money = (minor: number) => (minor / 100).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
export const number = (value: number) => value.toLocaleString('tr-TR');
export const displayDate = (value: string) => value.split('-').reverse().join('.');

export function filterStock(records: StockRecord[], filters: { search: string; brand: string; batch: string; color: string; status: string }) {
  const query = filters.search.trim().toLocaleLowerCase('tr-TR');
  return records.filter((record) => [record.name, record.brand, record.batch, record.color, record.series, record.assortment].join(' ').toLocaleLowerCase('tr-TR').includes(query)
    && (!filters.brand || record.brand === filters.brand) && (!filters.batch || record.batch === filters.batch)
    && (!filters.color || record.color === filters.color) && (!filters.status || record.status === filters.status));
}
