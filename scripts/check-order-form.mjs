import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React, { act } from 'react';

test('Sipariş Kartı: gerçek form etkileşimleri, kalıcı kayıt ve eski route', async (t) => {
  // Each case owns an isolated in-memory DOM/storage; no real browser data is used.
  let dom;
  let root;
  function newDOM(path = '/uretim/siparisler') {
    dom = new JSDOM('<div id="root"></div>', { url: `http://localhost/#${path}` });
    for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'FormData']) globalThis[name] = dom.window[name];
    dom.window.scrollTo = () => {};
    globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  newDOM();
  const { createRoot } = await import('react-dom/client');
  const { HashRouter } = await import('react-router-dom');
  const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { App } = await server.ssrLoadModule('/src/app/App.tsx');
    const { workflowRepository } = await server.ssrLoadModule('/src/data/production/index.ts');
    const { productDefinitionRepository } = await server.ssrLoadModule('/src/data/productDefinitions/index.ts');
    const { contactRepository } = await server.ssrLoadModule('/src/data/contacts/index.ts');
    const { emptyContact } = await server.ssrLoadModule('/src/features/contacts/model.ts');
    const body = () => document.body.textContent;
    const button = (text) => {
      const result = [...document.querySelectorAll('button')].find((node) => node.textContent === text);
      assert.ok(result, `Button: ${text}`);
      return result;
    };
    const field = (label, index = 0) => {
      const labels = [...document.querySelectorAll('label')].filter((node) => node.querySelector('span')?.textContent === label);
      const result = labels[index]?.querySelector('input, select, textarea');
      assert.ok(result, `Field: ${label} [${index}]`);
      return result;
    };
    async function click(node) { await act(async () => { node.click(); }); }
    async function fill(node, value) {
      await act(async () => {
        const prototype = node.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
        node.dispatchEvent(new dom.window.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
    }
    async function mount({ definitions = 'active', path } = {}) {
      if (root) await act(async () => root.unmount());
      dom.window.close();
      newDOM(path);
      let product;
      if (definitions !== 'none') product = await productDefinitionRepository.save({ name: 'Test Polo', note: '', status: definitions === 'active' ? 'Aktif' : 'Pasif' });
      const customer = await contactRepository.create({ ...emptyContact, name: 'Test Müşteri', roles: ['Hazır Giyim Müşterisi'] });
      root = createRoot(document.getElementById('root'));
      await act(async () => root.render(React.createElement(HashRouter, null, React.createElement(App))));
      return { product, customer };
    }
    async function openStock() {
      const data = await mount();
      await click(button('+ Sipariş Kartı Oluştur'));
      await fill(field('Sipariş Türü'), 'Stok İçin Üretim');
      await fill(field('Ürün Tanımı *'), data.product.id);
      await fill(field('Ürün Adı / Model Adı *'), 'Basic Polo 2026');
      await fill(field('Renk *'), 'Beyaz');
      await fill(field('Adet *'), '100');
      await fill(field('Kumaş Adı *'), '  24/1 Penye  ');
      await fill(field('Gramaj *'), ' 180 ');
      return data;
    }
    async function savedOrder() {
      await click(button('Sipariş Kartını Oluştur'));
      assert.equal(document.querySelector('[role="alert"]'), null, body());
      const orders = await workflowRepository.listOrders();
      assert.equal(orders.length, 1);
      assert.equal(orders[0].items[0].fabricName, '24/1 Penye');
      assert.equal(orders[0].items[0].gsm, '180');
      assert.ok(body().includes(orders[0].orderNo));
      return orders[0];
    }
    await t.test('Stok için tek renk: yazılan kumaş ve gramaj kaydedilir, müşteri gerekmez', async () => {
      await openStock();
      const order = await savedOrder();
      assert.equal(order.customerId, undefined);
      assert.equal(order.items[0].totalQuantity, 100);
      // Unmount/remount confirms the result comes back from storage.
      await act(async () => root.unmount());
      root = createRoot(document.getElementById('root'));
      await act(async () => root.render(React.createElement(HashRouter, null, React.createElement(App))));
      await click(button('Detay'));
      assert.ok(body().includes('24/1 Penye'));
      assert.ok(body().includes('180'));
    });
    await t.test('Stok için çok renk: renk ekleme sırasında kumaş ve gramaj korunur', async () => {
      await openStock();
      await click(button('+ Renk Ekle'));
      await fill(field('Renk *', 1), 'Siyah');
      await fill(field('Adet *', 1), '50');
      const order = await savedOrder();
      assert.equal(order.items[0].totalQuantity, 150);
      assert.deepEqual(order.items[0].colorQuantities, [{ color: 'Beyaz', quantity: 100 }, { color: 'Siyah', quantity: 50 }]);
    });
    await t.test('Boş veya yalnızca boşluk içeren kumaş adı görünür hata verir, kayıt yazmaz', async () => {
      await openStock();
      for (const value of ['', '   ']) {
        await fill(field('Kumaş Adı *'), value);
        await click(button('Sipariş Kartını Oluştur'));
        assert.match(document.querySelector('[role="alert"]').textContent, /Kumaş Adı/);
        assert.equal((await workflowRepository.listOrders()).length, 0);
      }
      await fill(field('Kumaş Adı *'), '24/1 Penye');
      await savedOrder();
    });
    await t.test('Ön siparişte müşteri yoksa hata ve yıldız, seçilirse başarılı kayıt', async () => {
      const { customer } = await openStock();
      await fill(field('Sipariş Türü'), 'Ön Sipariş');
      assert.equal(field('Müşteri *').required, true);
      await click(button('Sipariş Kartını Oluştur'));
      assert.match(document.querySelector('[role="alert"]').textContent, /Müşteri/);
      assert.equal((await workflowRepository.listOrders()).length, 0);
      await fill(field('Müşteri *'), customer.id);
      assert.equal((await savedOrder()).customerId, customer.id);
    });
    await t.test('Tür değişiminde müşteri zorunluluğu ve yıldız güncellenir', async () => {
      await mount();
      await click(button('+ Sipariş Kartı Oluştur'));
      assert.equal(field('Müşteri *').required, true);
      await fill(field('Sipariş Türü'), 'Stok İçin Üretim');
      assert.equal(field('Müşteri').required, false);
      await fill(field('Sipariş Türü'), 'Ön Sipariş');
      assert.equal(field('Müşteri *').required, true);
    });
    await t.test('Eksik form Kaydet yanında tüm zorunlu alanları listeler', async () => {
      await mount();
      await click(button('+ Sipariş Kartı Oluştur'));
      await click(button('Sipariş Kartını Oluştur'));
      const summary = document.querySelector('[role="alert"]');
      assert.ok(summary);
      for (const text of ['Lütfen aşağıdaki zorunlu alanları tamamlayın:', 'Müşteri', 'Ürün', 'Kumaş Adı', 'Gramaj', 'En az bir renk ve adet']) assert.ok(summary.textContent.includes(text), text);
      assert.equal(summary.querySelectorAll('li').length, 6);
      assert.equal((await workflowRepository.listOrders()).length, 0);
      await click(button('Sipariş Kalemini Kaldır'));
      await click(button('Sipariş Kartını Oluştur'));
      assert.match(document.querySelector('[role="alert"]').textContent, /En az bir sipariş kalemi/);
    });
    for (const definitions of ['none', 'inactive']) await t.test(`${definitions}: aktif ürün yoksa bilgi ve çalışan Ürün Tanımları bağlantısı`, async () => {
      await mount({ definitions });
      await click(button('+ Sipariş Kartı Oluştur'));
      assert.ok(body().includes('Henüz aktif ürün tanımı bulunmuyor. Sipariş oluşturabilmek için önce Ürün Tanımları bölümünden ürün ekleyin.'));
      const link = [...document.querySelectorAll('a')].find((node) => node.textContent === 'Ürün Tanımlarına Git');
      assert.ok(link);
      await click(link);
      assert.equal(dom.window.location.hash, '#/stok/urun-tanimlari');
      assert.equal(document.querySelector('h1').textContent, 'Ürün Tanımları');
    });
    await t.test('Hızlı müşteri eklemede normalize edilmiş aynı ad seçilebilir, yeni kayıt çoğalmaz', async () => {
      const { customer } = await openStock();
      await click(button('+ Yeni Müşteri Ekle'));
      await fill(field('Müşteri / Firma Adı *'), '  TEST   MÜŞTERİ  ');
      await click(field('Müşteri / Firma Adı *').closest('form').querySelector('button'));
      assert.match(document.querySelector('[role="alert"]').textContent, /Bu isimde bir müşteri zaten kayıtlı/);
      assert.equal((await contactRepository.list()).length, 1);
      await click(button('Mevcut müşteriyi seç: Test Müşteri'));
      assert.equal(field('Müşteri').value, customer.id);
      assert.equal(field('Kumaş Adı *').value.trim(), '24/1 Penye');
      await click(button('+ Yeni Müşteri Ekle'));
      await fill(field('Müşteri / Firma Adı *'), 'Yeni Müşteri');
      await click(field('Müşteri / Firma Adı *').closest('form').querySelector('button'));
      assert.equal(field('Müşteri').selectedOptions[0].textContent, 'Yeni Müşteri');
    });
    await t.test('Hızlı ürün ekleme sipariş taslağını korur, ürünü seçer ve aynı adı reddeder', async () => {
      await openStock();
      await click(button('+ Yeni Ürün Ekle'));
      await fill(field('Ürün Adı *'), 'Polo   Yaka');
      await fill(field('Ürün Notu'), 'Yeni ürün notu');
      assert.equal(field('Ürün Durumu').value, 'Aktif');
      await click(button('Ürünü Kaydet'));
      const product = (await productDefinitionRepository.list()).find((p) => p.name === 'Polo   Yaka');
      assert.ok(product); assert.equal(product.note, 'Yeni ürün notu');
      assert.equal(field('Ürün Tanımı *').value, product.id);
      assert.equal(field('Ürün Adı / Model Adı *').value, 'Basic Polo 2026');
      assert.equal(field('Kumaş Adı *').value.trim(), '24/1 Penye');
      assert.equal(field('Adet *').value, '100');
      await click(button('+ Yeni Ürün Ekle'));
      await fill(field('Ürün Adı *'), ' POLO YAKA ');
      await click(button('Ürünü Kaydet'));
      assert.match(document.querySelector('[role="alert"]').textContent, /Bu isimde bir ürün zaten kayıtlı/);
      assert.equal((await productDefinitionRepository.list()).length, 2);
    });
    await t.test('Müşteri seçiminde sadece müşteri rolü; çok rollü müşteri dahil, diğerleri hariç', async () => {
      const { customer } = await mount();
      const other = await contactRepository.create({ ...emptyContact, name: 'Sadece Fasoncu', roles: ['Fasoncu'], services: ['Kesim'] });
      const multi = await contactRepository.create({ ...emptyContact, name: 'Müşteri ve Fasoncu', roles: ['Fasoncu', 'Hazır Giyim Müşterisi'], services: ['Dikim'] });
      await act(async () => window.dispatchEvent(new dom.window.Event('storage')));
      await click(button('+ Sipariş Kartı Oluştur'));
      const ids = [...field('Müşteri *').options].map((o) => o.value);
      assert.ok(ids.includes(customer.id)); assert.ok(ids.includes(multi.id)); assert.ok(!ids.includes(other.id));
    });
    await t.test('Şahıs formu tek isim ister, Roller üsttedir; gizlenen eski bilgiler korunur', async () => {
      await mount();
      const { ContactForm } = await server.ssrLoadModule('/src/features/contacts/ContactForm.tsx');
      let saved;
      await act(async () => root.render(React.createElement(ContactForm, { initial: { ...emptyContact, name: 'Ali Veli', authorizedPerson: 'Eski yetkili', taxOffice: 'Eski vergi dairesi', roles: ['Hazır Giyim Müşterisi'] }, onSave: async (input) => { saved = input; }, onCancel() {} })));
      assert.deepEqual([...document.querySelectorAll('form > fieldset > legend')].map((n) => n.textContent), ['Kayıt Türü', 'Roller *', 'Temel Bilgiler', 'Fatura Bilgileri', 'Not / Diğer Bilgiler']);
      assert.ok(document.getElementById('contact-authorizedPerson'));
      await fill(document.getElementById('contact-type'), 'Şahıs');
      assert.equal(document.getElementById('contact-authorizedPerson'), null);
      assert.equal(document.getElementById('contact-taxOffice'), null);
      assert.equal(document.querySelector('label[for="contact-name"]').textContent, 'Adı Soyadı *');
      assert.equal(document.getElementById('contact-email').required, false);
      await click(document.querySelector('input[value="Fasoncu"]'));
      assert.ok(body().includes('Fason Hizmetleri'));
      for (const service of ['Kesim', 'Nakış', 'Baskı', 'Dikim', 'Ütü & Paket', 'Diğer']) assert.ok([...document.querySelectorAll('.contact-services label')].some((n) => n.textContent === service));
      await click(button('Kaydet'));
      assert.equal(saved.name, 'Ali Veli'); assert.equal(saved.authorizedPerson, 'Eski yetkili'); assert.equal(saved.taxOffice, 'Eski vergi dairesi');
    });
    await t.test('Sipariş düzenleme, renk ayırma, beden serileri, hizmet filtreleri ve üretim güncelleme uçtan uca çalışır', async () => {
      await openStock(); const order = await savedOrder();
      const cutters = {};
      for (const service of ['Kesim', 'Nakış', 'Baskı', 'Dikim', 'Ütü & Paket']) cutters[service] = await contactRepository.create({ ...emptyContact, name: `${service} Firması`, roles: ['Fasoncu'], services: [service] });
      await act(async () => window.dispatchEvent(new dom.window.Event('storage')));
      await click(button('Detay')); await click(button('+ Üretim Kartı Oluştur'));
      await fill(field('Sipariş Kalemi'), order.items[0].id);
      for (const [label, service] of [['Kesimci / Atölye', 'Kesim'], ['Nakışçı', 'Nakış'], ['Baskıcı', 'Baskı'], ['Dikim Firması', 'Dikim'], ['Ütü/Paket Firması', 'Ütü & Paket']]) {
        assert.deepEqual([...field(label).options].map((o) => o.value).filter(Boolean), [cutters[service].id]);
      }
      await fill(field('Marka *'), 'PALO');
      const allocation = () => document.querySelector('input[aria-label="Beyaz Bu Üretime Al"]');
      await fill(allocation(), '101'); await click(button('Üretim Kartını Oluştur'));
      assert.match(document.querySelector('[role="alert"]').textContent, /en fazla miktar 100/);
      await fill(allocation(), '60');
      for (const [series, labels] of [['Yetişkin', ['S', 'M', 'L', 'XL', '2XL', '3XL']], ['Çocuk', ['2 Yaş', '4 Yaş', '6 Yaş', '8 Yaş', '10 Yaş', '12 Yaş', '14 Yaş']], ['Battal Boy', ['4XL', '5XL', '6XL']]]) {
        await fill(field('Beden Serisi'), series);
        for (const size of labels) assert.ok(field(size));
        assert.ok(![...document.querySelectorAll('label > span')].some((n) => n.textContent === 'Beyaz S'));
      }
      await fill(field('Beden Serisi'), 'Yetişkin'); await fill(field('M'), '59');
      await click(button('Üretim Kartını Oluştur'));
      assert.ok(body().includes('Beyaz: 100 / 60 / 40'));
      let cards = await workflowRepository.list(); assert.equal(cards.length, 1); assert.equal(cards[0].productName, 'Basic Polo 2026');
      await click(button('Düzenle / Güncelle'));
      await fill(field('Adet *'), '50'); await click(button('Sipariş Kartını Güncelle'));
      assert.match(document.querySelector('[role="alert"]').textContent, /60 adet daha önce üretime aktarılmıştır/);
      await fill(field('Adet *'), '100'); await fill(field('Ürün Adı / Model Adı *'), 'Yeni Model'); await fill(field('Genel Not'), 'Düzenlenen sipariş');
      await click(button('Sipariş Kartını Güncelle')); assert.ok(body().includes('Düzenlenen sipariş'));
      await click(button('+ Üretim Kartı Oluştur')); await fill(field('Sipariş Kalemi'), order.items[0].id);
      await fill(field('Marka *'), 'TOMMY'); await fill(allocation(), '40'); await fill(field('S'), '40');
      await click(button('Üretim Kartını Oluştur')); assert.ok(body().includes('Beyaz: 100 / 100 / 0'));
      cards = await workflowRepository.list(); assert.equal(cards.length, 2); assert.equal(cards[1].productName, 'Yeni Model');
      const link = [...document.querySelectorAll('a')].find((n) => n.textContent === 'Üretim Kartını Aç'); await click(link);
      await click(button('Düzenle / Güncelle'));
      assert.equal(field('Marka').readOnly, true);
      await fill(field('M'), '50'); await fill(field('L'), '10');
      await fill(field('Not'), 'Üretim güncellendi'); await fill(field('Nakışçı'), cutters['Nakış'].id);
      await click(button('Üretim Kartını Güncelle'));
      cards = await workflowRepository.list(); const edited = cards.find((p) => p.brand === 'PALO'); assert.equal(edited.note, 'Üretim güncellendi'); assert.equal(edited.embroideryCompanyId, cutters['Nakış'].id);
      assert.deepEqual(edited.sizeDistribution, { M: 50, L: 10 });
      assert.equal(edited.orderItemId, order.items[0].id);
    });
    await t.test('Açık sipariş formu başka ekranda güncellenen kaydın üzerine yazmaz', async () => {
      await openStock(); const order = await savedOrder();
      await click(button('Detay')); await click(button('Düzenle / Güncelle'));
      await fill(field('Genel Not'), 'Eski ekrandaki not');
      await workflowRepository.updateOrder(order.id, order.revision, { ...order, note: 'Diğer ekranda kaydedildi' });
      await act(async () => window.dispatchEvent(new dom.window.Event('storage')));
      await click(button('Sipariş Kartını Güncelle'));
      assert.match(document.querySelector('[role="alert"]').textContent, /başka bir işlemde değişti/);
      assert.equal((await workflowRepository.listOrders())[0].note, 'Diğer ekranda kaydedildi');
    });
    await t.test('Tedarikçi seçimleri rol ile sınırlıdır; eski firma seçimi güncellemede kaybolmaz', async () => {
      const { customer } = await mount();
      const { CompanySelect, Form } = await server.ssrLoadModule('/src/features/shared/WorkshopUI.tsx');
      const { SupplierSelect } = await server.ssrLoadModule('/src/features/products/Fields.tsx');
      const suppliers = {};
      for (const role of ['Kumaş Tedarikçisi', 'Malzeme Tedarikçisi', 'Hazır Giyim Tedarikçisi']) suppliers[role] = await contactRepository.create({ ...emptyContact, name: role, roles: [role] });
      const contacts = await contactRepository.list();
      for (const role of ['Kumaş Tedarikçisi', 'Malzeme Tedarikçisi']) {
        await act(async () => root.render(React.createElement(CompanySelect, { key: role, contacts, role })));
        assert.deepEqual([...document.querySelector('select').options].map((o) => o.value).filter(Boolean), [suppliers[role].id]);
      }
      await act(async () => root.render(React.createElement(SupplierSelect, { contacts, value: '', onChange() {} })));
      assert.deepEqual([...document.querySelector('select').options].map((o) => o.value).filter(Boolean), [suppliers['Hazır Giyim Tedarikçisi'].id]);
      let saved;
      await act(async () => root.render(React.createElement(Form, { onDone() {}, onSubmit: async (form) => { saved = form.get('companyId'); } }, React.createElement(CompanySelect, { contacts, role: 'Fasoncu', service: 'Kesim', value: customer.id }))));
      await click(button('Kaydet')); assert.equal(saved, customer.id);
    });
    await t.test('Menüler kapalı başlar ve Üretim başlığı tıklanınca açılır', async () => {
      await mount();
      assert.ok([...document.querySelectorAll('details.nav-group')].every((node) => !node.open));
      const summary = [...document.querySelectorAll('summary')].find((node) => node.textContent.includes('Üretim'));
      await click(summary); assert.equal(summary.parentElement.open, true);
      assert.ok(summary.parentElement.textContent.includes('Arşivlenen Siparişler'));
      await click(summary); assert.equal(summary.parentElement.open, false);
    });
    await t.test('Kalem ve form işlemleri ayrı; termin kaydı, düzenleme, liste ve üretim görünümü', async () => {
      await openStock();
      assert.ok(button('Sipariş Kalemini Kaldır').closest('.order-item-card'));
      assert.ok(button('+ Ürün Ekle').closest('.order-add-item'));
      assert.ok(!button('+ Ürün Ekle').closest('.ws-actions'));
      assert.equal(button('Vazgeç').parentElement, button('Sipariş Kartını Oluştur').parentElement);
      await click(button('+ Ürün Ekle'));
      assert.deepEqual([...document.querySelectorAll('.order-item-card h3')].map((n) => n.textContent), ['Sipariş Kalemi 1', 'Sipariş Kalemi 2']);
      await click([...document.querySelectorAll('.order-item-actions button')][1]);
      await fill(field('Termin Tarihi'), '2026-10-15');
      let order = await savedOrder(); assert.equal(order.dueDate, '2026-10-15');
      assert.ok(document.querySelector('time[datetime="2026-10-15"]'));
      await click(button('Detay')); assert.ok(document.querySelector('time[datetime="2026-10-15"]'));
      await click(button('Düzenle / Güncelle'));
      await fill(field('Termin Tarihi'), '2026-10-20'); await click(button('Sipariş Kartını Güncelle'));
      order = (await workflowRepository.listOrders())[0]; assert.equal(order.dueDate, '2026-10-20');
      await click(button('+ Üretim Kartı Oluştur')); await fill(field('Sipariş Kalemi'), order.items[0].id);
      await fill(field('Marka *'), 'PALO'); await fill(document.querySelector('[aria-label="Beyaz Bu Üretime Al"]'), '50'); await fill(field('S'), '1');
      assert.equal(document.querySelectorAll('.common-size-grid').length, 1);
      assert.equal(document.querySelectorAll('.common-size-grid input').length, 6);
      await click(button('Üretim Kartını Oluştur'));
      await click([...document.querySelectorAll('a')].find((n) => n.textContent === 'Üretim Kartını Aç'));
      assert.ok(document.querySelector('time[datetime="2026-10-20"]'));
      assert.equal(document.querySelectorAll('.common-size-table thead th').length, 6);
      assert.equal(document.querySelectorAll('.common-size-table tbody tr').length, 1);
      assert.ok(![...document.querySelectorAll('label > span')].some((n) => n.textContent.includes('Top Sayısı')));
      await click(button('Kesime Föy Hazırla'));
      assert.ok(document.querySelector('.production-paper').textContent.includes('PALO'));
      assert.ok(document.querySelector('.production-paper').textContent.includes(order.orderNo));
      const resultCells = [...document.querySelectorAll('.cutting-results tbody tr')][0].children;
      assert.equal(resultCells[0].textContent, 'Beyaz');
      for (const cell of [...resultCells].slice(1)) assert.equal(cell.textContent.trim(), '');
      await click(button('Üretime Dön'));
      await click(button('Kesim Sonucu Gir'));
      assert.equal(field('Top Sayısı *').value, '');
      assert.equal(field('Kg *').value, ''); assert.equal(field('Çıkan Adet *').value, '');
      await fill(field('Top Sayısı *'), '2'); await fill(field('Kg *'), '15'); await fill(field('Çıkan Adet *'), '50');
      await click(button('Kesim Sonucunu Kaydet'));
      assert.ok(body().includes('Kesim Tamamlandı'));
      assert.equal((await workflowRepository.list())[0].cuttingSheet.brandSections[0].rows[0].quantity, 50);
      assert.equal(document.querySelectorAll('.common-size-table').length, 1);
      await click(button('Listeye Dön'));
      assert.ok(document.querySelector('time[datetime="2026-10-20"]'));
    });
    await t.test('Arşiv normal listeden çıkar, arşivde görünür ve geri alınır; yeni sipariş başta', async () => {
      await openStock(); const first = await savedOrder();
      let second;
      await act(async () => { second = await workflowRepository.createOrder({ ...first, date: '2020-01-01' }); window.dispatchEvent(new Event('storage')); });
      assert.ok(document.querySelector('.ws-table tbody tr').textContent.includes(second.orderNo));
      const firstRow = [...document.querySelectorAll('.ws-table tbody tr')].find((n) => n.textContent.includes(first.orderNo));
      await click([...firstRow.querySelectorAll('button')].find((n) => n.textContent === 'Arşive At'));
      assert.ok(!document.querySelector('.ws-table tbody').textContent.includes(first.orderNo));
      assert.equal((await workflowRepository.listOrders()).find((o) => o.id === first.id).archived, true);
      await click([...document.querySelectorAll('a')].find((n) => n.textContent === 'Arşivlenen Siparişler' && n.closest('main')));
      assert.ok(document.querySelector('.ws-table tbody').textContent.includes(first.orderNo));
      await click(button('Arşivden Çıkar'));
      assert.ok(!document.querySelector('.ws-table tbody').textContent.includes(first.orderNo));
      await click([...document.querySelectorAll('a')].find((n) => n.textContent === 'Sipariş Kartları' && n.closest('main')));
      assert.ok(document.querySelector('.ws-table tbody').textContent.includes(first.orderNo));
    });
    await t.test('Müşteriler ortak repository kayıtlarını gösterir; çok rollü ve pasif müşteriler yönetilir', async () => {
      const { customer } = await mount({ path: '/firma-kisiler/musteriler' });
      await act(async () => {
        await contactRepository.create({ ...emptyContact, name: 'Sadece Tedarikçi', roles: ['Kumaş Tedarikçisi'] });
        await contactRepository.create({ ...emptyContact, name: 'Çok Rollü Müşteri', roles: ['Hazır Giyim Müşterisi', 'Kumaş Tedarikçisi'], status: 'Pasif' });
        window.dispatchEvent(new Event('storage'));
      });
      const table = document.querySelector('.contact-table');
      assert.ok(table.textContent.includes(customer.name)); assert.ok(table.textContent.includes('Çok Rollü Müşteri'));
      assert.ok(!table.textContent.includes('Sadece Tedarikçi'));
      assert.ok(document.querySelector('#contact-role-filter').disabled);
      await click(document.querySelector(`[aria-label="${customer.name} kaydını düzenle"]`));
      const status = [...document.querySelectorAll('select')].find((n) => [...n.options].map((o) => o.textContent).join('|') === 'Aktif|Pasif');
      assert.ok(status); await fill(status, 'Pasif'); await click(button('Kaydet'));
      assert.equal((await contactRepository.get(customer.id)).status, 'Pasif');
    });
    await t.test('Eski #/uretim/yeni route sipariş listesine açıklayıcı mesajla yönlenir', async () => {
      await mount({ path: '/uretim/yeni?id=old-production' });
      assert.equal(dom.window.location.hash, '#/uretim/siparisler');
      assert.equal(document.querySelector('h1').textContent, 'Sipariş Kartları');
      assert.ok(body().includes('Üretim Kartı oluşturmak için önce bir Sipariş Kartı açın veya mevcut Sipariş Kartından Üretim Kartı oluşturun.'));
    });
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'FormData', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[name];
  }
});
