import { entryQuantity, entryTypes, purchaseAmount, validCount, validDate, validateStock } from '../../features/products/model.ts';
import type { PendingAccountMovement, ProductStore, StockInput, StockMovement, StockRecord } from '../../features/products/model.ts';
import type { ContactRepository } from '../contacts/repository';
import type { ProductRepository } from './repository';
import { OPEN_ACCOUNT_ID } from '../../domain/sales.ts';
import { minor, requireText } from '../../domain/common.ts';

import { resolveDefinition } from '../productDefinitions/repository.ts';
import type { ProductDefinitionRepository } from '../productDefinitions/repository';

export const PRODUCTS_STORAGE_KEY = 'argent-tekstil.products.v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
type Lock = <T>(work: () => Promise<T>) => Promise<T>;

function assertStore(value: unknown): asserts value is ProductStore {
  const data = value as ProductStore;
  if (!data || data.version !== 1 || !Number.isSafeInteger(data.nextBatch) || data.nextBatch < 1 || !Array.isArray(data.records) || !Array.isArray(data.movements) || !Array.isArray(data.accountMovements)) throw new Error();
  const ids = new Set<string>();
  for (const record of data.records) {
    if (!record || ['id', 'batch', 'name', 'brand', 'detail', 'fabric', 'grammage', 'color', 'series', 'assortment', 'date', 'note', 'supplierId', 'createdAt'].some((key) => typeof record[key as keyof StockRecord] !== 'string')) throw new Error();
    if (!record.id || ids.has(record.id) || !/^P-\d{4,}$/.test(record.batch) || Number(record.batch.slice(2)) >= data.nextBatch || !record.name.trim() || !record.color.trim() || !validDate(record.date) || !validCount(record.quantity) || !validCount(record.packSize) || record.packSize < 1 || !validCount(record.initialPackCount) || !Number.isSafeInteger(record.unitCostMinor) || record.unitCostMinor < 0 || !['Aktif', 'Pasif'].includes(record.status) || !entryTypes.includes(record.entryType)) throw new Error();
    ids.add(record.id);
  }
  const balances = new Map<string, number>();
  const movements = new Map<string, StockMovement>();
  for (const movement of data.movements) {
    if (!movement || !movement.id || movements.has(movement.id) || !ids.has(movement.stockId) || !validDate(movement.date) || typeof movement.createdAt !== 'string' || typeof movement.description !== 'string' || ![...entryTypes, 'Satış'].includes(movement.type) || !validCount(movement.incoming) || !validCount(movement.outgoing) || (movement.incoming > 0) === (movement.outgoing > 0)) throw new Error();
    const balance = (balances.get(movement.stockId) ?? 0) + movement.incoming - movement.outgoing;
    if (!validCount(balance) || balance !== movement.balance) throw new Error();
    balances.set(movement.stockId, balance); movements.set(movement.id, movement);
  }
  for (const record of data.records) if (balances.get(record.id) !== record.quantity) throw new Error();
  if (data.productionReceipts) {
    if (!Array.isArray(data.productionReceipts) || new Set(data.productionReceipts.map((r) => r.jobId)).size !== data.productionReceipts.length) throw new Error();
    for (const receipt of data.productionReceipts) if (!receipt.jobId || !validCount(receipt.good) || !validCount(receipt.waste) || !validDate(receipt.date) || !Array.isArray(receipt.stockIds) || receipt.stockIds.some((id) => !ids.has(id))) throw new Error();
  }
  const ledgerIds = new Set<string>();
  if (data.sales) {
    if (!Array.isArray(data.sales) || new Set(data.sales.map((s) => s.id)).size !== data.sales.length) throw new Error();
    for (const sale of data.sales) if (!sale.id || !ids.has(sale.stockId) || movements.get(sale.movementId)?.type !== 'Satış' || movements.get(sale.movementId)?.outgoing !== sale.quantity || !validCount(sale.quantity) || sale.quantity < 1 || !Number.isSafeInteger(sale.unitPriceMinor) || sale.unitPriceMinor <= 0 || !sale.companyId || !validDate(sale.date)) throw new Error();
  }
  if (data.openResponsibles && (!Array.isArray(data.openResponsibles) || data.openResponsibles.some((p) => !p.id || !p.name))) throw new Error();
  const sourceIds = new Set<string>();
  const effects = { 'Borç oluştur': 'payable-increase', 'Alacaktan mahsup et': 'receivable-decrease', 'Tedarikçiye iade': 'payable-decrease' };
  for (const item of data.accountMovements) {
    const movement = movements.get(item?.movementId);
    if (!item || !item.id || ledgerIds.has(item.id) || sourceIds.has(item.movementId) || item.source !== 'product-stock' || !movement || movement.stockId !== item.stockId || typeof item.contactId !== 'string' || !item.contactId || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0 || item.currency !== 'TRY' || item.status !== 'pending' || !validDate(item.date) || typeof item.description !== 'string' || !Object.hasOwn(effects, item.type) || effects[item.type] !== item.effect) throw new Error();
    ledgerIds.add(item.id); sourceIds.add(item.movementId);
  }
}

