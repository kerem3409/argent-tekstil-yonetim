import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React, { act } from 'react';

test('Üretim Planları: gerçek formlar, tek detay, çıktılar ve yaşam döngüsü', async (t) => {
  let dom, root;
  function newDOM() {
    dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/#/uretim/planlar' });
    for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'FormData']) globalThis[key] = dom.window[key];
    dom.window.scrollTo = () => {}; globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  newDOM();
  const { createRoot } = await import('react-dom/client'); const { HashRouter } = await import('react-router-dom');
  const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { App } = await server.ssrLoadModule('/src/app/App.tsx');
    const { planRepository } = await server.ssrLoadModule('/src/data/production/index.ts');
    const { contactRepository } = await server.ssrLoadModule('/src/data/contacts/index.ts');
    const { productDefinitionRepository } = await server.ssrLoadModule('/src/data/productDefinitions/index.ts');
    const { emptyContact } = await server.ssrLoadModule('/src/features/contacts/model.ts');
    const { INTERNAL_CUSTOMER_ID } = await server.ssrLoadModule('/src/domain/productionPlan.ts');
    const body = () => document.body.textContent;
    const button = (name, within = document) => { const found = [...within.querySelectorAll('button')].find((b) => b.textContent === name); assert.ok(found, `Button ${name}`); return found; };
    const field = (name, within = document) => { const found = [...within.querySelectorAll('label')].find((l) => l.querySelector('span')?.textContent === name)?.querySelector('input,select,textarea'); assert.ok(found, `Field ${name}`); return found; };
    async function click(node) { await act(async () => node.click()); }
    async function fill(node, value) { await act(async () => { const proto = node.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value); node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
    async function navigate(path) { await act(async () => { window.location.hash = `#${path}`; await new Promise((r) => setTimeout(r, 25)); }); }
    async function waitFor(fn) { for (let i = 0; i < 100 && !fn(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); assert.ok(fn(), body()); }
    async function mount() {
      if (root) await act(async () => root.unmount()); dom.window.close(); newDOM();
      const product = await productDefinitionRepository.save({ name: 'Polo Türü', note: '', status: 'Aktif' });
      const customer = await contactRepository.create({ ...emptyContact, name: 'ABC Tekstil', roles: ['Hazır Giyim Müşterisi'], phone: '05551112233' });
      for (const s of ['Kesim', 'Nakış', 'Baskı', 'Dikim', 'Ütü & Paket']) await contactRepository.create({ ...emptyContact, name: `${s} Atölyesi`, roles: ['Fasoncu'], services: [s] });
      root = createRoot(document.getElementById('root')); await act(async () => root.render(React.createElement(HashRouter, null, React.createElement(App))));
      return { product, customer };
    }
    async function fillItem(index, product, brand = 'PALO') {
      const card = document.querySelectorAll('.order-item-card')[index];
      await fill(field('Ürün Tanımı / Türü *', card), product.id); await fill(field('Ürün / Model Adı *', card), `Model ${index + 1}`); await fill(field('Marka *', card), brand); await fill(field('Kumaş Türü / Adı *', card), 'Penye'); await fill(field('Renk *', card), 'Siyah'); await fill(field('İstenen Adet *', card), '500'); return card;
    }
    async function createPlan({ internal = false, count = 1, embroidery = false } = {}) {
      const { product, customer } = await mount(); await click(button('+ Üretim Planı Oluştur'));
      await fill(field('Üretim Planı Adı *'), 'Yaz Üretimi'); await fill(field('Müşteri *'), internal ? INTERNAL_CUSTOMER_ID : customer.id); await fill(field('Termin Tarihi *'), '2026-10-05'); await fill(field('Müşteri Referans No'), 'ÖZEL-REF'); await fill(field('Genel Not'), 'ABC Tekstil telefon 05551112233 fiyat 1000');
      for (let i = 0; i < count; i++) { if (i) await click(button('+ Ürün Kalemi Ekle')); const card = await fillItem(i, product, ['PALO', 'BUS', 'Markasız'][i]);
        if (!i) {
          assert.ok([...card.querySelectorAll('.common-size-input')].every((n) => n.value === '1'));
          await fill(field('Madde 1', card), 'Etiket içte'); await click(button('+ Madde Ekle', card)); await fill(field('Madde 2', card), 'Yaka ribana');
          await click(button('+ Malzeme Ekle', card)); await fill(field('Malzeme Adı *', card), 'İplik');
          if (embroidery) await click([...card.querySelectorAll('label')].find((n) => n.textContent.trim() === 'Nakış').querySelector('input'));
        }
      }
      await click(button('Üretim Planını Oluştur')); assert.equal(document.querySelector('[role=alert]'), null, body()); return (await planRepository.list())[0];
    }
    await t.test('3 ürün tek planda; gramaj, seri, dinamik listeler ve iki görünüm', async () => {
      const p = await createPlan({ count: 3 }); assert.equal(p.items.length, 3); assert.equal(p.items[0].gsm, ''); assert.equal(p.items[0].instructions.length, 2); assert.equal(p.items[0].materials[0].name, 'İplik'); assert.equal(p.items[2].brand, 'Markasız');
      await click(button('Planlara Dön')); assert.ok(body().includes('1 plan · 3 ürün kalemi')); assert.equal(document.querySelector('.ws-table tbody').rows.length, 1);
      await click(button('Ürün Kalemi Bazlı')); assert.equal(document.querySelector('.ws-table tbody').rows.length, 3);
      await fill(field('Marka'), 'BUS'); assert.equal(document.querySelector('.ws-table tbody').rows.length, 1); assert.ok(document.querySelector('.ws-table tbody').textContent.includes('BUS'));
      await fill(field('Marka'), ''); await fill(field('Durum'), 'Tamamlandı'); assert.ok(body().includes('Kayıt bulunmuyor'));
    });
    await t.test('Marka/termin zorunlu, Markasız seçimi ve ARGENT kimliği', async () => {
      const { product } = await mount(); await click(button('+ Üretim Planı Oluştur'));
      await fill(field('Üretim Planı Adı *'), 'Stok planı'); await fill(field('Müşteri *'), INTERNAL_CUSTOMER_ID); const card = await fillItem(0, product, '');
      assert.equal(field('Marka *', card).required, true); assert.equal(field('Termin Tarihi *').required, true); assert.equal(field('Gramaj', card).required, false);
      await click(button('Üretim Planını Oluştur')); assert.equal((await planRepository.list()).length, 0);
      await click(button('Markasız', card)); await fill(field('Termin Tarihi *'), '2026-10-05'); await click(button('Üretim Planını Oluştur'));
      const p = (await planRepository.list())[0]; assert.equal(p.customerId, INTERNAL_CUSTOMER_ID); assert.equal(p.items[0].brand, 'Markasız'); assert.ok(body().includes('Kendi stokumuz için üretim'));
    });
    await t.test('Tek detay: 510→505→500→498, firma filtreleri ve müşterisiz çıktılar', async () => {
      const p = await createPlan({ embroidery: true }), itemId = p.items[0].id;
      const before = window.localStorage.getItem('argent-tekstil.production.v1'); await click(button('Kesimci İçin Çıktı'));
      const paper = document.querySelector('.plan-technical-print'); assert.ok(paper.textContent.includes('PALO'));
      for (const secret of ['ABC Tekstil', '05551112233', '1000', 'ÖZEL-REF']) assert.ok(!paper.textContent.includes(secret));
      assert.equal(window.localStorage.getItem('argent-tekstil.production.v1'), before); await click(button('Plana Dön'));
      for (const [type, start, actual] of [['Kesim', 500, 510], ['Nakış', 510, 505], ['Dikim', 505, 500], ['Ütü & Paket', 500, 498]]) {
        let section = [...document.querySelectorAll('.plan-stage')].find((s) => s.querySelector('h3').textContent.startsWith(type));
        const company = field(`${type} Firması *`, section), choices = [...company.options].filter((o) => o.value); assert.deepEqual(choices.map((o) => o.textContent), [`${type} Atölyesi`]); await fill(company, choices[0].value);
        if (type === 'Nakış') { await fill(field('Nakış Notu 1', section), 'Logo tona ton'); await click(button('+ Madde Ekle', section)); await fill(field('Nakış Notu 2', section), 'Sol göğüs 8 cm'); await fill(section.querySelector('[name=color-note-0]'), 'Antrasit'); }
        await click(button(`${type} Başlat`, section)); assert.equal(document.querySelector('[role=alert]'), null, body());
        section = [...document.querySelectorAll('.plan-stage')].find((s) => s.querySelector('h3').textContent.startsWith(type));
        assert.equal(section.querySelector('input[readonly]').value, String(start)); assert.ok(!section.textContent.includes('Gönderilen Adet')); assert.equal(section.querySelector('[name=actual-0]').max, type === 'Kesim' ? '' : String(start));
        if (type === 'Nakış') { const saved = window.localStorage.getItem('argent-tekstil.production.v1'); await click(button('Nakışçı İçin Çıktı')); const doc = document.querySelector('.plan-technical-print'); for (const value of ['510', 'Antrasit', 'Logo tona ton']) assert.ok(doc.textContent.includes(value)); for (const secret of ['ABC Tekstil', '05551112233']) assert.ok(!doc.textContent.includes(secret)); assert.equal(window.localStorage.getItem('argent-tekstil.production.v1'), saved); await click(button('Plana Dön')); section = [...document.querySelectorAll('.plan-stage')].find((s) => s.querySelector('h3').textContent.startsWith(type)); }
        await fill(section.querySelector('[name=actual-0]'), String(actual)); await click(button(`${type} Sonucunu Kaydet`, section)); assert.equal(document.querySelector('[role=alert]'), null, body());
      }
      const after = (await planRepository.list())[0]; assert.equal(after.id, p.id); assert.equal(after.items[0].id, itemId); assert.ok(body().includes('Tamamlanan miktar: 498')); assert.ok(!body().includes('Üretim Kartı Oluştur')); assert.ok(!body().includes('Kesim Emri Oluştur'));
      await click(button('Planlara Dön')); await fill(field('Durum'), 'Tamamlandı'); assert.ok(document.querySelector('.ws-table tbody').textContent.includes(p.planNo));
    });
    await t.test('Arşiv/çöp/PIN ve eski adresler aynı plana gider', async () => {
      const p = await createPlan(), dialog = () => document.querySelector('[role=dialog]');
      await click(button('Arşive At')); await click(button('Arşive At', dialog()));
      await navigate('/uretim/planlar'); assert.ok(!document.querySelector('.ws-table tbody').textContent.includes(p.planNo));
      await navigate('/uretim/arsivler'); await click(button('Detay')); await click(button('Arşivden Çıkar')); await click(button('Arşivden Çıkar', dialog()));
      await planRepository.deletionPin.setup('123456', '123456'); await click(button('Sil')); await waitFor(() => !!document.querySelector('input[type=password]')); await fill(field('Silme Şifresi / PIN'), '123456'); await click(button('Çöp Kutusuna Taşı', dialog())); await waitFor(() => !dialog()); assert.equal((await planRepository.list())[0].deleted, true);
      await navigate('/uretim/cop-kutusu'); await click(button('Detay')); await click(button('Çöp Kutusundan Geri Yükle')); await click(button('Çöp Kutusundan Geri Yükle', dialog())); assert.equal((await planRepository.list())[0].deleted, false);
      await navigate(`/uretim/siparisler?id=${p.id}`); assert.ok(window.location.hash.startsWith('#/uretim/planlar')); assert.ok(body().includes(p.planNo));
      const menu = [...document.querySelectorAll('summary')].find((s) => s.querySelector('span')?.textContent === 'Üretim').parentElement; assert.deepEqual([...menu.querySelectorAll('a')].map((a) => a.textContent), ['Üretim Planları', 'Arşiv', 'Çöp Kutusu']);
    });
  } finally {
    if (root) await act(async () => root.unmount()); await server.close(); dom.window.close();
    for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'FormData', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
  }
});
