import assert from 'node:assert/strict';
import { navigation, pages } from '../src/app/navigation.ts';

assert.equal(navigation.length, 6, 'Altı ana modül bulunmalı');
assert.equal(pages.length, 20, 'İstenen 20 alt sayfa bulunmalı');
assert.equal(new Set(pages.map((page) => page.path)).size, pages.length, 'Yollar benzersiz olmalı');
assert.equal(new Set(pages.map((page) => page.id)).size, pages.length, 'Kimlikler benzersiz olmalı');
for (const page of pages) {
  assert.match(page.path, /^\/[a-z0-9/-]+$/);
  assert.ok(page.title && page.description && page.columns.length);
}
assert.deepEqual(pages.filter((page) => page.subgroup).map((page) => page.title), ['Yapılan Ödemeler', 'Alınan Ödemeler']);
console.log('Menü kontrolü başarılı: 6 modül, 20 benzersiz alt sayfa ve Para Hareketleri grubu.');