export function createProductRepository(getStorage: () => StoragePort, contacts: Pick<ContactRepository, 'get'>, lock: Lock = (work) => work(), definitions?: ProductDefinitionRepository): ProductRepository {
  function read(): ProductStore {
    let raw: string | null;
    try { raw = getStorage().getItem(PRODUCTS_STORAGE_KEY); }
    catch { throw new Error('Ürün kayıtlarına erişilemiyor. Tarayıcı depolama iznini kontrol edin.'); }
    if (raw === null) return { version: 1, nextBatch: 1, records: [], movements: [], accountMovements: [] };
    try { const data: unknown = JSON.parse(raw); assertStore(data); return data; }
    catch { throw new Error('Saklanan ürün verileri okunamadı. Mevcut verilerin üzerine yazılmadı.'); }
  }
  function write(data: ProductStore) {
    assertStore(data);
    try { getStorage().setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(data)); }
    catch { throw new Error('İşlem kaydedilemedi. Depolama iznini ve boş alanı kontrol edin; stok ve cari hareket değiştirilmedi.'); }
  }
  async function supplier(id: string, required: boolean) {
    if (!id && !required) return;
    const contact = id ? await contacts.get(id) : null;
    if (!contact || contact.status !== 'Aktif') throw new Error('Aktif bir firma / tedarikçi seçin.');
  }
  function stock(data: ProductStore, id: string) {
    const record = data.records.find((item) => item.id === id);
    if (!record) throw new Error('Stok kaydı bulunamadı.');
    return record;
  }
  function movement(data: ProductStore, record: StockRecord, delta: number, date: string, type: StockMovement['type'], description: string) {
    if (!validDate(date)) throw new Error('Geçerli bir tarih girin.');
    const previous = data.movements.filter((item) => item.stockId === record.id).at(-1);
    if (previous && date < previous.date) throw new Error(`İşlem tarihi son stok hareketinden (${previous.date}) önce olamaz.`);
    if (!Number.isSafeInteger(delta) || delta === 0 || !validCount(record.quantity + delta)) throw new Error('Miktar tam sayı olmalı, stok eksiye düşmemeli ve 1 milyarı aşmamalıdır.');
    if (description.length > 2000) throw new Error('Açıklama en fazla 2000 karakter olmalıdır.');
    record.quantity += delta;
    const item: StockMovement = { id: crypto.randomUUID(), stockId: record.id, date, createdAt: new Date().toISOString(), type, incoming: Math.max(delta, 0), outgoing: Math.max(-delta, 0), balance: record.quantity, description: description.trim() };
    data.movements.push(item);
    return item;
  }
  function ledger(data: ProductStore, record: StockRecord, item: StockMovement, contactId: string, type: PendingAccountMovement['type'], amountMinor: number) {
    if (amountMinor <= 0) throw new Error('Cari hareket tutarı sıfırdan büyük olmalıdır.');
    data.accountMovements.push({ id: crypto.randomUUID(), source: 'product-stock', stockId: record.id, movementId: item.id, contactId, type,
      effect: type === 'Borç oluştur' ? 'payable-increase' : type === 'Alacaktan mahsup et' ? 'receivable-decrease' : 'payable-decrease',
      amountMinor, currency: 'TRY', date: item.date, description: item.description, status: 'pending' });
  }
  return {
    async load() { const data = read(); if (definitions) { const list = await definitions.list(); data.records = data.records.map((r) => resolveDefinition(r, list)); } return data; },
    async sell(input) {
      return lock(async () => {
        const open = input.companyId === OPEN_ACCOUNT_ID;
        if (!open) { const customer = await contacts.get(input.companyId); if (customer?.status !== 'Aktif' || !customer.roles.includes('Hazır Giyim Müşterisi')) throw new Error('Aktif Hazır Giyim Müşterisi seçin.'); }
        const data = read(); const record = stock(data, input.stockId);
        if (record.status !== 'Aktif') throw new Error('Pasif stoktan satış yapılamaz.');
        if (!['Adet', 'Paket'].includes(input.quantityType) || !validCount(input.quantity) || input.quantity < 1) throw new Error('Pozitif tam sayı adet / paket girin.');
        const qty = input.quantityType === 'Paket' ? input.quantity * record.packSize : input.quantity;
        if (!validCount(qty) || qty > record.quantity) throw new Error(`Stok yetersiz. En fazla ${record.quantity} adet satabilirsiniz.`);
        const unitPriceMinor = minor(input.price, false); purchaseAmount(qty, unitPriceMinor);
        let responsibleId = '';
        if (open) {
          if (input.responsibleId) { if (!data.openResponsibles?.some((p) => p.id === input.responsibleId)) throw new Error('Sorumlu kişi bulunamadı.'); responsibleId = input.responsibleId; }
          else { requireText(input.responsibleName, 'Sorumlu kişi', 200); const existing = data.openResponsibles?.find((p) => p.name.toLocaleLowerCase('tr') === input.responsibleName.trim().toLocaleLowerCase('tr')); responsibleId = existing?.id ?? crypto.randomUUID(); if (!existing) (data.openResponsibles ??= []).push({ id: responsibleId, name: input.responsibleName.trim() }); }
        }
        const number = `S-${String((data.sales?.length ?? 0) + 1).padStart(4, '0')}`;
        const item = movement(data, record, -qty, input.date, 'Satış', `${number} · ${input.note}`);
        const sale = { id: crypto.randomUUID(), number, stockId: record.id, movementId: item.id, companyId: input.companyId, responsibleId, quantity: qty, unitCostMinor: record.unitCostMinor, unitPriceMinor, date: input.date, note: input.note, status: 'Tamamlandı' as const };
        (data.sales ??= []).push(sale); write(data); return sale;
      });
    },
    async receiveProduction(input) {
      return lock(async () => {
        const data = read(); const existing = data.productionReceipts?.find((r) => r.jobId === input.jobId); if (existing) return existing;
        const good = input.colors.reduce((sum, c) => sum + c.quantity, 0);
        if (!input.jobId || !input.productId || !input.name.trim() || !validDate(input.date) || !validCount(input.waste) || !validCount(good) || input.colors.some((c) => !c.color.trim() || !validCount(c.quantity)) || !Number.isSafeInteger(input.unitCostMinor) || input.unitCostMinor < 0) throw new Error('Üretim aktarım bilgileri geçersiz.');
        const batch = `P-${String(data.nextBatch++).padStart(4, '0')}`; const stockIds: string[] = [];
        for (const color of input.colors.filter((c) => c.quantity > 0)) {
          const record: StockRecord = { id: crypto.randomUUID(), ...(input.productDefinitionId ? { productDefinitionId: input.productDefinitionId } : {}), productId: input.productId, productionJobId: input.jobId, ...(input.productionNo ? { productionNo: input.productionNo, productionRowId: color.rowId, size: color.size } : {}), batch, entryType: 'Üretimden Gelen', name: input.name, brand: color.brand ?? input.brand, detail: '', fabric: input.fabric ?? '', grammage: input.grammage ?? '', color: color.color, series: input.sizeSeries ?? '', assortment: color.size ?? '', packSize: 1, initialPackCount: color.quantity, quantity: 0, unitCostMinor: input.unitCostMinor, date: input.date, note: input.note, supplierId: '', status: 'Aktif', createdAt: new Date().toISOString() };
          data.records.push(record); stockIds.push(record.id); movement(data, record, color.quantity, input.date, 'Üretimden Gelen', `Üretim tamamlandı. ${input.note}`);
        }
        const receipt = { jobId: input.jobId, stockIds, good, waste: input.waste, date: input.date, note: input.note };
        (data.productionReceipts ??= []).push(receipt); write(data); return receipt;
      });
    },
    async create(input: StockInput) {
      return lock(async () => {
        await supplier(input.supplierId, input.postAccount);
        const definitionList = definitions ? await definitions.list() : [];
        if (definitions) {
          const definition = definitionList.find((d) => d.id === input.productDefinitionId && d.status === 'Aktif');
          if (!definition) throw new Error('Aktif bir ürün tanımı seçin.');
          input = { ...input, name: definition.name };
        }
        const errors = validateStock(input);
        if (errors.length) throw new Error(errors.join(' '));
        const data = read();
        let existing = input.existingBatch ? data.records.find((item) => item.batch === input.existingBatch) : undefined;
        if (input.existingBatch && !existing) throw new Error('Seçilen parti bulunamadı.');
        if (existing && definitions) existing = resolveDefinition(existing, definitionList);
        if (existing && ((existing.productDefinitionId ? existing.productDefinitionId !== input.productDefinitionId : existing.name !== input.name.trim()) || existing.brand !== input.brand.trim())) throw new Error('Aynı partide ürün adı ve marka aynı olmalıdır.');
        const batch = existing?.batch ?? `P-${String(data.nextBatch++).padStart(4, '0')}`;
        const productId = existing?.productId ?? existing?.id ?? crypto.randomUUID();
        const rows = input.colors ?? [{ color: input.color, quantity: entryQuantity(input) }];
        const created: StockRecord[] = [];
        for (const row of rows) {
          const record: StockRecord = { id: crypto.randomUUID(), ...(input.productDefinitionId ? { productDefinitionId: input.productDefinitionId } : {}), productId, batch, entryType: input.entryType,
            name: input.name.trim(), brand: input.brand.trim(), detail: input.detail.trim(), fabric: input.fabric.trim(), grammage: input.grammage.trim(),
            color: row.color.trim(), series: input.series.trim(), assortment: input.assortment.trim(), packSize: input.packSize,
            initialPackCount: input.colors ? Math.floor(row.quantity / input.packSize) : input.packCount, quantity: 0, unitCostMinor: Math.round(input.unitCost * 100), date: input.date,
            note: input.note.trim(), supplierId: input.supplierId, status: 'Aktif', createdAt: new Date().toISOString() };
          data.records.push(record);
          const item = movement(data, record, row.quantity, input.date, input.entryType, input.note || `${input.entryType} · ${batch} · ${record.color}`);
          if (input.postAccount) ledger(data, record, item, input.supplierId, input.accountAction, purchaseAmount(record.quantity, record.unitCostMinor));
          created.push(record);
        }
        // Tüm renkler ve cari hareketleri tek yazımda kaydedilir; kısmi parti oluşmaz.
        write(data);
        return created[0];
      });
    },
    async adjust(id, input) {
      return lock(async () => {
        const data = read(); const record = stock(data, id);
        if (record.status !== 'Aktif') throw new Error('İşlem için stok kaydını aktif hale getirin.');
        if (!['total', 'difference'].includes(input.mode) || !Number.isSafeInteger(input.amount) || !input.description.trim()) throw new Error('Tam sayı miktar ve düzeltme açıklaması girin.');
        movement(data, record, input.mode === 'total' ? input.amount - record.quantity : input.amount, input.date, 'Sayım / Stok Düzeltme', input.description);
        write(data);
      });
    },
    async returnStock(id, input) {
      return lock(async () => {
        if (input.postAccount) await supplier(input.supplierId, true);
        const data = read(); const record = stock(data, id);
        if (record.status !== 'Aktif') throw new Error('İşlem için stok kaydını aktif hale getirin.');
        if (!validCount(input.quantity) || input.quantity < 1 || !input.description.trim()) throw new Error('Pozitif tam sayı iade adedi ve açıklama girin.');
        const item = movement(data, record, -input.quantity, input.date, 'İade', input.description);
        if (input.postAccount) ledger(data, record, item, input.supplierId, 'Tedarikçiye iade', purchaseAmount(input.quantity, record.unitCostMinor));
        write(data);
      });
    },
    async setStatus(id, status) {
      return lock(async () => {
        if (!['Aktif', 'Pasif'].includes(status)) throw new Error('Geçerli bir durum seçin.');
        const data = read(); stock(data, id).status = status; write(data);
      });
    },
  };
}
