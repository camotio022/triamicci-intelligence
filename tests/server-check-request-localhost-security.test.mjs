import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRequest } from '../server/_lib.js';

function run(req, env) {
  const headers = {};
  let statusCode = 0;
  let body = null;
  const res = {
    setHeader(name, value) { headers[name] = value; },
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; }
  };
  const ok = checkRequest(req, res, env);
  return { ok, statusCode, body, headers };
}

const jsonReq = (origin, url = '/api/test') => ({
  method: 'POST',
  url,
  headers: { 'content-type': 'application/json', origin }
});

test('allows http loopback only in explicit local/dev env with exact origin+port', () => {
  const cases = [
    { env: { PUBLIC_APP_URL: 'http://localhost:3000', VERCEL_ENV: 'development' }, origin: 'http://localhost:3000' },
    { env: { PUBLIC_APP_URL: 'http://127.0.0.1:3000', VERCEL_ENV: 'development' }, origin: 'http://127.0.0.1:3000' },
    { env: { PUBLIC_APP_URL: 'http://[::1]:3000', VERCEL_ENV: 'development' }, origin: 'http://[::1]:3000' },
    { env: { PUBLIC_APP_URL: 'http://localhost:3000', APP_ENV: 'development' }, origin: 'http://localhost:3000' },
    { env: { PUBLIC_APP_URL: 'http://localhost:3000', APP_ENV: 'local' }, origin: 'http://localhost:3000' },
    { env: { PUBLIC_APP_URL: 'http://localhost:3000', NODE_ENV: 'development' }, origin: 'http://localhost:3000' }
  ];
  for (const c of cases) {
    const r = run(jsonReq(c.origin), c.env);
    assert.equal(r.ok, true, `expected allowed for ${JSON.stringify(c.env)} ${c.origin}`);
    assert.equal(r.statusCode, 0);
  }
});

test('rejects http loopback in production or preview even if other vars suggest dev', () => {
  for (const vercel of ['production', 'preview']) {
    const env = { PUBLIC_APP_URL: 'http://localhost:3000', VERCEL_ENV: vercel, APP_ENV: 'development', NODE_ENV: 'development' };
    const r = run(jsonReq('http://localhost:3000'), env);
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 503);
  }
});

test('rejects http loopback when environment is not explicitly local/development', () => {
  for (const env of [
    { PUBLIC_APP_URL: 'http://localhost:3000' },
    { PUBLIC_APP_URL: 'http://localhost:3000', APP_ENV: 'staging' },
    { PUBLIC_APP_URL: 'http://localhost:3000', NODE_ENV: 'production' },
    { PUBLIC_APP_URL: 'http://localhost:3000', VERCEL_ENV: 'production' }
  ]) {
    const r = run(jsonReq('http://localhost:3000'), env);
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 503);
  }
});

test('rejects non-loopback hosts over http in local/dev env', () => {
  for (const env of [
    { PUBLIC_APP_URL: 'http://example.com', VERCEL_ENV: 'development' },
    { PUBLIC_APP_URL: 'http://192.168.0.10:3000', APP_ENV: 'local' },
    { PUBLIC_APP_URL: 'http://myapp.local:3000', NODE_ENV: 'development' }
  ]) {
    const r = run(jsonReq(env.PUBLIC_APP_URL), env);
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 503);
  }
});

test('requires exact origin and port match for allowed local http', () => {
  const env = { PUBLIC_APP_URL: 'http://localhost:3000', VERCEL_ENV: 'development' };
  for (const origin of [
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'https://localhost:3000',
    'http://localhost:3000.evil.com',
    null,
    undefined
  ]) {
    const r = run({ method: 'POST', headers: { 'content-type': 'application/json', ...(origin == null ? {} : { origin }) } }, env);
    assert.equal(r.ok, false, `origin ${String(origin)} should be rejected`);
    assert.equal(r.statusCode, 403);
  }
});

test('keeps HTTPS mandatory and strict origin matching in production-like configured URLs', () => {
  const prod = { PUBLIC_APP_URL: 'https://app.example.com', VERCEL_ENV: 'production' };
  assert.equal(run(jsonReq('https://app.example.com'), prod).ok, true);
  assert.equal(run(jsonReq('https://evil.example.com'), prod).statusCode, 403);
  assert.equal(run(jsonReq('http://app.example.com'), prod).statusCode, 403);

  const preview = { PUBLIC_APP_URL: 'https://preview.example.com', VERCEL_ENV: 'preview' };
  assert.equal(run(jsonReq('https://preview.example.com'), preview).ok, true);
  assert.equal(run(jsonReq('http://preview.example.com'), preview).statusCode, 403);
});

test('preserves existing request guards (method, content-type, auth flow untouched)', () => {
  const env = { PUBLIC_APP_URL: 'https://app.example.com', VERCEL_ENV: 'production' };
  const method = run({ method: 'GET', headers: { 'content-type': 'application/json', origin: 'https://app.example.com' } }, env);
  assert.equal(method.ok, false);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.Allow, 'POST');

  const type = run({ method: 'POST', headers: { origin: 'https://app.example.com' } }, env);
  assert.equal(type.ok, false);
  assert.equal(type.statusCode, 415);

  const missing = run(jsonReq('https://app.example.com'), { VERCEL_ENV: 'production' });
  assert.equal(missing.ok, false);
  assert.equal(missing.statusCode, 503);
});

test('preview accepts only the exact Vercel deployment and branch origins', () => {
  const env = {
    PUBLIC_APP_URL: 'https://app.example.com',
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'exact-build.vercel.app',
    VERCEL_BRANCH_URL: 'exact-branch.vercel.app',
  };
  assert.equal(run(jsonReq('https://exact-build.vercel.app'), env).ok, true);
  assert.equal(run(jsonReq('https://exact-branch.vercel.app'), env).ok, true);
  assert.equal(run(jsonReq('https://other.vercel.app'), env).statusCode, 403);
  assert.equal(run(jsonReq('https://exact-build.vercel.app.evil.example'), env).statusCode, 403);
  assert.equal(run(jsonReq('https://exact-build.vercel.app'), {...env, VERCEL_ENV:'production'}).statusCode, 403);
});
