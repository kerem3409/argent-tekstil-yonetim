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
      if (embroidery) { await click(button('Var', document.querySelector('[aria-label="Nakış"]'))); await click(document.querySelector('[aria-label="Nakış Notu ekle"]')); await fill(field('Nakış Notu 1'), 'Logo tona ton'); await fill(field('Logo / Nakış Konumu'), 'Sol göğüs'); await fill(field('Nakış Ölçüsü'), '8 cm'); await fill(field('Siyah Nakış Açıklaması'), 'Antrasit'); }
      if (printing) { await click(button('Var', document.querySelector('[aria-label="Baskı"]'))); await click(button('Baskı Notu ekle')); await fill(field('Baskı Notu 1'), 'Beyaz baskı'); await fill(field('Baskı Konumu'), 'Ön göğüs'); await fill(field('Baskı Ölçüsü'), '10 cm'); await fill(field('Siyah Baskı Rengi / Bilgisi'), 'Beyaz'); }
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
      const before = window.localStorage.getItem('argent-tekstil.production.v1');
      await click(button('Genel Sipariş Föyü')); let paper = document.querySelector('.plan-technical-print');
      for (const value of ['ABC Tekstil', 'ÖZEL-REF', 'Penye', 'Poşet', 'Sol göğüs', 'Etiket içte', 'Beyaz baskı']) assert.ok(paper.textContent.includes(value), value);
      await click(button('Siparişe Dön'));
      for (const name of ['Kesimci Föyü', 'Nakışçı Föyü', 'Baskıcı Föyü', 'Dikim Föyü', 'Ütü / Paket Föyü']) {
        await click(button(name)); paper = document.querySelector('.plan-technical-print'); assert.ok(paper.textContent.includes('PALO'));
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
        assert.ok(body().includes(type === 'Nakış' ? 'Yeni Nakış Atölyesi' : `${type} Atölyesi`));
        assert.equal(section().querySelectorAll('table').length, 1); assert.equal(section().querySelector('[aria-label="Siyah başlangıç"]').value, String(start));
        assert.ok(!section().textContent.includes('Sonuç Tarihi')); assert.ok(!section().textContent.includes('Renk Notu'));
        await fill(section().querySelector('[name=actual-0]'), String(actual));
        if (type === 'Kesim') { await fill(section().querySelector('[aria-label="Siyah Top"]'), '10'); await fill(section().querySelector('[aria-label="Siyah Kg"]'), '210'); assert.ok(section().textContent.includes('+10 adet')); }
        else assert.ok(section().textContent.includes(`${start - actual} fire`));
        let confirms = 0; window.confirm = () => { confirms++; return false; }; const hash = window.location.hash; await click(document.querySelector('a[href="#/"]')); assert.equal(confirms, 1); assert.equal(window.location.hash, hash);
        await click(button(`${type === 'Ütü & Paket' ? 'Ütü/Paket' : type} Sonucunu Kaydet`, section())); assert.equal(document.querySelector('[role=alert]'), null, body());
        assert.equal(section().querySelectorAll('table').length, 1); assert.ok(section().textContent.includes('TOPLAM'));
        const raw = window.localStorage.getItem('argent-tekstil.production.v1'); await click(button(sheets[type])); paper = document.querySelector('.plan-technical-print'); for (const value of [String(actual), '2026-10-05', type === 'Nakış' ? 'Yeni Nakış Atölyesi' : `${type} Atölyesi`]) assert.ok(paper.textContent.includes(value), value); assert.ok(!paper.textContent.includes('ABC Tekstil')); assert.equal(window.localStorage.getItem('argent-tekstil.production.v1'), raw); await click(button('Siparişe Dön'));
      }
      // A consistent correction updates downstream input after explicit confirmation.
      const embroidery = () => [...document.querySelectorAll('.plan-stage')].find((s) => s.querySelector('h3').textContent.startsWith('Nakış'));
      await fill(embroidery().querySelector('[name=actual-0]'), '504'); let warning = ''; window.confirm = (message) => { warning = message; return true; };
      await click(button('Nakış Sonucunu Kaydet', embroidery())); assert.ok(warning.includes('Baskı başlangıç')); assert.equal(document.querySelector('[role=alert]'), null, body());
      const printStage = [...document.querySelectorAll('.plan-stage')].find((s) => s.querySelector('h3').textContent.startsWith('Baskı')); assert.equal(printStage.querySelector('[aria-label="Siyah başlangıç"]').value, '504');
      await fill(field('Nakış Termin Tarihi'), '2026-10-08'); await click(button('Planlamayı Kaydet')); assert.equal((await orderRepository.list())[0].stagePlans.find((p) => p.type === 'Nakış').dueDate, '2026-10-08');
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
  } finally {
    if (root) await act(async () => root.unmount()); await server.close(); dom.window.close();
    for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'FormData', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
  }
});
