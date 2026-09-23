// Tests /api/setup.js against a fake Upstash (Redis REST) server — no real Redis needed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');

const HANDLER = path.join(__dirname, '..', 'api', 'setup.js');
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

test('POST saves a setup and GET returns it', async () => {
  const handler = loadHandler(env());
  const payload = { teams: [{ id: 't1', name: 'Purdue +14.5' }], overlap: 3, result: null, history: [] };
  assert.equal((await call(handler, { method: 'POST', body: payload })).statusCode, 200);
  const res = await call(handler, { method: 'GET' });
  assert.deepEqual(res.body.data, payload);
});

test('rejects invalid payloads and unsupported methods', async () => {
  const handler = loadHandler(env());
  assert.equal((await call(handler, { method: 'POST', body: { overlap: 3 } })).statusCode, 400);
  assert.equal((await call(handler, { method: 'DELETE' })).statusCode, 405);
});

test('reports a clear error when Redis is not connected', async () => {
  const res = await call(loadHandler({}), { method: 'GET' });
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /not connected/);
});
