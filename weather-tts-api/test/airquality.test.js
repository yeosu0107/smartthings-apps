import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gradePm10, gradePm25, fetchAirQuality, mapAirError,
} from '../src/airquality.js';

test('gradePm10 WHO boundaries (24h)', () => {
  assert.equal(gradePm10(0),  '좋음');
  assert.equal(gradePm10(45), '좋음');
  assert.equal(gradePm10(46), '보통');
  assert.equal(gradePm10(75), '보통');
  assert.equal(gradePm10(76), '나쁨');
  assert.equal(gradePm10(300), '나쁨');
});

test('gradePm25 WHO boundaries (24h)', () => {
  assert.equal(gradePm25(0),  '좋음');
  assert.equal(gradePm25(15), '좋음');
  assert.equal(gradePm25(16), '보통');
  assert.equal(gradePm25(25), '보통');
  assert.equal(gradePm25(26), '나쁨');
  assert.equal(gradePm25(150), '나쁨');
});

test('mapAirError known codes', () => {
  assert.equal(mapAirError({ code: 'NO_ITEM' }), '미세먼지 측정 데이터가 없습니다.');
});

test('mapAirError fallback', () => {
  assert.equal(mapAirError({ code: 'NETWORK' }), '미세먼지 정보 조회에 실패했습니다.');
  assert.equal(mapAirError({ code: 'HTTP_STATUS' }), '미세먼지 정보 조회에 실패했습니다.');
  assert.equal(mapAirError({ code: 'JSON_PARSE' }), '미세먼지 정보 조회에 실패했습니다.');
  assert.equal(mapAirError({}), '미세먼지 정보 조회에 실패했습니다.');
});

function withMockedFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  return Promise.resolve(fn()).finally(() => { global.fetch = original; });
}

test('fetchAirQuality: returns first item PM10/PM2.5 numbers on success', async () => {
  const sample = {
    response: {
      body: {
        items: [
          { pm10Value: '32', pm25Value: '18', dataTime: '2026-05-21 12:00' },
        ],
      },
    },
  };
  await withMockedFetch(
    async (url) => {
      assert.match(url, /ArpltnInforInqireSvc\/getMsrstnAcctoRltmMesureDnsty/);
      assert.match(url, /serviceKey=KEY/);
      assert.match(url, /stationName=%EA%B0%95%EB%82%A8%EA%B5%AC/);
      assert.match(url, /returnType=json/);
      return { ok: true, status: 200, json: async () => sample };
    },
    async () => {
      const out = await fetchAirQuality('KEY', '강남구');
      assert.deepEqual(out, { pm10: 32, pm25: 18 });
    }
  );
});

test('fetchAirQuality: non-numeric values become null', async () => {
  const sample = {
    response: { body: { items: [{ pm10Value: '-', pm25Value: '' }] } },
  };
  await withMockedFetch(
    async () => ({ ok: true, status: 200, json: async () => sample }),
    async () => {
      const out = await fetchAirQuality('K', 'S');
      assert.deepEqual(out, { pm10: null, pm25: null });
    }
  );
});

test('fetchAirQuality: NETWORK on fetch reject', async () => {
  await withMockedFetch(
    async () => { throw new Error('boom'); },
    async () => {
      await assert.rejects(() => fetchAirQuality('K', 'S'), (e) => e.code === 'NETWORK');
    }
  );
});

test('fetchAirQuality: HTTP_STATUS on non-2xx', async () => {
  await withMockedFetch(
    async () => ({ ok: false, status: 500 }),
    async () => {
      await assert.rejects(() => fetchAirQuality('K', 'S'), (e) => e.code === 'HTTP_STATUS');
    }
  );
});

test('fetchAirQuality: JSON_PARSE when body is not valid JSON', async () => {
  await withMockedFetch(
    async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } }),
    async () => {
      await assert.rejects(() => fetchAirQuality('K', 'S'), (e) => e.code === 'JSON_PARSE');
    }
  );
});

test('fetchAirQuality: NO_ITEM when items missing or empty', async () => {
  await withMockedFetch(
    async () => ({ ok: true, status: 200, json: async () => ({ response: { body: { items: [] } } }) }),
    async () => {
      await assert.rejects(() => fetchAirQuality('K', 'S'), (e) => e.code === 'NO_ITEM');
    }
  );
  await withMockedFetch(
    async () => ({ ok: true, status: 200, json: async () => ({}) }),
    async () => {
      await assert.rejects(() => fetchAirQuality('K', 'S'), (e) => e.code === 'NO_ITEM');
    }
  );
});
