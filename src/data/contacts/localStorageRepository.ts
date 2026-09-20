import { normalizeContact, validateContact } from '../../features/contacts/model.ts';
import type { Contact, ContactInput } from '../../features/contacts/model.ts';
import type { ContactRepository } from './repository';

export const CONTACTS_STORAGE_KEY = 'argent-tekstil.contacts.v1';
type ContactStorage = Pick<Storage, 'getItem' | 'setItem'>;

function isContact(value: unknown): value is Contact {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const strings = ['id', 'createdAt', 'updatedAt', 'type', 'name', 'authorizedPerson', 'phone', 'email', 'address', 'note', 'taxOffice', 'taxNumber', 'billingAddress', 'invoiceStatus', 'status'];
  if (!strings.every((key) => typeof record[key] === 'string')) return false;
  if (!record.id || !Array.isArray(record.roles) || !Array.isArray(record.services)) return false;
  return Object.keys(validateContact(value as Contact)).length === 0;
}

export function createLocalStorageContactRepository(getStorage: () => ContactStorage): ContactRepository {
  function read(): Contact[] {
    let raw: string | null;
    try { raw = getStorage().getItem(CONTACTS_STORAGE_KEY); }
    catch { throw new Error('Kayıtlara erişilemiyor. Tarayıcınızın yerel depolama iznini kontrol edin.'); }
    if (raw === null) return [];
    try {
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== 'object') throw new Error();
      const envelope = data as { version?: unknown; records?: unknown };
      if (envelope.version !== 1 || !Array.isArray(envelope.records) || !envelope.records.every(isContact)) throw new Error();
      if (new Set(envelope.records.map((record) => record.id)).size !== envelope.records.length) throw new Error();
      return envelope.records;
    } catch {
      // Bozuk veriyi boş liste kabul etmek, sonraki kayıtta eski verileri silebilir.
      throw new Error('Saklanan firma / kişi verileri okunamadı. Mevcut veriler değiştirilmedi.');
    }
  }

  function write(records: Contact[]) {
    try { getStorage().setItem(CONTACTS_STORAGE_KEY, JSON.stringify({ version: 1, records })); }
    catch { throw new Error('Kayıt saklanamadı. Tarayıcınızın depolama iznini ve boş alanını kontrol edip tekrar deneyin.'); }
  }

  function prepare(input: ContactInput) {
    const normalized = normalizeContact(input);
    if (Object.keys(validateContact(normalized)).length) throw new Error('Lütfen formdaki alanları kontrol edin.');
    return normalized;
  }

  return {
    async list() { return read(); },
    async get(id) { return read().find((contact) => contact.id === id) ?? null; },
    async create(input) {
      const normalized = prepare(input);
      const records = read();
      const now = new Date().toISOString();
      const contact: Contact = { ...normalized, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
      write([...records, contact]);
      return contact;
    },
    async update(id, input) {
      const normalized = prepare(input);
      const records = read();
      const index = records.findIndex((contact) => contact.id === id);
      if (index === -1) throw new Error('Düzenlenecek kayıt bulunamadı. Listeyi yenileyin.');
      const contact: Contact = { ...records[index], ...normalized, updatedAt: new Date().toISOString() };
      records[index] = contact;
      write(records);
      return contact;
    },
  };
}
