import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

export const HOMOLOG_PROJECT_ID = 'demo-triamicci-v31';
export const PRODUCTION_PROJECT_ID = 'triamicci-intelligence';
export const HOMOLOG_UNIT_ID = 'homolog-unit';
export const HOMOLOG_FIRESTORE_HOST = '127.0.0.1';
export const HOMOLOG_FIRESTORE_PORT = 8080;
export const HOMOLOG_AUTH_HOST = '127.0.0.1';
export const HOMOLOG_AUTH_PORT = 9099;
export const HOMOLOG_STORAGE_HOST = '127.0.0.1';
export const HOMOLOG_STORAGE_PORT = 9199;
export const HOMOLOG_API_HOST = '127.0.0.1';
export const HOMOLOG_API_PORT = 3001;
export const HOMOLOG_WEB_ORIGIN = 'http://localhost:5173';

export function assertHomologSafety(env = process.env) {
  if (String(env.FIREBASE_PROJECT_ID || '') === PRODUCTION_PROJECT_ID) throw new Error('UNSAFE_PRODUCTION_FIREBASE_PROJECT');
  if (String(env.GOOGLE_CLOUD_PROJECT || '') === PRODUCTION_PROJECT_ID) throw new Error('UNSAFE_PRODUCTION_GOOGLE_CLOUD_PROJECT');
  if (String(env.GCLOUD_PROJECT || '') === PRODUCTION_PROJECT_ID) throw new Error('UNSAFE_PRODUCTION_GCLOUD_PROJECT');
  if (String(env.FIREBASE_EXPECTED_PROJECT_ID || '') === PRODUCTION_PROJECT_ID) throw new Error('UNSAFE_PRODUCTION_EXPECTED_PROJECT');
  if (String(env.VITE_FIREBASE_PROJECT_ID || '') === PRODUCTION_PROJECT_ID) throw new Error('UNSAFE_PRODUCTION_VITE_PROJECT');
}

export function applyHomologServerEnv(env = process.env) {
  // Hard guard: homologation must never target the production project.
  assertHomologSafety(env);
  env.APP_ENV = 'homologation';
  env.NODE_ENV = 'development';
  env.PUBLIC_APP_URL = HOMOLOG_WEB_ORIGIN;
  env.FIREBASE_EXPECTED_PROJECT_ID = HOMOLOG_PROJECT_ID;
  env.GCLOUD_PROJECT = HOMOLOG_PROJECT_ID;
  env.GOOGLE_CLOUD_PROJECT = HOMOLOG_PROJECT_ID;
  env.FIRESTORE_EMULATOR_HOST = `${HOMOLOG_FIRESTORE_HOST}:${HOMOLOG_FIRESTORE_PORT}`;
  env.FIREBASE_AUTH_EMULATOR_HOST = `${HOMOLOG_AUTH_HOST}:${HOMOLOG_AUTH_PORT}`;
  env.STORAGE_EMULATOR_HOST = `http://${HOMOLOG_STORAGE_HOST}:${HOMOLOG_STORAGE_PORT}`;
  // Do not load or use production service-account credentials in emulator mode.
  delete env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  // Optional local-only test values; no external delivery.
  env.INVITE_FROM_EMAIL = env.INVITE_FROM_EMAIL || 'homologacao@localhost.test';
  env.RESEND_API_KEY = '';
  assertHomologSafety(env);
  return env;
}

export function applyHomologWebEnv(env = process.env) {
  assertHomologSafety(env);
  env.VITE_APP_ENV = 'local';
  env.VITE_USE_FIREBASE_EMULATORS = 'true';
  env.VITE_FIREBASE_PROJECT_ID = HOMOLOG_PROJECT_ID;
  env.VITE_FIREBASE_API_KEY = 'demo-triamicci-local-key';
  env.VITE_FIREBASE_AUTH_DOMAIN = `${HOMOLOG_PROJECT_ID}.firebaseapp.com`;
  env.VITE_FIREBASE_STORAGE_BUCKET = `${HOMOLOG_PROJECT_ID}.appspot.com`;
  env.VITE_FIREBASE_MESSAGING_SENDER_ID = '0';
  env.VITE_FIREBASE_APP_ID = '1:0:web:demotriamiccihomolog';
  env.VITE_FIREBASE_AUTH_EMULATOR_HOST = `${HOMOLOG_AUTH_HOST}:${HOMOLOG_AUTH_PORT}`;
  env.VITE_FIRESTORE_EMULATOR_HOST = HOMOLOG_FIRESTORE_HOST;
  env.VITE_FIRESTORE_EMULATOR_PORT = String(HOMOLOG_FIRESTORE_PORT);
  env.VITE_USE_VERCEL_API = 'true';
  assertHomologSafety(env);
  return env;
}

export async function waitForHttp(url, { timeoutMs = 30000, intervalMs = 500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(res.statusCode || 0);
        });
        req.on('error', reject);
        req.setTimeout(2000, () => req.destroy(new Error('timeout')));
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  throw new Error(`TIMEOUT_WAITING_FOR:${url}`);
}

export async function isPortFree(port, host = '127.0.0.1') {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function emulatorRequest(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: res.ok, status: res.status, json, text };
}

export async function clearHomologData() {
  const project = HOMOLOG_PROJECT_ID;
  const firestore = await emulatorRequest('DELETE', `http://${HOMOLOG_FIRESTORE_HOST}:${HOMOLOG_FIRESTORE_PORT}/emulator/v1/projects/${project}/databases/(default)/documents`);
  const auth = await emulatorRequest('DELETE', `http://${HOMOLOG_AUTH_HOST}:${HOMOLOG_AUTH_PORT}/emulator/v1/projects/${project}/accounts`);
  if (!firestore.ok) throw new Error(`FIRESTORE_CLEAR_FAILED:${firestore.status}`);
  if (!auth.ok) throw new Error(`AUTH_CLEAR_FAILED:${auth.status}`);
  return { firestore: firestore.status, auth: auth.status };
}

export function ensureHomologDataDir(cwd = process.cwd()) {
  const dir = path.join(cwd, '.firebase', 'homolog-data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}