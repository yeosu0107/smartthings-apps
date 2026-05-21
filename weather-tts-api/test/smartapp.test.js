import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/smartapp.js';
import { createMemoryStorage } from '../src/storage.js';

function makeConfig() {
  return {
    clientId: 'cid',
    clientSecret: 'csec',
    redirectUri: 'https://w.example.com/oauth/callback',
    openDataApiKey: 'KMA-KEY',
    weatherDeviceId: 'weather-dev',
    speakerDeviceId: 'speaker-dev',
    nx: '55',
    ny: '127',
    airStationName: '강남구',
  };
}

test('PING lifecycle echoes pingData', async () => {
  const handler = createHandler({
    config: makeConfig(), storage: createMemoryStorage(),
    fetch: async () => { throw new Error('should not be called'); },
    now: () => 1_700_000_000_000,
  });
  const res = await handler({
    httpMethod: 'POST', path: '/',
    body: JSON.stringify({ lifecycle: 'PING', pingData: { challenge: 'xyz' } }),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { statusCode: 200, pingData: { challenge: 'xyz' } });
});

test('CONFIRMATION fetches confirmationUrl and returns targetUrl', async () => {
  let visited = null;
  const handler = createHandler({
    config: makeConfig(), storage: createMemoryStorage(),
    fetch: async (url) => { visited = url; return { ok: true }; },
    now: () => 1_700_000_000_000,
  });
  const res = await handler({
    httpMethod: 'POST', path: '/',
    body: JSON.stringify({ lifecycle: 'CONFIRMATION', confirmationData: { confirmationUrl: 'https://api.smartthings.com/confirm/abc' } }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(visited, 'https://api.smartthings.com/confirm/abc');
  assert.deepEqual(JSON.parse(res.body), { targetUrl: 'https://api.smartthings.com/confirm/abc' });
});

function makeKmaNcstResp() {
  return { ok: true, json: async () => ({ response: { body: { items: { item: [
    { category: 'T1H', obsrValue: '12' },
    { category: 'PTY', obsrValue: '0' },
  ] } } } }) };
}
function makeKmaFcstResp(today) {
  return { ok: true, json: async () => ({ response: { body: { items: { item: [
    { category: 'TMX', fcstDate: today, fcstTime: '1500', fcstValue: '16' },
    { category: 'TMN', fcstDate: today, fcstTime: '0600', fcstValue: '8' },
    { category: 'POP', fcstDate: today, fcstTime: '1200', fcstValue: '20' },
  ] } } } }) };
}
function makeAirResp() {
  return { ok: true, json: async () => ({ response: { body: { items: [
    { pm10Value: '30', pm25Value: '18' },
  ] } } }) };
}

test('EVENT (switch=on) fetches sources, composes message, calls speak + switch off', async () => {
  const storage = createMemoryStorage();
  await storage.save({
    access_token: 'AT', refresh_token: 'RT',
    installed_app_id: 'iaid', expires_at: 2_000_000_000_000,
  });

  const calls = [];
  const fetchMock = async (url, init) => {
    calls.push({ url, method: init && init.method, body: init && init.body });
    if (url.includes('getUltraSrtNcst')) return makeKmaNcstResp();
    if (url.includes('getVilageFcst'))   return makeKmaFcstResp('20260521');
    if (url.includes('ArpltnInforInqireSvc')) return makeAirResp();
    if (url.includes('/devices/') && url.endsWith('/commands')) return { ok: true, json: async () => ({}) };
    throw new Error('unexpected fetch ' + url);
  };

  // Pin "now" to 2026-05-21 13:00 KST (= 04:00 UTC)
  const now = () => Date.UTC(2026, 4, 21, 4, 0, 0);

  const handler = createHandler({
    config: makeConfig(), storage, fetch: fetchMock, now,
  });
  const res = await handler({
    httpMethod: 'POST', path: '/',
    body: JSON.stringify({
      lifecycle: 'EVENT',
      eventData: { events: [{ eventType: 'DEVICE_EVENT', deviceEvent: { value: 'on' } }] },
    }),
  });
  assert.equal(res.statusCode, 200);

  const speakCall = calls.find(c => c.url.endsWith('/devices/speaker-dev/commands'));
  assert.ok(speakCall, 'speak command must be sent');
  const speakBody = JSON.parse(speakCall.body);
  assert.equal(speakBody.commands[0].capability, 'speechSynthesis');
  assert.equal(speakBody.commands[0].command, 'speak');
  const spoken = speakBody.commands[0].arguments[0];
  assert.match(spoken, /현재 기온은 12도/);
  assert.match(spoken, /낮 최고기온은 16도/);
  assert.match(spoken, /미세먼지는 좋음/);
  assert.match(spoken, /자켓이나 트렌치코트 추천드립니다/);

  const switchOff = calls.find(c => c.url.endsWith('/devices/weather-dev/commands'));
  assert.ok(switchOff, 'switch off command must be sent');
  const offBody = JSON.parse(switchOff.body);
  assert.equal(offBody.commands[0].capability, 'switch');
  assert.equal(offBody.commands[0].command, 'off');
});

test('EVENT ignores switch=off events (guard against self-trigger)', async () => {
  const handler = createHandler({
    config: makeConfig(), storage: createMemoryStorage(),
    fetch: async () => { throw new Error('must not call'); },
    now: () => 1_700_000_000_000,
  });
  const res = await handler({
    httpMethod: 'POST', path: '/',
    body: JSON.stringify({
      lifecycle: 'EVENT',
      eventData: { events: [{ eventType: 'DEVICE_EVENT', deviceEvent: { value: 'off' } }] },
    }),
  });
  assert.equal(res.statusCode, 200);
});
