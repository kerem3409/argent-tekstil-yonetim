import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('Kesim ve takip A4 ekranları tüm beden serileriyle render olur; kesimde sevk alanları yoktur', async () => {
  const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { ProductionPrint } = await server.ssrLoadModule('/src/features/production/ProductionPrint.tsx');
    const { NewProductionForm, CuttingEditor, SizeEditor } = await server.ssrLoadModule('/src/features/production/ProductionForms.tsx');
    const { sizeSeries } = await server.ssrLoadModule('/src/domain/productionWorkflow.ts');
    const production = { id: 'test', productionNo: 'UR-00001', productName: 'Polo Yaka Tişört', fabricName: 'Penye', gsm: '180', date: '2026-09-21', sizeSeries: 'Yetişkin', cuttingMode: 'Kumaştan Çıktığı Kadar', cutterCompanyId: '', productInstructions: 'Dikiş payı', note: '', cuttingSheet: { brandSections: [{ id: 'b', brandName: 'PALO', rows: [{ id: 'r', color: 'Siyah', rollCount: 4, kg: null, quantity: null }] }], completedAt: '' }, sizeDistributions: [], productionStages: [], completion: null, revision: 0 };
    const cutting = renderToStaticMarkup(React.createElement(ProductionPrint, { production, kind: 'cutting', companyName: () => 'Kendi Atölyemiz' }));
    for (const text of ['Kesim Föyü', 'UR-00001', 'PALO', 'Siyah', 'Top Sayısı', 'Kg', 'handwriting-space']) assert.ok(cutting.includes(text), text);
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
    assert.ok(editor.includes('+ Marka Ekle')); assert.ok(editor.includes('+ Renk Ekle')); assert.ok(!editor.includes('Gönderilen'));
  } finally { await server.close(); }
});
