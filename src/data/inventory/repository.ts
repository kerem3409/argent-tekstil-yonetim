import { createStore } from '../shared/store.ts';
import type { StoragePort, StoreLock } from '../shared/store';
import type { ContactRepository } from '../contacts/repository';
import { accountChoice, amount, checkDate, minor, quantity, requireText, rounded, uid } from '../../domain/common.ts';
import type { Fabric, FabricInput, InventoryMovement, InventoryStore, Machine, MachineInput, Material, MaterialInput, Purchase } from '../../domain/inventory';
import { machineStatuses, materialCategories, units } from '../../domain/inventory.ts';

function validate<T extends Purchase>(value: unknown) {
  const data = value as InventoryStore<T>;
  if (!data || data.version !== 1 || !Array.isArray(data.records) || !Array.isArray(data.movements)) throw new Error();
  if (new Set(data.records.map((item) => item.id)).size !== data.records.length) throw new Error();
  for (const item of data.records) {
    if (!item.id || typeof item.active !== 'boolean' || typeof item.companyId !== 'string' || !Number.isSafeInteger(item.purchaseMinor) || item.purchaseMinor < 0) throw new Error();
    checkDate(item.date); accountChoice(item.account, item.companyId, item.purchaseMinor);
    requireText((item as unknown as { name: string }).name, 'Ad');
    if ('colors' in item) {
      const fabric = item as unknown as Fabric;
      if (!Array.isArray(fabric.colors) || !fabric.colors.length || new Set(fabric.colors.map((c) => c.id)).size !== fabric.colors.length || !Number.isSafeInteger(fabric.priceMinor) || fabric.priceMinor < 0) throw new Error();
      for (const color of fabric.colors) { if (!color.id) throw new Error(); requireText(color.color, 'Renk'); quantity(color.rolls, 'Top', true, true); quantity(color.kg, 'Kg', false, true); }
    } else if ('category' in item) {
      const material = item as unknown as Material;
      if (!materialCategories.includes(material.category) || !units.includes(material.unit) || !Number.isSafeInteger(material.priceMinor) || material.priceMinor < 0) throw new Error(); quantity(material.quantity, 'Miktar', ['Adet', 'Top', 'Paket'].includes(material.unit), true);
    } else {
      const machine = item as unknown as Machine; if (!machineStatuses.includes(machine.status)) throw new Error(); quantity(machine.quantity, 'Adet', true);
    }
  }
  for (const movement of data.movements) {
    if (!movement.id || !data.records.some((item) => item.id === movement.recordId) || !Number.isFinite(movement.balance) || movement.balance < 0) throw new Error();
    checkDate(movement.date);
    if (!['Giriş', 'Çıkış', 'Sayım / Düzeltme', 'İade'].includes(movement.type) || !Number.isFinite(movement.incoming) || !Number.isFinite(movement.outgoing) || movement.incoming < 0 || movement.outgoing < 0) throw new Error();
  }
  for (const item of data.records) {
    if ('colors' in item) {
      for (const color of (item as unknown as Fabric).colors) {
        const moves = data.movements.filter((m) => m.recordId === item.id && m.colorId === color.id);
        if (rounded(moves.reduce((s, m) => s + m.incoming - m.outgoing, 0)) !== color.kg || moves.reduce((s, m) => s + (m.rollDelta ?? 0), 0) !== color.rolls) throw new Error();
      }
    } else if ('category' in item && rounded(data.movements.filter((m) => m.recordId === item.id).reduce((s, m) => s + m.incoming - m.outgoing, 0)) !== (item as unknown as Material).quantity) throw new Error();
  }
}
export function createInventoryRepositories(storage: () => StoragePort, contacts: Pick<ContactRepository, 'get'>, lock?: StoreLock) {
  const fabrics = createStore<InventoryStore<Fabric>>('argent-tekstil.fabrics.v1', () => ({ version: 1, records: [], movements: [] }), validate<Fabric>, storage, lock);
  const materials = createStore<InventoryStore<Material>>('argent-tekstil.materials.v1', () => ({ version: 1, records: [], movements: [] }), validate<Material>, storage, lock);
  const machines = createStore<InventoryStore<Machine>>('argent-tekstil.machines.v1', () => ({ version: 1, records: [], movements: [] }), validate<Machine>, storage, lock);
  async function purchase(input: { companyId: string; date: string; note: string; account: Purchase['account'] }, total: number): Promise<Purchase> {
    checkDate(input.date); accountChoice(input.account, input.companyId, total);
    if (input.companyId && (await contacts.get(input.companyId))?.status !== 'Aktif') throw new Error('Aktif bir firma seçin.');
    return { id: uid(), companyId: input.companyId, date: input.date, note: input.note.trim(), account: input.account, purchaseMinor: total, active: true };
  }
  function addMovement<T>(data: InventoryStore<T>, recordId: string, date: string, type: InventoryMovement['type'], delta: number, balance: number, description: string, colorId?: string, rollDelta?: number, rollBalance?: number) {
    checkDate(date); requireText(description, 'Açıklama');
    const previous = data.movements.filter((item) => item.recordId === recordId && item.colorId === colorId).at(-1);
    if (previous && date < previous.date) throw new Error('Tarih son stok hareketinden önce olamaz.');
    quantity(balance, 'Kalan', false, true);
    data.movements.push({ id: uid(), recordId, date, type, incoming: Math.max(delta, 0), outgoing: Math.max(-delta, 0), balance, description, colorId, rollDelta, rollBalance });
  }
  return {
    fabrics: {
      load: fabrics.load,
      async create(input: FabricInput) {
        requireText(input.name, 'Kumaş adı'); requireText(input.lot, 'Lot / Parti No');
        if (!input.colors.length) throw new Error('En az bir renk girin.');
        if (new Set(input.colors.map((item) => item.color.trim().toLocaleLowerCase('tr'))).size !== input.colors.length) throw new Error('Aynı rengi tek satırda girin.');
        input.colors.forEach((item) => { requireText(item.color, 'Renk'); quantity(item.rolls, 'Top sayısı', true); quantity(item.kg, 'Kg'); });
        const priceMinor = minor(input.price); const total = amount(input.colors.reduce((sum, item) => sum + item.kg, 0), priceMinor);
        const base = await purchase(input, total);
        return fabrics.transact((data) => {
          const record: Fabric = { ...base, name: input.name.trim(), grammage: input.grammage, content: input.content, width: input.width, lot: input.lot, priceMinor, colors: input.colors.map((item) => ({ ...item, color: item.color.trim(), id: uid() })) };
          data.records.push(record); record.colors.forEach((color) => addMovement(data, record.id, record.date, 'Giriş', color.kg, color.kg, 'Kumaş alımı', color.id, color.rolls, color.rolls)); return record;
        });
      },
      async adjust(id: string, colorId: string, kg: number, rolls: number, date: string, description: string) {
        quantity(kg, 'Kg', false, true); quantity(rolls, 'Top sayısı', true, true);
        return fabrics.transact((data) => { const record = data.records.find((item) => item.id === id); const color = record?.colors.find((item) => item.id === colorId); if (!record?.active || !color) throw new Error('Aktif stok ve renk seçin.'); if (color.kg === kg && color.rolls === rolls) throw new Error('Miktar değişmedi.'); addMovement(data, id, date, 'Sayım / Düzeltme', rounded(kg - color.kg), kg, description, colorId, rolls - color.rolls, rolls); color.kg = kg; color.rolls = rolls; });
      },
      async toggle(id: string) { return fabrics.transact((data) => { const item = data.records.find((r) => r.id === id); if (!item) throw new Error('Kayıt bulunamadı.'); item.active = !item.active; }); },
    },
    materials: {
      load: materials.load,
      async create(input: MaterialInput) {
        requireText(input.name, 'Malzeme adı'); if (!materialCategories.includes(input.category) || !units.includes(input.unit)) throw new Error('Kategori ve birim seçin.'); quantity(input.quantity, 'Miktar', ['Adet', 'Top', 'Paket'].includes(input.unit)); const priceMinor = minor(input.price); const base = await purchase(input, amount(input.quantity, priceMinor));
        return materials.transact((data) => { const record: Material = { ...base, name: input.name, category: input.category, feature: input.feature, quantity: input.quantity, unit: input.unit, priceMinor }; data.records.push(record); addMovement(data, record.id, record.date, 'Giriş', record.quantity, record.quantity, 'Malzeme alımı'); return record; });
      },
      async move(id: string, type: InventoryMovement['type'], value: number, date: string, description: string) {
        return materials.transact((data) => { const item = data.records.find((r) => r.id === id); if (!item?.active) throw new Error('Aktif stok seçin.'); quantity(value, 'Miktar', ['Adet', 'Top', 'Paket'].includes(item.unit), type === 'Sayım / Düzeltme'); if (!['Giriş', 'Çıkış', 'İade', 'Sayım / Düzeltme'].includes(type)) throw new Error('İşlem seçin.'); const delta = type === 'Sayım / Düzeltme' ? value - item.quantity : type === 'Giriş' ? value : -value; if (!delta) throw new Error('Miktar değişmedi.'); const balance = rounded(item.quantity + delta); if (balance < 0) throw new Error('Stoktan fazla çıkış yapılamaz.'); addMovement(data, id, date, type, rounded(delta), balance, description); item.quantity = balance; });
      },
      async toggle(id: string) { return materials.transact((data) => { const item = data.records.find((r) => r.id === id); if (!item) throw new Error('Kayıt bulunamadı.'); item.active = !item.active; }); },
    },
    machines: {
      load: machines.load,
      async create(input: MachineInput) {
        requireText(input.name, 'Makine adı'); requireText(input.type, 'Tür'); quantity(input.quantity, 'Adet', true); if (!machineStatuses.includes(input.status) || input.account === 'Alacaktan mahsup et') throw new Error('Geçerli durum ve cari işlem seçin.'); const base = await purchase(input, minor(input.price));
        return machines.transact((data) => { const record: Machine = { ...base, name: input.name, type: input.type, model: input.model, quantity: input.quantity, status: input.status }; data.records.push(record); return record; });
      },
      async updateStatus(id: string, status: Machine['status']) { if (!machineStatuses.includes(status)) throw new Error('Durum seçin.'); return machines.transact((data) => { const item = data.records.find((r) => r.id === id); if (!item) throw new Error('Kayıt bulunamadı.'); item.status = status; }); },
      async toggle(id: string) { return machines.transact((data) => { const item = data.records.find((r) => r.id === id); if (!item) throw new Error('Kayıt bulunamadı.'); item.active = !item.active; }); },
    },
  };
}
