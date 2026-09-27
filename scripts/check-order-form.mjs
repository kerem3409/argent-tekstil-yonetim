import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React, { act } from 'react';

test('Üretim siparişleri: gerçek formlar, tek detay, çıktılar ve yaşam döngüsü', async (t) => {
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
    const { orderRepository } = await server.ssrLoadModule('/src/data/production/index.ts');
    const { contactRepository } = await server.ssrLoadModule('/src/data/contacts/index.ts');
    const { productDefinitionRepository } = await server.ssrLoadModule('/src/data/productDefinitions/index.ts');
    const { emptyContact } = await server.ssrLoadModule('/src/features/contacts/model.ts');
    const { INTERNAL_CUSTOMER_ID } = await server.ssrLoadModule('/src/domain/productionPlan.ts');
    const body = () => document.body.textContent;
    const tracking = () => document.querySelector('.order-quantity-tracking');
    const trackingRows = () => [...tracking().querySelectorAll('tbody tr')].map((row) => [...row.cells].map((c) => c.textContent));
    const button = (name, within = document) => { const found = [...within.querySelectorAll('button,a')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name); assert.ok(found, `Button ${name}`); return found; };
    const field = (name, within = document) => { const found = [...within.querySelectorAll('label')].find((l) => l.querySelector('span')?.textContent === name)?.querySelector('input,select,textarea'); assert.ok(found, `Field ${name}`); return found; };
    async function click(node) { await act(async () => node.click()); }
    async function fill(node, value) { await act(async () => { const proto = node.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value); node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
    async function navigate(path) { await act(async () => { window.location.hash = `#${path}`; await new Promise((r) => setTimeout(r, 25)); }); }
    async function waitFor(fn) { for (let i = 0; i < 100 && !fn(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); assert.ok(fn(), body()); }
    async function mount(noEmbroideryFirm = false) {
      if (root) await act(async () => root.unmount()); dom.window.close(); newDOM();
      const product = await productDefinitionRepository.save({ name: 'Polo Türü', note: '', status: 'Aktif' });
      const customer = await contactRepository.create({ ...emptyContact, name: 'ABC Tekstil', roles: ['Hazır Giyim Müşterisi'], phone: '05551112233' });
      for (const s of ['Kesim', 'Nakış', 'Baskı', 'Dikim', 'Ütü & Paket']) if (!(noEmbroideryFirm && s === 'Nakış')) await contactRepository.create({ ...emptyContact, name: `${s} Atölyesi`, roles: ['Fasoncu'], services: [s] });
      root = createRoot(document.getElementById('root')); await act(async () => root.render(React.createElement(HashRouter, null, React.createElement(App))));
      return { product, customer };
    }
    async function createOrder({ internal = false, embroidery = false, printing = false, pause = false, noEmbroideryFirm = false, fresh = true, customer, product } = {}) {
      if (fresh) ({ customer, product } = await mount(noEmbroideryFirm));
      const brand = await orderRepository.createBrand('PALO');
      await navigate(`/uretim/siparisler?islem=yeni${customer ? `&customerId=${customer.id}` : ''}`);
      await waitFor(() => !!document.querySelector('form'));
      assert.equal(field('Müşteri *').value, customer?.id ?? '');
      if (internal) await fill(field('Müşteri *'), INTERNAL_CUSTOMER_ID);
      await fill(field('Sipariş Adı *'), 'Yaz Siparişi'); await fill(field('Termin Tarihi *'), '2026-10-05');
      await fill(field('Müşteri Referans No'), 'ÖZEL-REF'); await fill(field('Müşteri Sipariş Notu'), 'ABC Tekstil 05551112233 fiyat 1000');
      await fill(field('Ürün Türü / Tanımı *'), product.id); await fill(field('Ürün / Model Adı *'), 'Polo Model');
      // Brand created outside the mounted page is selected through the same quick-create flow.
      await click(button('Yeni Marka')); await fill(field('Marka Adı *'), 'PALO'); await click(button('Marka Kaydet'));
      assert.equal(field('Marka *').value, brand.id);
      await fill(field('Kumaş Türü / Adı *'), 'Penye'); await fill(field('Renk *'), 'Siyah'); await fill(field('Adet *'), '500');
      assert.equal(field('Gramaj').required, false); assert.equal(field('Marka *').required, true);
      assert.ok([...document.querySelectorAll('.common-size-input')].every((n) => n.value === '1'));
      await fill(field('Madde 1'), 'Etiket içte'); await click(document.querySelector('[aria-label="Madde ekle"]')); await fill(field('Madde 2'), 'Yaka ribana');
      await fill(field('Paket Tipi'), 'Poşet'); await fill(field('Bir Pakette Kaç Ürün'), '5');
      if (embroidery) { await click(button('Var', document.querySelector('[aria-label="Nakış"]'))); await click(document.querySelector('[aria-label="Nakış Notu ekle"]')); await fill(field('Nakış Notu 1'), 'Logo tona ton'); await fill(field('Nakış Konumu'), 'Sol göğüs'); await fill(field('Nakış Ölçüsü'), '8 cm'); assert.ok(!body().includes('Nakış Açıklaması')); }
      if (printing) { await click(button('Var', document.querySelector('[aria-label="Baskı"]'))); await click(button('Baskı Notu ekle')); await fill(field('Baskı Notu 1'), 'Beyaz baskı'); await fill(field('Baskı Konumu'), 'Ön göğüs'); await fill(field('Baskı Ölçüsü'), '10 cm'); assert.ok(!body().includes('Baskı Rengi / Bilgisi')); }
      if (pause) return window.location.hash;
      await click(button('Siparişi Kaydet')); assert.equal(document.querySelector('[role=alert]'), null, body());
      return (await orderRepository.list()).at(-1);
    }
    await t.test('Müşteri kartından üç ayrı tek ürün siparişi, müşteri ön seçimi ve sayılar', async () => {
      const fixture = await mount();
      for (let i = 0; i < 3; i++) {
        await navigate(`/firma-kisiler/musteriler?islem=detay&id=${fixture.customer.id}`);
        await click(button('+ Yeni Sipariş')); assert.equal(field('Müşteri *').value, fixture.customer.id);
        await createOrder({ ...fixture, fresh: false });
      }
      const orders = await orderRepository.list(); assert.equal(orders.length, 3); assert.ok(orders.every((o) => o.product && !('items' in o)));
      assert.equal(orders[0].product.gsm, ''); assert.equal(orders[0].product.instructions.length, 2); assert.equal(orders[0].product.packaging.unitsPerPack, 5);
      await navigate(`/firma-kisiler/musteriler?islem=detay&id=${fixture.customer.id}`); assert.ok(body().includes('Toplam Sipariş: 3')); assert.ok(body().includes('Devam Eden: 3'));
      await navigate('/uretim/siparisler'); assert.equal(document.querySelector('.ws-table tbody').rows.length, 3);
      assert.ok(!body().includes('Plan Bazlı')); assert.ok(!body().includes('Ürün Kalemi'));
      await click(button('+ Yeni Sipariş')); assert.equal(field('Müşteri *').value, '');
      assert.ok(![...field('Marka *').options].some((o) => o.textContent === 'Markasız'));
      await click(button('Yeni Müşteri')); await fill(field('Müşteri Adı *'), 'Yeni Müşteri'); await click(button('Müşteri Kaydet')); assert.ok(field('Müşteri *').selectedOptions[0].textContent === 'Yeni Müşteri');
      await click(button('Yeni Ürün')); await fill(field('Ürün Adı *'), 'Sweatshirt'); await click(button('Ürün Kaydet')); assert.equal(field('Ürün Türü / Tanımı *').selectedOptions[0].textContent, 'Sweatshirt');
      await click(button('Yeni Marka')); await fill(field('Marka Adı *'), 'Markasız'); await click(button('Marka Kaydet')); assert.equal(field('Marka *').selectedOptions[0].textContent, 'Markasız');
      await click(document.querySelector('[aria-label="Renk ekle"]')); assert.equal(document.querySelectorAll('.order-color-editor').length, 2); await click(document.querySelector('[aria-label="Renk 2 sil"]')); assert.equal(document.querySelectorAll('.order-color-editor').length, 1);
    });
    await t.test('ARGENT müşterisine birden fazla sipariş', async () => {
      const fixture = await mount(); await createOrder({ ...fixture, fresh: false, internal: true }); await createOrder({ ...fixture, fresh: false, internal: true });
      assert.ok(body().includes('Kendi stokumuz için üretim'));
      await navigate(`/firma-kisiler/musteriler?islem=detay&id=${INTERNAL_CUSTOMER_ID}`); assert.ok(body().includes('Toplam Sipariş: 2'));
    });
    await t.test('Taslak: ayrılma, yeniden açma, yenileme ve tek kez siparişe dönüşüm', async () => {
      const draftUrl = await createOrder({ embroidery: true, pause: true });
      const original = JSON.parse(window.localStorage.getItem('argent-tekstil.order-drafts.v1'))[0];
      assert.equal(original.input.name, 'Yaz Siparişi'); assert.equal(original.input.product.embroidery.position, 'Sol göğüs'); assert.equal((await orderRepository.list()).length, 0);
      await navigate('/uretim/siparisler'); await fill(field('Durum'), 'Taslak'); await click(button('Taslağa Devam Et'));
      assert.equal(field('Sipariş Adı *').value, 'Yaz Siparişi'); assert.equal(field('Paket Tipi').value, 'Poşet');
      await act(async () => root.unmount()); root = createRoot(document.getElementById('root')); await act(async () => root.render(React.createElement(HashRouter, null, React.createElement(App))));
      assert.equal(field('Ürün / Model Adı *').value, 'Polo Model'); assert.equal(field('Nakış Ölçüsü').value, '8 cm'); assert.equal(field('Madde 2').value, 'Yaka ribana');
      await click(button('Siparişi Kaydet')); assert.equal((await orderRepository.list()).length, 1);
      await navigate('/uretim/siparisler'); await fill(field('Durum'), 'Taslak'); assert.ok(body().includes('Kayıt bulunmuyor'));
      assert.ok(draftUrl.includes('draft='));
    });
    async function planAll({ quickEmbroidery = false } = {}) {
      for (const row of [...document.querySelectorAll('.stage-plan-row')]) {
        const type = row.dataset.stage;
        if (type === 'Nakış' && quickEmbroidery) {
          await click(button('Yeni Nakış Firması', row)); assert.ok(document.querySelector('[role=dialog]'));
          await fill(field('Firma Adı *'), 'Yeni Nakış Atölyesi'); await click(button('Firma Kaydet'));
          assert.equal(field('Nakış Firması', row).selectedOptions[0].textContent, 'Yeni Nakış Atölyesi');
          const c = (await contactRepository.list()).find((c) => c.name === 'Yeni Nakış Atölyesi'); assert.deepEqual(c.services, ['Nakış']); assert.deepEqual(c.roles, ['Fasoncu']);
        } else { const company = field(`${type} Firması`, row); const options = [...company.options].filter((o) => o.value); assert.deepEqual(options.map((o) => o.textContent), [`${type} Atölyesi`]); await fill(company, options[0].value); }
        await fill(field(`${type} Planlanan Başlangıç Tarihi`, row), '2026-10-01'); await fill(field(`${type} Termin Tarihi`, row), '2026-10-05');
      }
      await click(button('Planlamayı Kaydet')); assert.equal(document.querySelector('[role=alert]'), null, body());
    }
    await t.test('Ön planlama, başlatma, güncel föyler, düzeltme ve stok', async () => {
      const p = await createOrder({ embroidery: true, printing: true, noEmbroideryFirm: true });
      assert.ok(body().includes('Föyler')); assert.equal(document.querySelectorAll('.plan-stage').length, 0);
      const detailHeadings = [...new Set([...document.querySelectorAll('.plan-detail-grid > div h2')].map((h) => h.textContent))];
      assert.deepEqual(detailHeadings.slice(1, 8), ['Ürün Bilgileri', 'Ürün Özellikleri', 'Renk ve Adetler', 'Seri / Beden Bilgisi', 'Nakış Bilgileri', 'Baskı Bilgileri', 'Paket / Ambalaj Bilgisi']);
      assert.ok(document.querySelector('.plan-status-panel').textContent.includes('Sipariş Adedi: 500'));
      assert.equal(document.querySelectorAll('.stage-completed-quantity').length, 0);
      const before = window.localStorage.getItem('argent-tekstil.production.v1');
      await click(button('Genel Sipariş Föyü')); let paper = document.querySelector('.plan-technical-print');
      for (const value of ['ABC Tekstil', 'ÖZEL-REF', 'Penye', 'Poşet', 'Sol göğüs', 'Etiket içte', 'Beyaz baskı']) assert.ok(paper.textContent.includes(value), value);
      await click(button('Siparişe Dön'));
      for (const name of ['Kesimci Föyü', 'Nakışçı Föyü', 'Baskıcı Föyü', 'Dikim Föyü', 'Ütü / Paket Föyü']) {
        await click(button(name)); paper = document.querySelector('.plan-technical-print'); assert.ok(paper.textContent.includes('PALO'));
        assert.equal(paper.querySelectorAll('.sheet-quantity-table table').length, 1);
        assert.ok(!paper.textContent.includes('Güncel Üretim Sonucu'));
        assert.deepEqual([...paper.querySelector('.sheet-quantity-table tbody tr').cells].map((c) => c.textContent), name === 'Kesimci Föyü' ? ['Siyah', '500', '—', '—', '—', '—'] : ['Siyah', '500', '—', '—', '—']);
        for (const secret of ['ABC Tekstil', '05551112233', '1000', 'ÖZEL-REF']) assert.ok(!paper.textContent.includes(secret));
        assert.equal(window.localStorage.getItem('argent-tekstil.production.v1'), before); await click(button('Siparişe Dön'));
      }
      await planAll({ quickEmbroidery: true }); const planned = (await orderRepository.list())[0]; assert.equal(planned.product.stages.length, 0); assert.equal(planned.stagePlans.length, 5);
      await click(button('Üretime Başla'));
      const labels = { Kesim: 'Kesimi Başlat', Nakış: 'Nakışı Başlat', Baskı: 'Baskıyı Başlat', Dikim: 'Dikimi Başlat', 'Ütü & Paket': 'Ütü/Paketi Başlat' };
      const sheets = { Kesim: 'Kesimci Föyü', Nakış: 'Nakışçı Föyü', Baskı: 'Baskıcı Föyü', Dikim: 'Dikim Föyü', 'Ütü & Paket': 'Ütü / Paket Föyü' };
      for (const [type, start, actual] of [['Kesim', 500, 510], ['Nakış', 510, 505], ['Baskı', 505, 503], ['Dikim', 503, 500], ['Ütü & Paket', 500, 498]]) {
        const section = () => [...document.querySelectorAll('.plan-stage')].find((s) => s.querySelector('h3').textContent.startsWith(type));
        await click(button(labels[type], section())); assert.equal(document.querySelector('[role=alert]'), null, body());
        assert.equal(section().open, true);
        assert.ok(body().includes(type === 'Nakış' ? 'Yeni Nakış Atölyesi' : `${type} Atölyesi`));
        assert.equal(section().querySelectorAll('table').length, 1); assert.equal(section().querySelector('[aria-label="Siyah başlangıç"]').value, String(start));
        assert.ok(!section().textContent.includes('Sonuç Tarihi')); assert.ok(!section().textContent.includes('Renk Notu'));
        await fill(section().querySelector('[name=actual-0]'), String(actual));
        if (type === 'Kesim') { await fill(section().querySelector('[aria-label="Siyah Top"]'), '10'); await fill(section().querySelector('[aria-label="Siyah Kg"]'), '210'); assert.ok(section().textContent.includes('+10 adet')); }
        else assert.ok(section().textContent.includes(`${start - actual} fire`));
        let confirms = 0; window.confirm = () => { confirms++; return false; }; const hash = window.location.hash; await click(document.querySelector('a[href="#/"]')); assert.equal(confirms, 1); assert.equal(window.location.hash, hash);
        await click(button(`${type === 'Ütü & Paket' ? 'Ütü/Paket' : type} Sonucunu Kaydet`, section())); assert.equal(document.querySelector('[role=alert]'), null, body());
        assert.equal(section().querySelectorAll('table').length, 1); assert.ok(section().textContent.includes('TOPLAM'));
        assert.equal(section().open, false);
        const summary = section().querySelector('summary');
        for (const value of ['Tamamlandı', 'Firma:', 'Planlanan Başlangıç:', '2026-10-01', 'Termin:', '2026-10-05']) assert.ok(summary.textContent.includes(value), value);
        assert.equal(summary.querySelector('table'), null);
        await click(summary); assert.equal(section().open, true);
        await click(summary); assert.equal(section().open, false);
        const panelRow = [...document.querySelectorAll('.plan-process li')].find((r) => r.textContent.startsWith(type));
        assert.equal(panelRow.querySelector('.stage-completed-quantity').textContent.trim(), String(actual));
        for (const row of document.querySelectorAll('.plan-process li:not(.done)')) assert.equal(row.querySelector('.stage-completed-quantity'), null);
        const headers = [...tracking().querySelectorAll('th')].map((c) => c.textContent);
        const column = headers.indexOf(type === 'Ütü & Paket' ? 'Ütü/Paket' : type);
        assert.equal(trackingRows()[0][column], String(actual));
        assert.equal(trackingRows().at(-1)[column], String(actual));
        assert.equal(trackingRows()[0].at(-1), String(actual));
        const raw = window.localStorage.getItem('argent-tekstil.production.v1'); await click(button(sheets[type])); paper = document.querySelector('.plan-technical-print'); for (const value of [String(actual), '2026-10-05', type === 'Nakış' ? 'Yeni Nakış Atölyesi' : `${type} Atölyesi`]) assert.ok(paper.textContent.includes(value), value); assert.ok(!paper.textContent.includes('ABC Tekstil')); assert.equal(window.localStorage.getItem('argent-tekstil.production.v1'), raw);
        const quantityTable = paper.querySelector('.sheet-quantity-table table');
        assert.deepEqual([...quantityTable.tBodies[0].rows[0].cells].map((c) => c.textContent), type === 'Kesim' ? ['Siyah', '500', String(actual), 'Fark +10', '10', '210'] : ['Siyah', '500', String(start), String(actual), `${start - actual} Fire`]);
        assert.deepEqual([...quantityTable.tBodies[0].rows[1].cells].map((c) => c.textContent), type === 'Kesim' ? ['TOPLAM', '500', String(actual), 'Fark +10', '10', '210'] : ['TOPLAM', '500', String(start), String(actual), `${start - actual} Fire`]);
        assert.ok(!paper.textContent.includes('Güncel Üretim Sonucu'));
        await click(button('Siparişe Dön'));
      }
      // A consistent correction updates downstream input after explicit confirmation.
      const embroidery = () => [...document.querySelectorAll('.plan-stage')].find((s) => s.querySelector('h3').textContent.startsWith('Nakış'));
      await click(embroidery().querySelector('summary')); assert.equal(embroidery().open, true);
      await fill(embroidery().querySelector('[name=actual-0]'), '504'); let warning = ''; window.confirm = (message) => { warning = message; return true; };
      await click(button('Nakış Sonucunu Kaydet', embroidery())); assert.ok(warning.includes('Baskı başlangıç')); assert.equal(document.querySelector('[role=alert]'), null, body());
      const printStage = [...document.querySelectorAll('.plan-stage')].find((s) => s.querySelector('h3').textContent.startsWith('Baskı')); assert.equal(printStage.querySelector('[aria-label="Siyah başlangıç"]').value, '504');
      await fill(field('Nakış Termin Tarihi'), '2026-10-08'); await click(button('Planlamayı Kaydet')); assert.equal((await orderRepository.list())[0].stagePlans.find((p) => p.type === 'Nakış').dueDate, '2026-10-08');
      assert.deepEqual(trackingRows().at(-1), ['TOPLAM', '500', '510', '504', '503', '500', '498', '498']);
      assert.ok(tracking().textContent.includes('Genel Fark: 2 fire'));
      assert.equal((await orderRepository.list())[0].id, p.id); assert.ok(body().includes('Tamamlanan sağlam ürün: 498')); assert.ok(body().includes('Stoğa Aktarılmayı Bekliyor'));
      await click(button('Stoğa Aktar')); assert.ok(body().includes('Stoğa Aktarıldı')); await click(button('Siparişlere Dön')); await fill(field('Durum'), 'Stoğa Aktarıldı'); assert.ok(document.querySelector('.ws-table tbody').textContent.includes(p.orderNo)); assert.ok(button('DETAY').textContent === 'DETAY');
    });
    await t.test('İki renk aynı tablo ve doğru toplam; sonuç tarihi kullanıcıdan istenmez', async () => {
      await createOrder({ pause: true }); await click(button('Renk ekle'));
      const second = document.querySelectorAll('.order-color-editor')[1]; await fill(field('Renk *', second), 'Beyaz'); await fill(field('Adet *', second), '300');
      await click(button('Siparişi Kaydet')); await planAll(); await click(button('Üretime Başla')); await click(button('Kesimi Başlat'));
      const section = document.querySelector('.plan-stage');
      for (const [color, amount, rolls, kg] of [['Siyah', 510, 10, 210], ['Beyaz', 295, 6, 125]]) { await fill(section.querySelector(`[aria-label="${color} Kesim çıkan"]`), String(amount)); await fill(section.querySelector(`[aria-label="${color} Top"]`), String(rolls)); await fill(section.querySelector(`[aria-label="${color} Kg"]`), String(kg)); }
      assert.deepEqual([...section.querySelector('tbody').lastElementChild.cells].map((c) => c.textContent), ['TOPLAM', '800', '805', '16', '335', '+5 adet']);
      await click(button('Kesim Sonucunu Kaydet', section)); assert.equal(document.querySelector('[role=alert]'), null, body()); assert.ok(!section.textContent.includes('Sonuç Tarihi'));
      assert.deepEqual([...tracking().querySelectorAll('th')].map((c) => c.textContent), ['Renk', 'Sipariş', 'Kesim', 'Dikim', 'Ütü/Paket', 'Tamamlanan']);
      assert.deepEqual(trackingRows(), [['Siyah', '500', '510', '—', '—', '510'], ['Beyaz', '300', '295', '—', '—', '295'], ['TOPLAM', '800', '805', '—', '—', '805']]);
      assert.ok(tracking().textContent.includes('Genel Fark: +5 adet'));
      for (const [type, quantities] of [['Dikim', [500, 294]], ['Ütü & Paket', [480, 292]]]) {
        await click(button(type === 'Dikim' ? 'Dikimi Başlat' : 'Ütü/Paketi Başlat'));
        const stage = [...document.querySelectorAll('.plan-stage')].find((s) => s.querySelector('h3').textContent.startsWith(type));
        for (let i = 0; i < quantities.length; i++) await fill(stage.querySelector(`[name=actual-${i}]`), String(quantities[i]));
        await click(button(type === 'Dikim' ? 'Dikim Sonucunu Kaydet' : 'Ütü/Paket Sonucunu Kaydet', stage));
      }
      assert.deepEqual(trackingRows(), [['Siyah', '500', '510', '500', '480', '480'], ['Beyaz', '300', '295', '294', '292', '292'], ['TOPLAM', '800', '805', '794', '772', '772']]);
      assert.ok(tracking().textContent.includes('Genel Fark: 28 fire'));
      const panel = document.querySelector('.plan-status-panel');
      assert.ok(panel.textContent.includes('Sipariş Adedi: 800'));
      assert.ok(!panel.textContent.includes('Nakış')); assert.ok(!panel.textContent.includes('Baskı'));
      assert.deepEqual([...panel.querySelectorAll('.stage-completed-quantity')].map((n) => n.textContent.trim()), ['805', '794', '772']);
    });
    await t.test('Var/Yok ve üretim başladıktan sonra özellik düzenleme, ekleme, silme ve yenileme', async () => {
      await createOrder({ pause: true });
      for (const label of ['Düşük Omuz', 'Yırtmaç']) {
        const group = document.querySelector(`[aria-label="${label}"]`);
        for (const value of ['Var', 'Yok', 'Var']) {
          await click(button(value, group));
          assert.equal(group.querySelectorAll('[aria-pressed=true]').length, 1);
          assert.equal(group.querySelector('[aria-pressed=true]').textContent, value);
        }
      }
      await click(button('Siparişi Kaydet')); await planAll(); await click(button('Üretime Başla')); await click(button('Kesimi Başlat'));
      const before = (await orderRepository.list())[0];
      await click(button('Ürün Özelliklerini Düzenle'));
      await click(button('Yok', document.querySelector('[aria-label="Düşük Omuz"]')));
      await click(button('Yok', document.querySelector('[aria-label="Yırtmaç"]')));
      await fill(field('Madde 1'), 'Düşük omuz olmayacak');
      await click(button('Madde ekle')); await fill(field('Madde 3'), 'Kol ribanası dar olacak');
      await click(button('Madde 2 sil')); await click(button('Özellikleri Kaydet'));
      assert.equal(document.querySelector('[role=alert]'), null, body());
      // Remount the app against the same persisted storage, as a reload does.
      await act(async () => root.unmount()); root = createRoot(document.getElementById('root'));
      await act(async () => root.render(React.createElement(HashRouter, null, React.createElement(App))));
      await click(button('Ürün Özelliklerini Düzenle'));
      assert.equal(field('Madde 1').value, 'Düşük omuz olmayacak'); assert.equal(field('Madde 2').value, 'Kol ribanası dar olacak');
      for (const label of ['Düşük Omuz', 'Yırtmaç']) assert.equal(document.querySelector(`[aria-label="${label}"] [aria-pressed=true]`).textContent, 'Yok');
      const after = (await orderRepository.list())[0]; assert.deepEqual(after.product.stages, before.product.stages); assert.deepEqual(after.stagePlans, before.stagePlans); assert.deepEqual(after.product.colors, before.product.colors);
      assert.deepEqual(after.product.instructions, ['Düşük omuz olmayacak', 'Kol ribanası dar olacak']);
    });
    await t.test('Aktif planlar: filtreli üçlü arşiv, geri alma, iki kayıt ve tek PIN ile çöp', async () => {
      const fixture = await mount(), orders = [];
      for (let i = 0; i < 3; i++) orders.push(await createOrder({ ...fixture, fresh: false }));
      const other = await createOrder({ ...fixture, fresh: false, internal: true });
      await navigate('/uretim/siparisler');
      const selectAll = () => [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Tümünü Seç')).querySelector('input');
      await click(document.querySelector(`[aria-label="${other.orderNo} seç"]`));
      await fill(field('Müşteri'), fixture.customer.id); assert.ok(body().includes('0 seçili'));
      await click(selectAll()); assert.ok(body().includes('3 seçili'));
      await click(button('Seçilenleri Arşive At')); assert.equal((await orderRepository.list()).filter((o) => o.archived).length, 0);
      await click(button('İşlemi Onayla')); await waitFor(() => !document.querySelector('[role=dialog]'));
      assert.equal((await orderRepository.list()).filter((o) => o.archived).length, 3); assert.ok(!(await orderRepository.list()).find((o) => o.id === other.id).archived);
      await navigate('/uretim/arsivler'); await click(selectAll()); await click(button('Seçilenleri Arşivden Çıkar')); await click(button('İşlemi Onayla'));
      await navigate('/uretim/siparisler');
      for (const o of orders.slice(0, 2)) await click(document.querySelector(`[aria-label="${o.orderNo} seç"]`));
      assert.ok(selectAll().indeterminate); assert.ok(body().includes('2 seçili'));
      await click(button('Seçilenleri Sil'));
      await fill(field('Silme Şifresi / PIN'), '123456'); await fill(field('PIN Tekrar'), '123456'); await click(button('PIN Belirle'));
      await waitFor(() => !body().includes('PIN Tekrar'));
      assert.equal(document.querySelectorAll('input[type=password]').length, 1);
      await click(button('İşlemi Onayla')); await waitFor(() => !document.querySelector('[role=dialog]'));
      assert.equal((await orderRepository.list()).filter((o) => o.deleted).length, 2);
      await navigate('/uretim/cop-kutusu'); assert.equal(document.querySelector('tbody').rows.length, 2);
      await click(button('DETAY')); await click(button('Çöp Kutusundan Geri Yükle')); await click(button('Çöp Kutusundan Geri Yükle', document.querySelector('[role=dialog]')));
      assert.equal((await orderRepository.list()).filter((o) => o.deleted).length, 1);
    });
    await t.test('Canlı Üretim ekranı ürün toplamı ve sipariş detayına geçiş', async () => {
      const fixture = await mount(); const first = await createOrder({ ...fixture, fresh: false }); await planAll(); await click(button('Üretime Başla')); await click(button('Kesimi Başlat'));
      const second = await createOrder({ ...fixture, fresh: false, internal: true }); await planAll(); await click(button('Üretime Başla')); await click(button('Kesimi Başlat'));
      await navigate('/uretim/canli'); const table = document.querySelector('table'); assert.equal(table.tBodies[0].rows.length, 1); assert.deepEqual([...table.tBodies[0].rows[0].cells].slice(1).map((c) => c.textContent), ['1000', '1000', '0', '0', '0', '0']);
      await click(button('Polo Türü')); assert.ok(body().includes(first.orderNo)); assert.ok(body().includes(second.orderNo)); assert.ok(body().includes('ABC Tekstil')); assert.ok(body().includes('ARGENT')); await click(button('DETAY')); assert.ok(body().includes('Üretim Planlama'));
    });
    await t.test('Arşiv: görünenleri seç, üçlü geri yükle, PIN ile toplu çöp', async () => {
      const fixture = await mount(); for (let i = 0; i < 3; i++) { const o = await createOrder({ ...fixture, fresh: false }); await orderRepository.setArchived(o.id, o.revision, true); }
      const other = await createOrder({ ...fixture, fresh: false, internal: true }); await orderRepository.setArchived(other.id, other.revision, true);
      await navigate('/uretim/arsivler'); await fill(field('Müşteri'), fixture.customer.id); await click([...document.querySelectorAll('label')].find((l) => l.textContent.includes('Tümünü Seç')).querySelector('input'));
      assert.ok(body().includes('3 seçili')); await click(button('Seçilenleri Arşivden Çıkar')); await click(button('İşlemi Onayla')); assert.equal((await orderRepository.list()).filter((o) => o.archived).length, 1);
      for (const o of (await orderRepository.list()).filter((o) => !o.archived)) await orderRepository.setArchived(o.id, o.revision, true);
      await navigate('/uretim/siparisler'); await navigate('/uretim/arsivler'); await orderRepository.deletionPin.setup('123456', '123456');
      await click([...document.querySelectorAll('label')].find((l) => l.textContent.includes('Tümünü Seç')).querySelector('input')); await click(button('Seçilenleri Sil')); await fill(field('Silme Şifresi / PIN'), '123456'); await click(button('İşlemi Onayla'));
      // PIN verification is asynchronous; wait for the successful operation to close the dialog.
      await waitFor(() => !document.querySelector('[role=dialog]'));
      assert.equal((await orderRepository.list()).filter((o) => o.deleted).length, 4);
    });
    await t.test('Arşiv/geri alma, PIN/çöp/geri yükleme ve eski adres yönlendirmesi', async () => {
      const p = await createOrder(), dialog = () => document.querySelector('[role=dialog]');
      await click(button('Arşive At')); await click(button('Arşive At', dialog()));
      await navigate('/uretim/siparisler'); assert.ok(!document.querySelector('.ws-table tbody').textContent.includes(p.orderNo));
      await navigate('/uretim/arsivler'); await click(button('DETAY')); await click(button('Arşivden Çıkar')); await click(button('Arşivden Çıkar', dialog()));
      await orderRepository.deletionPin.setup('123456', '123456'); await click(button('Sil')); await waitFor(() => !!document.querySelector('input[type=password]')); await fill(field('Silme Şifresi / PIN'), '123456'); await click(button('Çöp Kutusuna Taşı', dialog())); await waitFor(() => !dialog()); assert.equal((await orderRepository.list())[0].deleted, true);
      await navigate('/uretim/cop-kutusu'); await click(button('DETAY')); await click(button('Çöp Kutusundan Geri Yükle')); await click(button('Çöp Kutusundan Geri Yükle', dialog())); assert.equal((await orderRepository.list())[0].deleted, false);
      await navigate(`/uretim/planlar?id=${p.id}`); assert.ok(window.location.hash.startsWith('#/uretim/siparisler')); assert.ok(body().includes(p.orderNo));
      const menu = [...document.querySelectorAll('summary')].find((s) => s.querySelector('span')?.textContent === 'Üretim').parentElement; assert.deepEqual([...menu.querySelectorAll('a')].map((a) => a.textContent), ['Üretim Planları', 'Canlı Üretim', 'Arşiv', 'Çöp Kutusu']);
    });
    await t.test('Hazır alım formu, 450 adet/90.000 TL, satış ve fiziki sayım', async () => {
      const { product, customer } = await mount();
      const { productRepository } = await server.ssrLoadModule('/src/data/products/index.ts');
      const supplier = await contactRepository.create({ ...emptyContact, name: 'Test Tedarikçi', roles: ['Hazır Giyim Tedarikçisi'] });
      await orderRepository.createBrand('Palo');
      await navigate('/stok/urunler?islem=yeni');
      await waitFor(() => !!document.querySelector('.stock-colors-compact'));
      assert.deepEqual([...field('Giriş Türü *').options].map((o) => o.textContent), ['Hazır Ürün Alımı', 'İade', 'Sayım Düzeltmesi', 'Diğer']);
      assert.ok(!body().includes('Parti Seçimi')); assert.equal(field('Marka *').tagName, 'SELECT');
      await fill(field('Ürün Seç *'), product.id); await fill(field('Marka *'), 'Palo');
      await fill(field('Kumaş'), '30/2 Pike'); await fill(field('Gramaj'), '220 gr');
      for (const [i, color, qty] of [[1, 'Siyah', 200], [2, 'Beyaz', 100], [3, 'Lacivert', 150]]) {
        if (i > 1) await click(button('+ Renk Ekle'));
        await fill(field(`Renk ${i} *`), color); await fill(field(`Adet ${i} *`), String(qty));
      }
      assert.deepEqual([...document.querySelectorAll('.common-size-input')].map((n) => n.value), ['1', '1', '1', '1', '1', '1']);
      assert.ok(!body().includes('XS'));
      await fill(field('Firma / Tedarikçi *'), supplier.id); await fill(field('Birim Fiyat *'), '200');
      assert.equal(field('Toplam Adet').value, '450'); assert.ok(field('Toplam Tutar').value.includes('90.000'));
      await click(button('Stok Girişini Kaydet')); await waitFor(() => !document.querySelector('.stock-colors-compact'));
      let data = await productRepository.load(); assert.equal(data.records.length, 3);
      const white = data.records.find((r) => r.color === 'Beyaz'); assert.equal(white.assortment, 'S1 M1 L1 XL1 2XL1 3XL1');
      await navigate('/satislar'); await click(button('Yeni Satış')); await fill(field('Stoktaki Ürünü Seç'), white.id);
      await fill(field('Müşteri *'), customer.id); await fill(field('Miktar *'), '50'); await fill(field('Birim Satış Fiyatı (TL / adet) *'), '250');
      assert.ok(body().includes('12.500')); await click(button('Satışı Kaydet')); await waitFor(() => !document.querySelector('form'));
      assert.ok(body().includes('ABC Tekstil')); assert.ok(body().includes('Palo'));
      assert.equal((await productRepository.load()).records.find((r) => r.id === white.id).quantity, 50);
      await click(button('Yeni Satış')); await fill(field('Stoktaki Ürünü Seç'), white.id); await fill(field('Müşteri *'), customer.id);
      await fill(field('Miktar *'), '60'); assert.equal(field('Miktar *').checkValidity(), false);
      await navigate('/stok/urunler?islem=yeni'); await fill(field('Giriş Türü *'), 'Sayım / Stok Düzeltme'); await fill(field('Stoktaki Ürün *'), white.id);
      assert.equal(field('Sistemdeki Mevcut Adet').value, '50'); await fill(field('Fiziki Sayım Adedi *'), '55'); assert.ok(body().includes('Sayım Farkı: +5'));
      await fill(field('Açıklama *'), 'Fiziki sayım'); await click(button('İşlemi Kaydet'));
      assert.equal((await productRepository.load()).records.find((r) => r.id === white.id).quantity, 55);
    });
    await t.test('İş Ağı formundan aktarım ve müşteri güvenli silme', async () => {
      const { customer } = await mount(); await navigate('/firma-kisiler/is-agi'); await click(button('Yeni Bağlantı'));
      for (const [name, value] of [['Ad Soyad *', 'Mehmet Yılmaz'], ['Firma Adı', 'Yılmaz Kumaş'], ['Kategori / Alan *', 'Kumaşçı'], ['Telefon', 'test'], ['Şehir', 'İstanbul']]) await fill(field(name), value);
      await click(button('İş Ağı Kaydet')); assert.ok(body().includes('Mehmet Yılmaz'));
      await click(button('Firma / Kişi Listesine Aktar')); assert.equal(document.querySelector('[name=name]').value, 'Yılmaz Kumaş');
      await click(button('Kaydet')); await waitFor(() => !document.querySelector('.contact-form'));
      assert.ok(body().includes('Firma / Kişi Kaydı')); assert.equal((await contactRepository.list()).filter((c) => c.name === 'Yılmaz Kumaş').length, 1);
      await navigate('/firma-kisiler/musteriler'); await click(button('ABC Tekstil kaydını sil')); assert.ok(document.querySelector('[role=dialog]'));
      await click(button('Sil / Pasife Al')); await waitFor(() => !document.querySelector('[role=dialog]'));
      assert.equal((await contactRepository.get(customer.id)).status, 'Pasif'); assert.ok(!document.querySelector('.contact-table tbody')?.textContent.includes('ABC Tekstil'));
    });
    await t.test('Detay accordionları ve maliyet fiyatı yeniden açıldığında kalıcıdır', async () => {
      const o = await createOrder();
      const disclosures = [...document.querySelectorAll('details.production-disclosure')];
      assert.ok(disclosures.length >= 10); assert.ok(disclosures.every((d) => !d.open));
      const costs = disclosures.find((d) => d.querySelector('summary').textContent.includes('Maliyetler'));
      await click(costs.querySelector('summary')); assert.equal(costs.open, true);
      await fill(document.querySelector('[aria-label="Kumaş Birim Fiyatı"]'), '100'); await click(button('Maliyetleri Kaydet'));
      assert.equal((await orderRepository.list())[0].costPricesMinor.Kumaş, 10000);
      await navigate('/uretim/siparisler'); await navigate(`/uretim/siparisler?id=${o.id}`);
      assert.equal(document.querySelector('[aria-label="Kumaş Birim Fiyatı"]').value, '100'); assert.ok(body().includes('Henüz hesaplanamadı'));
    });
  } finally {
    if (root) await act(async () => root.unmount()); await server.close(); dom.window.close();
    for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'FormData', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
  }
});
