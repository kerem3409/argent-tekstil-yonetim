import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalStorageContactRepository, CONTACTS_STORAGE_KEY } from '../src/data/contacts/localStorageRepository.ts';
import { emptyContact, filterContacts, normalizeContact, validateContact } from '../src/features/contacts/model.ts';
import type { ContactInput } from '../src/features/contacts/model.ts';

function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { values, storage, repository: createLocalStorageContactRepository(() => storage) };
}

const input: ContactInput = {
  ...emptyContact, name: '  Işık Tekstil  ', authorizedPerson: 'İpek Yılmaz', phone: '+90 (532) 123 45 67',
  email: 'info@example.com', taxNumber: '1234567890', roles: ['Fasoncu', 'Kumaş Tedarikçisi'],
  services: ['Kesim', 'Dikim'], invoiceStatus: 'E-Arşiv', note: 'İlk görüşme\nNumune bekleniyor.',
};

test('Oluşturulan kayıt yeni repository örneğinden tüm alanlarıyla okunur', async () => {
  const { repository, storage } = setup();
  assert.deepEqual(await repository.list(), []);
  const created = await repository.create(input);
  assert.ok(created.id);
  assert.ok(created.createdAt);
  const reloaded = await createLocalStorageContactRepository(() => storage).get(created.id);
  assert.deepEqual(reloaded, { ...normalizeContact(input), id: created.id, createdAt: created.createdAt, updatedAt: created.updatedAt });
  assert.equal(await repository.get('olmayan-kayit'), null);
});

test('Düzenleme kimliği korur; pasif kayıt ve birden fazla rol saklanır', async () => {
  const { repository } = setup();
  const first = await repository.create(input);
  const second = await repository.create({ ...input, name: 'İkinci Firma' });
  const updated = await repository.update(first.id, { ...input, name: 'Yeni Unvan', status: 'Pasif', roles: ['Hazır Giyim Müşterisi', 'Malzeme Tedarikçisi'] });
  assert.equal(updated.id, first.id);
  assert.equal(updated.createdAt, first.createdAt);
  assert.equal(updated.status, 'Pasif');
  assert.deepEqual(updated.services, []);
  assert.equal(updated.roles.length, 2);
  assert.equal((await repository.list()).length, 2);
  assert.deepEqual(await repository.get(second.id), second);
  await assert.rejects(repository.update('yok', input), /bulunamadı/);
});

test('Türkçe arama, telefon araması ve rol filtresi birlikte çalışır', async () => {
  const { repository } = setup();
  await repository.create(input);
  await repository.create({ ...emptyContact, name: 'Başka Firma', roles: ['Hazır Giyim Müşterisi'] });
  const records = await repository.list();
  assert.equal(filterContacts(records, 'ışık', 'Fasoncu').length, 1);
  assert.equal(filterContacts(records, 'İPEK', '').length, 1);
  assert.equal(filterContacts(records, '0532', '').length, 1);
  assert.equal(filterContacts(records, '999999', '').length, 0);
  assert.equal(filterContacts(records, '5321234567', '').length, 1);
  assert.equal(filterContacts(records, 'info@', 'Kumaş Tedarikçisi').length, 1);
  assert.equal(filterContacts(records, 'ışık', 'Hazır Giyim Müşterisi').length, 0);
});

test('Form doğrulaması zorunlu ve isteğe bağlı alanları ayırır', async () => {
  assert.ok(validateContact(emptyContact).name);
  assert.ok(validateContact(emptyContact).roles);
  assert.deepEqual(validateContact({ ...emptyContact, type: 'Şahıs', name: 'Ada Yılmaz', roles: ['Hazır Giyim Müşterisi'] }), {});
  assert.ok(validateContact({ ...input, email: 'yanlış' }).email);
  assert.ok(validateContact({ ...input, phone: 'abc123' }).phone);
  assert.ok(validateContact({ ...input, taxNumber: '1234' }).taxNumber);
  assert.ok(validateContact({ ...input, name: ' '.repeat(5) }).name);
  assert.ok(validateContact({ ...input, note: 'a'.repeat(2001) }).note);
  assert.deepEqual(validateContact({ ...input, taxNumber: '12345678901' }), {});
  const { repository } = setup();
  await assert.rejects(repository.create(emptyContact), /kontrol edin/);
  assert.deepEqual(await repository.list(), []);
});

test('Bozuk veya uyumsuz veri sessizce silinmez', async () => {
  const { values, repository } = setup();
  for (const corrupt of ['bozuk-json', '{}', '{"version":2,"records":[]}', '{"version":1,"records":[{"id":"x"}]}']) {
    values.set(CONTACTS_STORAGE_KEY, corrupt);
    await assert.rejects(repository.list(), /verileri okunamadı/);
    await assert.rejects(repository.create(input), /verileri okunamadı/);
    assert.equal(values.get(CONTACTS_STORAGE_KEY), corrupt);
  }
});

test('Depolama erişim ve yazma hataları kullanıcıya aktarılır', async () => {
  const denied = createLocalStorageContactRepository(() => { throw new Error('SecurityError'); });
  await assert.rejects(denied.list(), /depolama iznini/);
  const { values, storage, repository } = setup();
  await repository.create(input);
  const before = values.get(CONTACTS_STORAGE_KEY);
  const full = createLocalStorageContactRepository(() => ({ ...storage, setItem() { throw new Error('QuotaExceededError'); } }));
  await assert.rejects(full.create(input), /Kayıt saklanamadı/);
  assert.equal(values.get(CONTACTS_STORAGE_KEY), before);
});
