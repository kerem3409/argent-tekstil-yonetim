export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type StoreLock = <T>(key: string, work: () => Promise<T>) => Promise<T>;
const pending = new Map<string, Promise<unknown>>();
export const browserLock: StoreLock = (key, work) => {
  if (navigator.locks) return navigator.locks.request(key, work);
  const next = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
  pending.set(key, next);
  void next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => undefined);
  return next;
};
export function createStore<T>(key: string, empty: () => T, validate: (value: unknown) => void, storage: () => StoragePort, lock: StoreLock = (_key, work) => work()) {
  function read(): T {
    let raw: string | null;
    try { raw = storage().getItem(key); } catch { throw new Error('Tarayıcı depolamasına erişilemiyor.'); }
    if (raw === null) return empty();
    try { const value: unknown = JSON.parse(raw); validate(value); return value as T; }
    catch { throw new Error('Bu modülün kayıtları okunamadı. Mevcut veriler korunuyor.'); }
  }
  return {
    async load() { return read(); },
    async transact<R>(work: (data: T) => R | Promise<R>): Promise<R> {
      return lock(key, async () => {
        const data = read(); const result = await work(data); validate(data);
        try { storage().setItem(key, JSON.stringify(data)); } catch { throw new Error('İşlem kaydedilemedi. Depolama iznini ve boş alanı kontrol edin.'); }
        return result;
      });
    },
  };
}
