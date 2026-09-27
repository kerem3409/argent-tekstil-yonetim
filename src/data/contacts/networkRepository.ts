import { createStore } from '../shared/store.ts';
import type { StoragePort, StoreLock } from '../shared/store';
import { checkDate, requireText, uid } from '../../domain/common.ts';
import { emptyContact, validateContact } from '../../features/contacts/model.ts';
import type { ContactInput, ContactRole } from '../../features/contacts/model';
import type { ContactRepository } from './repository';

export const networkCategories = ['Kumaşçı', 'Malzemeci', 'Fasoncu', 'Ambalaj', 'Potansiyel Müşteri', 'Hazır Giyim Tedarikçisi', 'Diğer'] as const;
export const networkStatuses = ['Bağlantı', 'Görüşüldü', 'Çalışılıyor'] as const;
export interface NetworkInput { name: string; company: string; category: string; phone: string; city: string; note: string; metDate: string; status: string }
export interface NetworkRecord extends NetworkInput { id: string; revision: number; contactId?: string; createdAt: string }
export const NETWORK_KEY = 'argent-tekstil.network.v1';
function validateInput(r: NetworkInput) {
  requireText(r.name, 'Ad Soyad', 200); requireText(r.category, 'Kategori', 200); checkDate(r.metDate);
  if (!networkStatuses.includes(r.status as typeof networkStatuses[number])) throw new Error('Durum seçin.');
  for (const k of ['company', 'phone', 'city', 'note'] as const) if (typeof r[k] !== 'string' || r[k].length > (k === 'note' ? 2000 : 200)) throw new Error('Alan uzunluğunu kontrol edin.');
}
export function networkContactInput(r: NetworkRecord): ContactInput {
  const roles: Record<string, ContactRole> = { Kumaşçı: 'Kumaş Tedarikçisi', Malzemeci: 'Malzeme Tedarikçisi', Fasoncu: 'Fasoncu', Ambalaj: 'Malzeme Tedarikçisi', 'Potansiyel Müşteri': 'Hazır Giyim Müşterisi', 'Hazır Giyim Tedarikçisi': 'Hazır Giyim Tedarikçisi' };
  const input: ContactInput = { ...emptyContact, type: r.company ? 'Firma' : 'Şahıs', name: r.company || r.name, authorizedPerson: r.company ? r.name : '', phone: r.phone, address: r.city, note: r.note, roles: roles[r.category] ? [roles[r.category]] : [] };
  if (validateContact(input).phone) { input.phone = ''; input.note = `${r.note}\nİş Ağı telefon notu: ${r.phone}`.trim(); }
  return input;
}
export function createNetworkRepository(storage: () => StoragePort, contacts: Pick<ContactRepository, 'create' | 'get'>, lock?: StoreLock) {
  const store = createStore<{ version: 1; records: NetworkRecord[] }>(NETWORK_KEY, () => ({ version: 1, records: [] }), (value) => {
    const data = value as { version: number; records: NetworkRecord[] };
    if (data?.version !== 1 || !Array.isArray(data.records)) throw new Error('İş Ağı verisi geçersiz.');
    const ids = new Set<string>(); for (const r of data.records) { validateInput(r); if (!r.id || ids.has(r.id) || !Number.isSafeInteger(r.revision) || r.revision < 0) throw new Error('İş Ağı kaydı geçersiz.'); ids.add(r.id); }
  }, storage, lock);
  return {
    async list() { return (await store.load()).records; },
    async save(input: NetworkInput, id?: string, revision?: number) { validateInput(input); return store.transact((data) => {
      const old = id ? data.records.find((r) => r.id === id) : undefined;
      if (id && (!old || old.revision !== revision)) throw new Error('Kayıt değişti. Listeyi yenileyin.');
      const record: NetworkRecord = { ...old, ...input, id: old?.id ?? uid(), revision: (old?.revision ?? -1) + 1, createdAt: old?.createdAt ?? new Date().toISOString() };
      data.records = [...data.records.filter((r) => r.id !== record.id), record]; return record;
    }); },
    async transfer(id: string, revision: number, input: ContactInput) { return store.transact(async (data) => {
      const record = data.records.find((r) => r.id === id); if (!record) throw new Error('Kayıt bulunamadı.');
      if (record.contactId) { const linked = await contacts.get(record.contactId); if (!linked) throw new Error('Bağlı firma bulunamadı.'); return linked; }
      if (record.revision !== revision) throw new Error('Kayıt değişti. Listeyi yenileyin.');
      const contact = await contacts.create(input, id); record.contactId = contact.id; record.status = 'Çalışılıyor'; record.revision++; return contact;
    }); },
  };
}
