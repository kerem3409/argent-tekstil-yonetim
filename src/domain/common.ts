import { validDate } from '../features/products/model.ts';
export type AccountChoice = 'Hayır' | 'Borç oluştur' | 'Alacaktan mahsup et';
export const paymentMethods = ['Nakit', 'Banka', 'Diğer'] as const;
export type PaymentMethod = typeof paymentMethods[number];
export function requireText(value: string, name: string, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} zorunludur; en fazla ${max} karakter girin.`);
}
export function checkDate(value: string) { if (!validDate(value)) throw new Error('Geçerli bir tarih girin.'); }
export function quantity(value: number, name = 'Miktar', integer = false, zero = false) {
  if (!Number.isFinite(value) || value < (zero ? 0 : 0.001) || value > 1e9 || (integer && !Number.isInteger(value)) || Math.abs(value * 1000 - Math.round(value * 1000)) > 0.0001) throw new Error(`${name} ${zero ? 'sıfır veya ' : ''}pozitif ${integer ? 'tam sayı' : 'en fazla 3 ondalıklı sayı'} olmalıdır.`);
}
export function minor(value: number, zero = true) {
  if (!Number.isFinite(value) || value < 0 || (!zero && value === 0) || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001 || !Number.isSafeInteger(Math.round(value * 100))) throw new Error('Tutar geçerli, en fazla 2 ondalıklı bir sayı olmalıdır.');
  return Math.round(value * 100);
}
export function amount(quantity: number, priceMinor: number) {
  const total = Math.round(quantity * priceMinor);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Toplam tutar sınırı aşıldı.');
  return total;
}
export const rounded = (value: number) => Math.round(value * 1000) / 1000;
export function accountChoice(choice: AccountChoice, companyId: string, total: number) {
  if (!['Hayır', 'Borç oluştur', 'Alacaktan mahsup et'].includes(choice)) throw new Error('Cari işlem seçin.');
  if (choice !== 'Hayır' && (!companyId || total <= 0)) throw new Error('Cari işlem için firma ve sıfırdan büyük tutar gerekir.');
}
export const uid = () => crypto.randomUUID();
