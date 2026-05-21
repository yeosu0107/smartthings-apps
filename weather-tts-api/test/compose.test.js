import test from 'node:test';
import assert from 'node:assert/strict';
import { composeAnnouncement } from '../src/compose.js';

test('full happy path: all slots present, rain forecast, normal air', () => {
  const msg = composeAnnouncement({
    weather: { t1h: 12, tmx: 16, tmn: 8, pty: 0, pop: 70 },
    air:     { pm10: 30, pm25: 18 },
    errors:  {},
  });
  assert.equal(
    msg,
    '안녕하세요, 오늘의 날씨를 전해드리겠습니다. ' +
    '현재 기온은 12도입니다. ' +
    '낮 최고기온은 16도, 아침 최저기온은 8도가 되겠습니다. ' +
    '오늘 비 올 확률은 70퍼센트로, 우산이 필요하겠습니다. ' +
    '미세먼지는 좋음, 초미세먼지는 보통으로 예상됩니다. ' +
    '오늘은 자켓이나 트렌치코트 추천드립니다. 우산 꼭 챙기시기 바랍니다. ' +
    '오늘도 좋은 하루 보내세요.'
  );
});

test('currently raining (PTY=1) overrides POP wording', () => {
  const msg = composeAnnouncement({
    weather: { t1h: 12, tmx: 16, tmn: 7, pty: 1, pop: 80 },
    air:     { pm10: 30, pm25: 18 },
    errors:  {},
  });
  assert.match(msg, /지금 비가 내리고 있습니다/);
  assert.doesNotMatch(msg, /비 올 확률/);
  assert.match(msg, /우산 꼭 챙기시기 바랍니다/);
});

test('low POP and no current rain → skip precip slot, no umbrella addendum', () => {
  const msg = composeAnnouncement({
    weather: { t1h: 22, tmx: 25, tmn: 15, pty: 0, pop: 20 },
    air:     { pm10: 30, pm25: 18 },
    errors:  {},
  });
  assert.doesNotMatch(msg, /비 올 확률/);
  assert.doesNotMatch(msg, /지금/);
  assert.doesNotMatch(msg, /우산/);
});

test('bad PM2.5 → mask addendum, grade word "나쁨"', () => {
  const msg = composeAnnouncement({
    weather: { t1h: 22, tmx: 25, tmn: 15, pty: 0, pop: 20 },
    air:     { pm10: 30, pm25: 40 },
    errors:  {},
  });
  assert.match(msg, /초미세먼지는 나쁨/);
  assert.match(msg, /외출 시 마스크 착용 권장드립니다/);
});

test('TMX missing → skip outfit slot + skip addenda', () => {
  const msg = composeAnnouncement({
    weather: { t1h: 12, tmx: null, tmn: 8, pty: 0, pop: 70 },
    air:     { pm10: 30, pm25: 40 },
    errors:  {},
  });
  assert.doesNotMatch(msg, /추천드립니다/);
  assert.doesNotMatch(msg, /우산 꼭/);
  assert.doesNotMatch(msg, /마스크 착용/);
  assert.match(msg, /아침 최저기온은 8도/);
  assert.doesNotMatch(msg, /낮 최고기온/);
});

test('air error appended at end when air data missing', () => {
  const msg = composeAnnouncement({
    weather: { t1h: 12, tmx: 18, tmn: 8, pty: 0, pop: 70 },
    air:     null,
    errors:  { air: '미세먼지 정보 조회에 실패했습니다.' },
  });
  assert.doesNotMatch(msg, /미세먼지는/);
  assert.match(msg, /미세먼지 정보 조회에 실패했습니다/);
});

test('weather error: only air available', () => {
  const msg = composeAnnouncement({
    weather: null,
    air:     { pm10: 30, pm25: 18 },
    errors:  { weather: '날씨 정보 조회에 실패했습니다.' },
  });
  assert.match(msg, /미세먼지는 좋음, 초미세먼지는 보통/);
  assert.match(msg, /날씨 정보 조회에 실패했습니다/);
  assert.doesNotMatch(msg, /추천드립니다/);
});

test('all sources failed', () => {
  const msg = composeAnnouncement({
    weather: null,
    air:     null,
    errors:  { weather: 'x', air: 'y' },
  });
  assert.equal(msg, '오늘 날씨 정보를 가져올 수 없습니다.');
});

test('temperatures rounded to nearest integer for speech', () => {
  const msg = composeAnnouncement({
    weather: { t1h: 12.7, tmx: 18.3, tmn: 7.5, pty: 0, pop: 30 },
    air:     { pm10: 30, pm25: 18 },
    errors:  {},
  });
  assert.match(msg, /현재 기온은 13도/);
  assert.match(msg, /낮 최고기온은 18도/);
  assert.match(msg, /아침 최저기온은 8도/);
});

test('air with only PM10', () => {
  const msg = composeAnnouncement({
    weather: { t1h: 12, tmx: 18, tmn: 8, pty: 0, pop: 30 },
    air:     { pm10: 30, pm25: null },
    errors:  {},
  });
  assert.match(msg, /미세먼지는 좋음으로 예상됩니다/);
  assert.doesNotMatch(msg, /초미세먼지/);
});
