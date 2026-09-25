import assert from 'node:assert/strict';
import test from 'node:test';
import { commonSizeDistribution, sizeSeries, validateCommonSizeDistribution } from '../src/domain/productionWorkflow.ts';

test('beden serileri ortak pastal için doğru bedenleri verir', () => {
  assert.deepEqual(sizeSeries['Yetişkin'], ['S', 'M', 'L', 'XL', '2XL', '3XL']);
  assert.deepEqual(sizeSeries['Çocuk'], ['2 Yaş', '4 Yaş', '6 Yaş', '8 Yaş', '10 Yaş', '12 Yaş', '14 Yaş']);
  assert.deepEqual(sizeSeries['Battal Boy'], ['4XL', '5XL', '6XL']);
});

test('ortak pastal dağılımı tek kez doğrulanır ve toplamı üretim miktarına bağlı değildir', () => {
  const distribution = { S: 1, M: 2, L: 2, XL: 2, '2XL': 1, '3XL': 1 };
  assert.equal(validateCommonSizeDistribution('Yetişkin', distribution), 9);
  assert.doesNotThrow(() => validateCommonSizeDistribution('Yetişkin', distribution));
});

test('ortak pastal dağılımında negatif, ondalıklı ve tamamen boş değerler reddedilir', () => {
  assert.throws(() => validateCommonSizeDistribution('Yetişkin', { S: -1 }));
  assert.throws(() => validateCommonSizeDistribution('Yetişkin', { S: 1.5 }));
  assert.throws(() => validateCommonSizeDistribution('Yetişkin', { S: 0, M: 0 }));
  assert.throws(() => validateCommonSizeDistribution('Yetişkin', { XS: 1 }));
});

test('eski renk bazlı kayıt ilk geçerli dağılımı ortak görünüm için kullanır', () => {
  const legacy = { sizeSeries: 'Yetişkin', sizeDistributions: [{ rowId: 'white', sizes: { S: 2, M: 1 } }] } as any;
  assert.deepEqual(commonSizeDistribution(legacy), { S: 2, M: 1 });
});
