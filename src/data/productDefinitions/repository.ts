import { createStore } from '../shared/store.ts';
import type { StoragePort, StoreLock } from '../shared/store';

export interface ProductDefinition { id: string; name: string; note: string; status: 'Aktif' | 'Pasif'; createdAt: string; updatedAt: string }
export type DefinitionInput = Pick<ProductDefinition, 'name' | 'note' | 'status'>;
export const DEFINITIONS_STORAGE_KEY = 'argent-tekstil.productDefinitions.v1';
export const normalizedName = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
function validate(input: DefinitionInput) {
  if (typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.trim().length > 200) throw new Error('Ürün adı 2–200 karakter olmalıdır.');
  if (typeof input.note !== 'string' || input.note.length > 2000) throw new Error('Not en fazla 2000 karakter olmalıdır.');
  if (!['Aktif', 'Pasif'].includes(input.status)) throw new Error('Geçerli bir durum seçin.');
}
export function resolveDefinition<T extends { name: string; productDefinitionId?: string }>(record: T, definitions: ProductDefinition[]): T {
  const definition = record.productDefinitionId ? definitions.find((d) => d.id === record.productDefinitionId) : definitions.find((d) => normalizedName(d.name) === normalizedName(record.name));
  return definition ? { ...record, productDefinitionId: definition.id, name: definition.name } : record;
}
export function createProductDefinitionRepository(storage: () => StoragePort, lock?: StoreLock) {
  const store = createStore<{ version: 1; records: ProductDefinition[] }>(DEFINITIONS_STORAGE_KEY, () => ({ version: 1, records: [] }), (value) => {
    const data = value as { version: number; records: ProductDefinition[] };
    if (!data || data.version !== 1 || !Array.isArray(data.records)) throw new Error();
    const ids = new Set<string>(); const names = new Set<string>();
    for (const record of data.records) {
      validate(record);
      if (typeof record.id !== 'string' || !record.id || ids.has(record.id) || names.has(record.name.trim().toLocaleLowerCase('tr-TR')) || !Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error();
      ids.add(record.id); names.add(record.name.trim().toLocaleLowerCase('tr-TR'));
    }
  }, storage, lock);
  return {
    async list() { return (await store.load()).records; },
    async requireActive(id?: string) {
      const record = (await store.load()).records.find((d) => d.id === id);
      if (!record || record.status !== 'Aktif') throw new Error('Aktif bir ürün tanımı seçin.');
      return record;
    },
    async save(input: DefinitionInput, id?: string) {
      validate(input);
      return store.transact((data) => {
        if (id && !data.records.some((d) => d.id === id)) throw new Error('Ürün tanımı bulunamadı.');
        if (data.records.some((d) => d.id !== id && normalizedName(d.name) === normalizedName(input.name))) throw new Error('Bu isimde bir ürün zaten kayıtlı.');
        const now = new Date().toISOString();
        if (id) {
          const record = data.records.find((d) => d.id === id);
          if (!record) throw new Error('Ürün tanımı bulunamadı.');
          Object.assign(record, { name: input.name.trim(), note: input.note.trim(), status: input.status, updatedAt: now }); return record;
        }
        const record: ProductDefinition = { id: crypto.randomUUID(), name: input.name.trim(), note: input.note.trim(), status: input.status, createdAt: now, updatedAt: now };
        data.records.push(record); return record;
      });
    },
    async setStatus(id: string, status: ProductDefinition['status']) {
      return store.transact((data) => {
        const record = data.records.find((d) => d.id === id);
        if (!record) throw new Error('Ürün tanımı bulunamadı.');
        validate({ ...record, status }); record.status = status; record.updatedAt = new Date().toISOString();
      });
    },
  };
}
export type ProductDefinitionRepository = ReturnType<typeof createProductDefinitionRepository>;
