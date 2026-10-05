// Tests /api/bets.js against a fake Upstash (Redis REST) server — no real Redis needed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');

const HANDLER = path.join(__dirname, '..', 'api', 'bets.js');
const store = {};
let server;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer test-token') { res.writeHead(401); return res.end('{}'); }
    const [op, key] = new URL(req.url, 'http://x').pathname.split('/').filter(Boolean);
    if (op === 'get') { res.writeHead(200); return res.end(JSON.stringify({ result: store[decodeURIComponent(key)] || null })); }
    if (op === 'set') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => { store[decodeURIComponent(key)] = body; res.writeHead(200); res.end('{"result":"OK"}'); });
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise(resolve => server.listen(0, resolve));
});
after(() => server.close());

function loadHandler(env) {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  Object.assign(process.env, env);
  delete require.cache[require.resolve(HANDLER)];
  return require(HANDLER);
}
function call(handler, req) {
  const res = { statusCode: 200, body: null };
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.body = obj; return res; };
  return handler(req, res).then(() => res);
}
const env = () => ({ KV_REST_API_URL: 'http://localhost:' + server.address().port, KV_REST_API_TOKEN: 'test-token' });

test('GET returns null before anything is saved', async () => {
  const res = await call(loadHandler(env()), { method: 'GET' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { data: null });
});

test('POST saves bets and GET returns them', async () => {
  const handler = loadHandler(env());
  const payload = { bets: [{ id: 'b1', bet: 'Army -2', risk: 33, win: 30, result: 'P' }], deleted: { old: 1 }, settings: { unit: 30 } };
  assert.equal((await call(handler, { method: 'POST', body: payload })).statusCode, 200);
  const res = await call(handler, { method: 'GET' });
  assert.deepEqual(res.body.data, payload);
});

test('bets use their own key, separate from the pool setup', async () => {
  assert.ok(store['cfb-splash-pool-builder:bets']);
  assert.equal(store['cfb-splash-pool-builder:setup'], undefined);
});

test('rejects invalid payloads, oversized payloads, and unsupported methods', async () => {
  const handler = loadHandler(env());
  assert.equal((await call(handler, { method: 'POST', body: { teams: [] } })).statusCode, 400);
  assert.equal((await call(handler, { method: 'POST', body: { bets: new Array(5001).fill({}) } })).statusCode, 413);
  assert.equal((await call(handler, { method: 'DELETE' })).statusCode, 405);
});

test('reports a clear error when Redis is not connected', async () => {
  const res = await call(loadHandler({}), { method: 'GET' });
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /not connected/);
});
