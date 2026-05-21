import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendOutfit, buildAddenda } from '../src/outfit.js';

test('recommendOutfit: ≥ 28°C → 반팔과 반바지', () => {
  assert.equal(recommendOutfit(28), '반팔과 반바지, 린넨 소재');
  assert.equal(recommendOutfit(35), '반팔과 반바지, 린넨 소재');
});

test('recommendOutfit: 23~27°C → 반팔이나 얇은 셔츠', () => {
  assert.equal(recommendOutfit(27), '반팔이나 얇은 셔츠');
  assert.equal(recommendOutfit(23), '반팔이나 얇은 셔츠');
});

test('recommendOutfit: 20~22°C → 얇은 긴팔이나 가디건', () => {
  assert.equal(recommendOutfit(22), '얇은 긴팔이나 가디건');
  assert.equal(recommendOutfit(20), '얇은 긴팔이나 가디건');
});

test('recommendOutfit: 17~19°C → 맨투맨이나 얇은 니트', () => {
  assert.equal(recommendOutfit(19), '맨투맨이나 얇은 니트');
  assert.equal(recommendOutfit(17), '맨투맨이나 얇은 니트');
});

test('recommendOutfit: 12~16°C → 자켓이나 트렌치코트', () => {
  assert.equal(recommendOutfit(16), '자켓이나 트렌치코트');
  assert.equal(recommendOutfit(12), '자켓이나 트렌치코트');
});

test('recommendOutfit: 9~11°C → 야상이나 바람막이', () => {
  assert.equal(recommendOutfit(11), '야상이나 바람막이');
  assert.equal(recommendOutfit(9), '야상이나 바람막이');
});

test('recommendOutfit: 5~8°C → 코트나 두꺼운 니트', () => {
  assert.equal(recommendOutfit(8), '코트나 두꺼운 니트');
  assert.equal(recommendOutfit(5), '코트나 두꺼운 니트');
});

test('recommendOutfit: < 5°C → 패딩에 목도리와 장갑', () => {
  assert.equal(recommendOutfit(4), '패딩에 목도리와 장갑까지');
  assert.equal(recommendOutfit(-10), '패딩에 목도리와 장갑까지');
});

test('buildAddenda: nothing flagged → empty array', () => {
  assert.deepEqual(buildAddenda({ hasPrecip: false, badAir: false }), []);
});

test('buildAddenda: only precip', () => {
  assert.deepEqual(buildAddenda({ hasPrecip: true, badAir: false }),
    ['우산 꼭 챙기시기 바랍니다']);
});

test('buildAddenda: only bad air', () => {
  assert.deepEqual(buildAddenda({ hasPrecip: false, badAir: true }),
    ['외출 시 마스크 착용 권장드립니다']);
});

test('buildAddenda: both', () => {
  assert.deepEqual(buildAddenda({ hasPrecip: true, badAir: true }),
    ['우산 꼭 챙기시기 바랍니다', '외출 시 마스크 착용 권장드립니다']);
});
