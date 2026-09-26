import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

test('Kesim ve takip A4 ekranları tüm beden serileriyle render olur; kesimde sevk alanları yoktur', async () => {
  const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { ProductionPrint } = await server.ssrLoadModule('/src/features/production/ProductionPrint.tsx');
    const { NewProductionForm, CuttingEditor, SizeEditor } = await server.ssrLoadModule('/src/features/production/ProductionForms.tsx');
    const { sizeSeries } = await server.ssrLoadModule('/src/domain/productionWorkflow.ts');
    const production = { id: 'test', productionNo: 'UR-00001', productName: 'Polo Yaka Tişört', fabricName: 'Penye', gsm: '180', date: '2026-09-21', sizeSeries: 'Yetişkin', cuttingMode: 'Kumaştan Çıktığı Kadar', cutterCompanyId: '', productInstructions: 'Dikiş payı', note: '', cuttingSheet: { brandSections: [{ id: 'b', brandName: 'PALO', rows: [{ id: 'r', color: 'Siyah', rollCount: 4, kg: null, quantity: null }] }], completedAt: '' }, sizeDistributions: [], productionStages: [], completion: null, revision: 0 };
    const cutting = renderToStaticMarkup(React.createElement(ProductionPrint, { production, kind: 'cutting', companyName: () => 'Kendi Atölyemiz' }));
    for (const text of ['Kesime Föy', 'UR-00001', 'PALO', 'Siyah', 'Top Sayısı', 'Kg', 'handwriting-space']) assert.ok(cutting.includes(text), text);
    for (const text of ['Gönderilen', 'Gelen', 'Kalan', 'Pastala', 'Artan kg', 'Fire kg', 'Parti']) assert.ok(!cutting.includes(text), text);
    for (const [series, sizes] of Object.entries(sizeSeries)) {
      const p = { ...production, sizeSeries: series, cuttingSheet: { brandSections: [{ ...production.cuttingSheet.brandSections[0], rows: [{ ...production.cuttingSheet.brandSections[0].rows[0], kg: 91, quantity: 410 }] }], completedAt: '2026-09-21' }, sizeDistributions: [{ rowId: 'r', sizes: { [sizes[0]]: 410 } }] };
      const html = renderToStaticMarkup(React.createElement(ProductionPrint, { production: p, kind: 'tracking', companyName: () => 'Atölye' }));
      assert.ok(html.includes('Üretim Takip Föyü')); assert.ok(html.includes('Kesimden Çıkan Adet')); assert.ok(html.includes('Pastal Dağılımı'));
      for (const size of sizes) assert.ok(html.includes(`<th>${size}</th>`));
      const sizeForm = renderToStaticMarkup(React.createElement(SizeEditor, { production: p, done() {} }));
      assert.ok(sizeForm.includes('Seri Toplamı: 410'));
    }
    const newForm = renderToStaticMarkup(React.createElement(NewProductionForm, { contacts: [], saved() {} }));
    assert.ok(newForm.includes('Ürün Seç')); assert.ok(!newForm.includes('Parti'));
    const editor = renderToStaticMarkup(React.createElement(CuttingEditor, { production, done() {} }));
    assert.ok(!editor.includes('+ Marka Ekle')); assert.ok(!editor.includes('Markayı Kaldır')); assert.ok(!editor.includes('+ Renk Ekle')); assert.ok(!editor.includes('common-size-input')); assert.ok(!editor.includes('Gönderilen'));
    const order = { orderNo: 'SP-1234', customerId: 'customer', items: [{ id: 'item', productName: 'Polo Tanımı' }] };
    const requested = [{ color: 'Beyaz', quantity: 150 }, { color: 'Siyah', quantity: 200 }, { color: 'Bebe Mavisi', quantity: 300 }];
    const p = { ...production, orderItemId: 'item', brand: 'ARGENT', modelName: 'Model 2026', fabricProperties: 'Likralı', note: 'Kesim notu', sizeDistribution: { S: 1, M: 2, L: 2, XL: 2, '2XL': 1, '3XL': 1 }, selectedColorQuantities: requested,
      cuttingSheet: { completedAt: '2026-09-25', brandSections: [{ id: 'b', brandName: 'ARGENT', rows: requested.map((r, i) => ({ id: String(i), color: r.color, rollCount: 9, kg: 99, quantity: 111 })) }] } };
    const before = structuredClone(p);
    const doc = new JSDOM(renderToStaticMarkup(React.createElement(ProductionPrint, { production: p, order, kind: 'cutting', companyName: (id) => id === 'customer' ? 'Test Müşteri' : 'Atölye' })));
    for (const text of ['SP-1234', 'Test Müşteri', 'ARGENT', 'Polo Tanımı', 'Model 2026', 'Penye', '180', 'Likralı', 'Dikiş payı', 'Kesim notu', 'Seri Toplamı: 9']) assert.ok(doc.window.document.body.textContent.includes(text), text);
    assert.equal(doc.window.document.querySelectorAll('.common-size-table').length, 1);
    assert.deepEqual([...doc.window.document.querySelectorAll('.production-request-table tbody tr')].map((r) => [...r.cells].map((c) => c.textContent)), requested.map((r) => [r.color, String(r.quantity)]));
    assert.deepEqual([...doc.window.document.querySelectorAll('.cutting-results tbody tr')].map((r) => [...r.cells].map((c) => c.textContent.trim())), requested.map((r) => [r.color, '', '', '']));
    assert.deepEqual(p, before, 'Föy hazırlama kayıtları değiştirmemeli');
    doc.window.close();
  } finally { await server.close(); }
});
