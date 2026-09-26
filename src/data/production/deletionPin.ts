import { createStore } from '../shared/store.ts';
import type { StoragePort, StoreLock } from '../shared/store';

export const DELETION_PIN_KEY = 'argent-tekstil.deletion-pin.v1';
interface PinRecord { version: 1; salt: string; hash: string }
const iterations = 310000;
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
async function derive(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bytes = Uint8Array.from(salt.match(/../g)!, (byte) => parseInt(byte, 16));
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytes }, key, 256)));
}
export function createDeletionPin(storage: () => StoragePort, lock?: StoreLock) {
  const store = createStore<PinRecord | null>(DELETION_PIN_KEY, () => null, (value) => {
    if (value === null) return;
    const record = value as PinRecord;
    if (record.version !== 1 || !/^[a-f0-9]{32}$/.test(record.salt) || !/^[a-f0-9]{64}$/.test(record.hash)) throw new Error('Silme şifresi kaydı geçersiz.');
  }, storage, lock);
  return {
    async configured() { return !!(await store.load()); },
    async setup(pin: string, confirmation: string) {
      if (pin.length < 6 || pin.length > 128 || !pin.trim()) throw new Error('Silme şifresi/PIN 6–128 karakter olmalıdır.');
      if (pin !== confirmation) throw new Error('Şifreler eşleşmiyor.');
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await derive(pin, salt);
      // The lock also protects first-time setup across tabs.
      const save = async () => {
        if (await store.load()) throw new Error('Silme şifresi zaten belirlenmiş. Mevcut şifreyi kullanın.');
        try { storage().setItem(DELETION_PIN_KEY, JSON.stringify({ version: 1, salt, hash })); }
        catch { throw new Error('Silme şifresi kaydedilemedi.'); }
      };
      if (lock) await lock(DELETION_PIN_KEY, save); else await save();
    },
    async verify(pin: string) {
      const record = await store.load();
      if (!record) throw new Error('Önce bir silme şifresi/PIN belirleyin.');
      if (pin.length > 128) throw new Error('Silme şifresi/PIN yanlış.');
      const hash = await derive(pin, record.salt);
      let difference = 0;
      for (let i = 0; i < record.hash.length; i++) difference |= record.hash.charCodeAt(i) ^ hash.charCodeAt(i);
      if (difference !== 0) throw new Error('Silme şifresi/PIN yanlış.');
    },
  };
}
