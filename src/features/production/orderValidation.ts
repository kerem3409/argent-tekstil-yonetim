import type { OrderType, ProductionOrderItem } from '../../domain/productionWorkflow';

export type DraftOrderItem = Omit<ProductionOrderItem, 'id' | 'productName' | 'totalQuantity'>;

export function validateOrderForm(form: FormData, items: DraftOrderItem[]): string[] {
  const errors: string[] = [];
  if (!String(form.get('orderName') ?? '').trim()) errors.push('Sipariş Adı');
  const orderType = String(form.get('orderType') ?? '') as OrderType;
  if (orderType === 'Ön Sipariş' && !String(form.get('customerId') ?? '').trim()) errors.push('Müşteri');
  if (!String(form.get('date') ?? '').trim()) errors.push('Sipariş Tarihi');
  if (!items.length) errors.push('En az bir sipariş kalemi (Ürün, Kumaş Adı, en az bir renk ve adet)');
  items.forEach((item, index) => {
    const prefix = items.length > 1 ? `${index + 1}. kalem: ` : '';
    if (!item.productDefinitionId.trim()) errors.push(`${prefix}Ürün Tanımı`);
    if (!item.modelName?.trim()) errors.push(`${prefix}Ürün Adı / Model Adı`);
    if (!item.fabricName.trim()) errors.push(`${prefix}Kumaş Adı`);
    if (!item.colorQuantities.length || item.colorQuantities.some((row) => !row.color.trim() || !Number.isSafeInteger(row.quantity) || row.quantity <= 0)) errors.push(`${prefix}En az bir renk ve adet (her satırda renk ve pozitif tam sayı adet)`);
  });
  return errors;
}
