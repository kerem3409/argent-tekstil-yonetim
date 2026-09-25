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
  const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true }, appType: 'custom' });
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
        const prototype = node.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
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
      await fill(field('Ürün *'), data.product.id);
      await fill(field('Renk *'), 'Beyaz');
      await fill(field('Adet *'), '100');
      await fill(field('Kumaş Adı *'), '  24/1 Penye  ');
      await fill(field('Gramaj *'), ' 180 ');
      return data;
    }
    async function savedOrder() {
      await click(button('Kaydet'));
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
        await click(button('Kaydet'));
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
      await click(button('Kaydet'));
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
      await click(button('Kaydet'));
      const summary = document.querySelector('[role="alert"]');
      assert.ok(summary);
      for (const text of ['Lütfen aşağıdaki zorunlu alanları tamamlayın:', 'Müşteri', 'Ürün', 'Kumaş Adı', 'Gramaj', 'En az bir renk ve adet']) assert.ok(summary.textContent.includes(text), text);
      assert.equal(summary.querySelectorAll('li').length, 5);
      assert.equal((await workflowRepository.listOrders()).length, 0);
      await click(button('Sipariş Kalemini Kaldır'));
      await click(button('Kaydet'));
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
