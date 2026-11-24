import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import {
  loadEnvFile,
  applyLocalDevEnv,
  readRequestBody,
  enhanceResponse,
  enhanceRequest,
  resolveApiHandler,
  createLocalApiServer,
  checkPortAvailable,
} from '../scripts/local-dev-server-lib.mjs';

async function listen(server, host = '127.0.0.1', port = 0) {
  server.listen(port, host);
  await once(server, 'listening');
  const addr = server.address();
  return { host, port: addr.port, baseUrl: `http://${host}:${addr.port}` };
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}

test('loadEnvFile loads private vars into process.env without overriding existing values', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tri-local-env-'));
  const file = path.join(dir, '.env.local');
  await fs.writeFile(file, [
    'SECRET_TOKEN=abc123',
    'QUOTED="hello world"',
    "SINGLE='x'",
    'INLINE=value # comment',
    'EXISTING=fromfile',
  ].join('\n'), 'utf8');
  const prev = { ...process.env };
  try {
    delete process.env.SECRET_TOKEN;
    delete process.env.QUOTED;
    delete process.env.SINGLE;
    delete process.env.INLINE;
    process.env.EXISTING = 'already-set';
    loadEnvFile(file);
    assert.equal(process.env.SECRET_TOKEN, 'abc123');
    assert.equal(process.env.QUOTED, 'hello world');
    assert.equal(process.env.SINGLE, 'x');
    assert.equal(process.env.INLINE, 'value');
    assert.equal(process.env.EXISTING, 'already-set');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in prev)) delete process.env[k];
    for (const [k, v] of Object.entries(prev)) process.env[k] = v;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('loadEnvFile preserves Firebase service account JSON containing escaped newline sequences', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tri-local-env-sa-'));
  const file = path.join(dir, '.env.local');
  const serviceAccount = '{"type":"service_account","project_id":"triamicci-intelligence","private_key":"-----BEGIN PRIVATE KEY-----\\nLINE1\\nLINE2\\n-----END PRIVATE KEY-----\\n","client_email":"svc@example.iam.gserviceaccount.com"}';
  await fs.writeFile(file, `FIREBASE_SERVICE_ACCOUNT_JSON=${serviceAccount}\n`, 'utf8');
  const prev = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  try {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    loadEnvFile(file);
    const loaded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    assert.equal(typeof loaded, 'string');
    const parsed = JSON.parse(loaded);
    assert.equal(parsed.project_id, 'triamicci-intelligence');
    assert.match(parsed.private_key, /-----BEGIN PRIVATE KEY-----\nLINE1\nLINE2\n-----END PRIVATE KEY-----\n/);
    assert.equal(parsed.client_email, 'svc@example.iam.gserviceaccount.com');
  } finally {
    if (prev === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prev;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('applyLocalDevEnv sets PUBLIC_APP_URL to browser origin and enables local dev mode', () => {
  const prev = { APP_ENV: process.env.APP_ENV, NODE_ENV: process.env.NODE_ENV, PUBLIC_APP_URL: process.env.PUBLIC_APP_URL };
  try {
    delete process.env.APP_ENV;
    process.env.NODE_ENV = 'test';
    process.env.PUBLIC_APP_URL = 'https://example.invalid';
    applyLocalDevEnv({ browserOrigin: 'http://localhost:5173' });
    assert.equal(process.env.PUBLIC_APP_URL, 'http://localhost:5173');
    assert.equal(process.env.APP_ENV, 'local');
    assert.equal(process.env.NODE_ENV, 'development');
  } finally {
    if (prev.APP_ENV === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = prev.APP_ENV;
    if (prev.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev.NODE_ENV;
    if (prev.PUBLIC_APP_URL === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = prev.PUBLIC_APP_URL;
  }
});

test('request/response adapters parse JSON body, query, headers and support status/json chaining', async () => {
  const server = http.createServer(async (req, res) => {
    enhanceRequest(req);
    enhanceResponse(res);
    req.body = await readRequestBody(req);
    res.setHeader('X-Echo-Origin', req.headers.origin || '');
    res.setHeader('X-Echo-Auth', req.headers.authorization || '');
    res.status(201).json({ ok: true, method: req.method, body: req.body, query: req.query, path: req.url });
  });
  const { baseUrl } = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/test?foo=bar&foo=baz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', Authorization: 'Bearer token-123' },
      body: JSON.stringify({ action: 'ping', nested: { a: 1 } }),
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('x-echo-origin'), 'http://localhost:5173');
    assert.equal(response.headers.get('x-echo-auth'), 'Bearer token-123');
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.equal(data.method, 'POST');
    assert.deepEqual(data.body, { action: 'ping', nested: { a: 1 } });
    assert.deepEqual(data.query.foo, ['bar', 'baz']);
  } finally {
    await close(server);
  }
});

test('resolveApiHandler maps /api routes safely inside api dir', () => {
  const root = path.resolve('C:/tmp/fake-api-root');
  assert.equal(resolveApiHandler('/api/operations/stock', root), path.join(root, 'operations', 'stock.js'));
  assert.equal(resolveApiHandler('/api/catalog/manage/', root), path.join(root, 'catalog', 'manage.js'));
  assert.equal(resolveApiHandler('/api/../secret', root), null);
  assert.equal(resolveApiHandler('/api/operations/../../x', root), null);
  assert.equal(resolveApiHandler('/not-api/x', root), null);
});

test('createLocalApiServer routes to handlers, returns 404/400, and supports streaming responses', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tri-local-api-'));
  const opsDir = path.join(dir, 'operations');
  const aiDir = path.join(dir, 'ai');
  await fs.mkdir(opsDir, { recursive: true });
  await fs.mkdir(aiDir, { recursive: true });
  await fs.writeFile(path.join(opsDir, 'stock.js'), `export default async function handler(req,res){ if(req.method!=='POST') return res.status(405).json({message:'Método não permitido.'}); return res.status(200).json({message:'ok', body:req.body, origin:req.headers.origin||null, auth:req.headers.authorization||null}); }`, 'utf8');
  await fs.writeFile(path.join(aiDir, 'stream.js'), `export default async function handler(req,res){ res.statusCode=200; res.setHeader('Content-Type','text/event-stream; charset=utf-8'); res.setHeader('Cache-Control','no-cache, no-transform'); res.flushHeaders?.(); res.write('data: {"type":"delta","text":"hi"}\\n\\n'); res.write('data: {"type":"done"}\\n\\n'); res.end(); }`, 'utf8');
  await fs.writeFile(path.join(opsDir, 'echo-close.js'), `export default async function handler(req,res){ res.on('close',()=>{}); return res.status(200).json({closeBound: res.listenerCount('close') > 0}); }`, 'utf8');

  const server = createLocalApiServer({ apiDir: dir, bustCache: true });
  const { baseUrl } = await listen(server);
  try {
    const ok = await fetch(`${baseUrl}/api/operations/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', Authorization: 'Bearer secret' },
      body: JSON.stringify({ action: 'list' }),
    });
    assert.equal(ok.status, 200);
    const okData = await ok.json();
    assert.equal(okData.message, 'ok');
    assert.deepEqual(okData.body, { action: 'list' });
    assert.equal(okData.origin, 'http://localhost:5173');
    assert.equal(okData.auth, 'Bearer secret');

    const missing = await fetch(`${baseUrl}/api/operations/missing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(missing.status, 404);

    const badJson = await fetch(`${baseUrl}/api/operations/stock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(badJson.status, 400);

    const stream = await fetch(`${baseUrl}/api/ai/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type') || '', /text\/event-stream/);
    const text = await stream.text();
    assert.match(text, /"type":"delta"/);
    assert.match(text, /"type":"done"/);

    const closeRes = await fetch(`${baseUrl}/api/operations/echo-close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await closeRes.json()).closeBound, true);
  } finally {
    await close(server);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('checkPortAvailable detects occupied loopback port', async () => {
  const server = http.createServer((_, res) => res.end('ok'));
  const { port } = await listen(server, '127.0.0.1', 0);
  try {
    assert.equal(await checkPortAvailable(port, '127.0.0.1'), false);
  } finally {
    await close(server);
  }
  assert.equal(await checkPortAvailable(port, '127.0.0.1'), true);
});
