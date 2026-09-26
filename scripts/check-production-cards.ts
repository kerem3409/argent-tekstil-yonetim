import { legacyOrderFixture } from './legacy-workflow-fixture.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkflowRepository } from '../src/data/production/workflowRepository.ts';

function repository() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const deps = {
    contacts: { async get(id: string) { return id ? { id, name: id, roles: ['Hazır Giyim Müşterisi', 'Fasoncu'], services: ['Kesim', 'Dikim'], status: 'Aktif' as const } : null; } },
    definitions: { async requireActive(id: string) { return { id, name: 'Polo Yaka Tişört' }; } },
    products: { async load() { return { productionReceipts: [] }; } },
    fabrics: { async load() { return { records: [] }; } },
  };
  return legacyOrderFixture(createWorkflowRepository(() => storage, deps), storage);
}

const input = (orderCardId: string, brand: string) => ({ productDefinitionId: 'product-1', orderCardId, brand, fabricId: '', fabricName: 'Penye', gsm: '180', sizeSeries: 'Yetişkin' as const, cuttingMode: 'Kumaştan Çıktığı Kadar' as const, targetQuantity: null, cutterCompanyId: 'cutting', date: '2026-09-21', productInstructions: '', note: '' });

test('Sipariş kartı birden fazla tek markalı üretim kartını bağlar', async () => {
  const repo = repository(); const order = await repo.createOrder({ orderType: 'Stok İçin Üretim', date: '2026-09-21', note: '' });
  const first = await repo.create(input(order.id, 'PALO')); const second = await repo.create(input(order.id, 'TOMMY'));
  assert.deepEqual((await repo.listOrders()).find((item) => item.id === order.id)?.productionCardIds, [first.id, second.id]);
});
test('Sipariş kalemleri renk toplamını ve üretim aktarım sınırını uygular', async () => {
  const repo = repository(); const order = await repo.createOrder({ orderType: 'Ön Sipariş', customerId: 'customer-1', date: '2026-09-21', note: '', items: [{ productDefinitionId: 'product-1', modelName: 'Basic Polo', colorQuantities: [{ color: 'Beyaz', quantity: 100 }, { color: 'Siyah', quantity: 50 }], fabricName: '24/1 Penye', gsm: '180', fabricProperties: 'Likralı', productDetails: 'Yaka detayı' }] });
  const item = order.items[0]; assert.equal(item.totalQuantity, 150); assert.equal(item.fabricName, '24/1 Penye');
  await repo.create({ ...input(order.id, 'PALO'), orderItemId: item.id, selectedColorQuantities: [{ color: 'Beyaz', quantity: 60 }], plannedSizeDistributions: [{ color: 'Beyaz', sizes: { M: 60 } }] });
  await assert.rejects(repo.create({ ...input(order.id, 'TOMMY'), orderItemId: item.id, selectedColorQuantities: [{ color: 'Lacivert', quantity: 1 }] }), /Sipariş kaleminde olmayan renk/);
  await assert.rejects(repo.create({ ...input(order.id, 'TOMMY'), orderItemId: item.id, selectedColorQuantities: [{ color: 'Beyaz', quantity: 41 }] }), /en fazla miktar 40/);
  const card = await repo.create({ ...input(order.id, 'TOMMY'), orderItemId: item.id, selectedColorQuantities: [{ color: 'Beyaz', quantity: 40 }], plannedSizeDistributions: [{ color: 'Beyaz', sizes: { M: 40 } }] }); assert.equal(card.fabricProperties, 'Likralı'); assert.equal(card.productInstructions, 'Yaka detayı');
});
test('Ön siparişte müşteri zorunludur, stok üretiminde değildir', async () => {
  const repo = repository(); await assert.rejects(repo.createOrder({ orderType: 'Ön Sipariş', date: '2026-09-21', note: '' }), /müşteri/); const order = await repo.createOrder({ orderType: 'Stok İçin Üretim', date: '2026-09-21', note: '' }); assert.equal(order.customerId, undefined);
});

test('Sipariş kaydı kumaş ve gramajı kırpar, gerçekten boş değerleri yazmaz', async () => {
  const repo = repository();
  const item = { productDefinitionId: 'product-1', modelName: 'Basic Polo', colorQuantities: [{ color: ' Beyaz ', quantity: 100 }], fabricName: ' Penye ', gsm: ' 180 ', fabricProperties: '', productDetails: '' };
  const orderInput = { orderType: 'Stok İçin Üretim' as const, date: '2026-09-25', note: '', items: [item] };
  for (const fabricName of ['', '   ']) await assert.rejects(repo.createOrder({ ...orderInput, items: [{ ...item, fabricName }] }), /Kumaş Adı/);

  assert.equal((await repo.listOrders()).length, 0);
  const order = await repo.createOrder(orderInput);
  assert.equal(order.items[0].fabricName, 'Penye');
  assert.equal(order.items[0].gsm, '180');
  assert.equal(order.items[0].colorQuantities[0].color, 'Beyaz');
  assert.equal((await repo.listOrders())[0].items[0].fabricName, 'Penye');
});
