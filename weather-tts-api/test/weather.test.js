import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBaseDateTimeNcst, getBaseDateTimeFcst, mapPty,
  extractNcstSlots, extractFcstSlots,
  fetchUltraSrtNcst, fetchVilageFcst, mapWeatherError,
} from '../src/weather.js';

// ─── base_date / base_time ────────────────────────────────────────────────

test('getBaseDateTimeNcst: before HH:40 returns previous hour (KMA publishes ~40min after hour)', () => {
  // KST 2026-05-21 12:39 → use 11:00
  const d = new Date('2026-05-21T03:39:00Z'); // 12:39 KST
  assert.deepEqual(getBaseDateTimeNcst(d), { base_date: '20260521', base_time: '1100' });
});

test('getBaseDateTimeNcst: at or after HH:40 returns this hour', () => {
  // KST 2026-05-21 12:40 → use 12:00
  const d = new Date('2026-05-21T03:40:00Z');
  assert.deepEqual(getBaseDateTimeNcst(d), { base_date: '20260521', base_time: '1200' });
});

test('getBaseDateTimeNcst: midnight rollover when 00:39 KST', () => {
  // KST 2026-05-21 00:39 → use previous day 23:00
  const d = new Date('2026-05-20T15:39:00Z');
  assert.deepEqual(getBaseDateTimeNcst(d), { base_date: '20260520', base_time: '2300' });
});

test('getBaseDateTimeFcst: returns the most recent of [02,05,08,11,14,17,20,23] with +10min delay', () => {
  // KST 11:09 → still 08:00 slot (11:00 not yet usable)
  let d = new Date('2026-05-21T02:09:00Z');
  assert.deepEqual(getBaseDateTimeFcst(d), { base_date: '20260521', base_time: '0800' });

  // KST 11:10 → 11:00 slot
  d = new Date('2026-05-21T02:10:00Z');
  assert.deepEqual(getBaseDateTimeFcst(d), { base_date: '20260521', base_time: '1100' });

  // KST 14:00 → 11:00 (14:00 not yet +10min)
  d = new Date('2026-05-21T05:00:00Z');
  assert.deepEqual(getBaseDateTimeFcst(d), { base_date: '20260521', base_time: '1100' });

  // KST 14:11 → 14:00
  d = new Date('2026-05-21T05:11:00Z');
  assert.deepEqual(getBaseDateTimeFcst(d), { base_date: '20260521', base_time: '1400' });
});

test('getBaseDateTimeFcst: pre-02:10 KST rolls to previous day 23:00', () => {
  // KST 01:00 → previous day 23:00
  const d = new Date('2026-05-20T16:00:00Z');
  assert.deepEqual(getBaseDateTimeFcst(d), { base_date: '20260520', base_time: '2300' });
});

// ─── PTY mapping ──────────────────────────────────────────────────────────

test('mapPty: known codes', () => {
  assert.equal(mapPty(0), null);
  assert.equal(mapPty(1), '비');
  assert.equal(mapPty(2), '비와 눈');
  assert.equal(mapPty(3), '눈');
  assert.equal(mapPty(4), '소나기');
  assert.equal(mapPty(5), '빗방울');
  assert.equal(mapPty(6), '빗방울과 눈날림');
  assert.equal(mapPty(7), '눈날림');
});

test('mapPty: unknown / non-numeric falls back to "강수"', () => {
  assert.equal(mapPty(9), '강수');
  assert.equal(mapPty(null), null); // null in → null out (caller decides)
});

// ─── slot extraction ──────────────────────────────────────────────────────

test('extractNcstSlots: pulls T1H and PTY', () => {
  const items = [
    { category: 'T1H', obsrValue: '12.3' },
    { category: 'PTY', obsrValue: '1' },
    { category: 'REH', obsrValue: '60' },
  ];
  assert.deepEqual(extractNcstSlots(items), { t1h: 12.3, pty: 1 });
});

test('extractNcstSlots: missing categories → null', () => {
  assert.deepEqual(extractNcstSlots([]), { t1h: null, pty: null });
});

test('extractFcstSlots: pulls TMX/TMN/POP for today (earliest fcstDate)', () => {
  const items = [
    { category: 'TMX', fcstDate: '20260521', fcstTime: '1500', fcstValue: '18.0' },
    { category: 'TMN', fcstDate: '20260521', fcstTime: '0600', fcstValue: '8.0' },
    { category: 'POP', fcstDate: '20260521', fcstTime: '1200', fcstValue: '70' },
    { category: 'POP', fcstDate: '20260521', fcstTime: '1500', fcstValue: '40' },
    { category: 'TMX', fcstDate: '20260522', fcstTime: '1500', fcstValue: '20.0' }, // tomorrow — ignored
  ];
  const today = '20260521';
  const out = extractFcstSlots(items, today);
  assert.equal(out.tmx, 18);
  assert.equal(out.tmn, 8);
  // POP = max over today's slots
  assert.equal(out.pop, 70);
});

test('extractFcstSlots: missing fields → null', () => {
  assert.deepEqual(extractFcstSlots([], '20260521'), { tmx: null, tmn: null, pop: null });
});

// ─── error mapping ────────────────────────────────────────────────────────

test('mapWeatherError known codes', () => {
  assert.equal(mapWeatherError({ code: 'NO_ITEM' }), '현재 날씨 정보가 제공되지 않습니다.');
});

test('mapWeatherError fallback', () => {
  assert.equal(mapWeatherError({ code: 'NETWORK' }), '날씨 정보 조회에 실패했습니다.');
  assert.equal(mapWeatherError({}), '날씨 정보 조회에 실패했습니다.');
});

// ─── fetchers ─────────────────────────────────────────────────────────────

function withMockedFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  return Promise.resolve(fn()).finally(() => { global.fetch = original; });
}

test('fetchUltraSrtNcst returns items on success', async () => {
  const items = [{ category: 'T1H', obsrValue: '12' }];
  await withMockedFetch(
    async (url) => {
      assert.match(url, /VilageFcstInfoService_2\.0\/getUltraSrtNcst/);
      assert.match(url, /ServiceKey=K/);
      assert.match(url, /nx=55/);
      assert.match(url, /ny=127/);
      assert.match(url, /base_date=20260521/);
      assert.match(url, /base_time=1100/);
      assert.match(url, /dataType=JSON/);
      return { ok: true, status: 200, json: async () => ({ response: { body: { items: { item: items } } } }) };
    },
    async () => {
      const out = await fetchUltraSrtNcst('K', 55, 127, { base_date: '20260521', base_time: '1100' });
      assert.deepEqual(out, items);
    }
  );
});

test('fetchVilageFcst returns items on success', async () => {
  const items = [{ category: 'TMX', fcstDate: '20260521', fcstTime: '1500', fcstValue: '18' }];
  await withMockedFetch(
    async (url) => {
      assert.match(url, /VilageFcstInfoService_2\.0\/getVilageFcst/);
      assert.match(url, /numOfRows=1000/);
      return { ok: true, status: 200, json: async () => ({ response: { body: { items: { item: items } } } }) };
    },
    async () => {
      const out = await fetchVilageFcst('K', 55, 127, { base_date: '20260521', base_time: '0800' });
      assert.deepEqual(out, items);
    }
  );
});

test('fetchUltraSrtNcst error mapping', async () => {
  await withMockedFetch(async () => { throw new Error(); }, async () => {
    await assert.rejects(() => fetchUltraSrtNcst('K', 1, 1, { base_date: 'd', base_time: 't' }),
      (e) => e.code === 'NETWORK');
  });
  await withMockedFetch(async () => ({ ok: false, status: 500 }), async () => {
    await assert.rejects(() => fetchUltraSrtNcst('K', 1, 1, { base_date: 'd', base_time: 't' }),
      (e) => e.code === 'HTTP_STATUS');
  });
  await withMockedFetch(async () => ({ ok: true, json: async () => { throw new Error(); } }), async () => {
    await assert.rejects(() => fetchUltraSrtNcst('K', 1, 1, { base_date: 'd', base_time: 't' }),
      (e) => e.code === 'JSON_PARSE');
  });
  await withMockedFetch(async () => ({ ok: true, json: async () => ({ response: { body: { items: { item: [] } } } }) }), async () => {
    await assert.rejects(() => fetchUltraSrtNcst('K', 1, 1, { base_date: 'd', base_time: 't' }),
      (e) => e.code === 'NO_ITEM');
  });
});
