import { spawn } from 'node:child_process';
import path from 'node:path';
import { HOMOLOG_PROJECT_ID, HOMOLOG_FIRESTORE_HOST, HOMOLOG_FIRESTORE_PORT, HOMOLOG_AUTH_HOST, HOMOLOG_AUTH_PORT, HOMOLOG_WEB_ORIGIN, HOMOLOG_API_PORT, waitForHttp, assertHomologSafety } from './homolog-env.mjs';

assertHomologSafety({ APP_ENV: 'homologation', FIREBASE_EXPECTED_PROJECT_ID: HOMOLOG_PROJECT_ID });

const cwd = process.cwd();
const children = new Set();
const isWin = process.platform === 'win32';

function spawnNode(script, envExtra = {}) {
  const child = spawn(process.execPath, [path.join(cwd, script)], {
    cwd,
    env: { ...process.env, ...envExtra },
    stdio: 'inherit',
  });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

function spawnFirebase() {
  const cmd = isWin ? 'firebase.cmd' : 'firebase';
  const args = ['emulators:start', '--project', HOMOLOG_PROJECT_ID, '--only', 'auth,firestore'];
  const child = spawn(cmd, args, { cwd, env: process.env, stdio: 'inherit', shell: isWin });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try { child.kill('SIGTERM'); } catch {}
  }
  setTimeout(() => process.exit(code), 1500).unref();
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting homologation emulators (Auth+Firestore only, demo project)...');
const emu = spawnFirebase();
emu.on('exit', (code) => { if (!shuttingDown) { console.error('Emulators exited unexpectedly.'); shutdown(code || 1); } });

await waitForHttp(`http://${HOMOLOG_FIRESTORE_HOST}:${HOMOLOG_FIRESTORE_PORT}/`, { timeoutMs: 60000 });
await waitForHttp(`http://${HOMOLOG_AUTH_HOST}:${HOMOLOG_AUTH_PORT}/`, { timeoutMs: 60000 });
console.log('Emulators ready. Starting homologation API...');
const api = spawnNode('scripts/homolog-api.mjs');
await waitForHttp(`http://${HOMOLOG_FIRESTORE_HOST}:${HOMOLOG_FIRESTORE_PORT}/`, { timeoutMs: 2000 }).catch(() => {});
console.log(`Homologation API starting on port ${HOMOLOG_API_PORT}. Starting homologation web...`);
spawnNode('scripts/homolog-web.mjs');

console.log(`\nHomologation environment starting.
- Emulators: Auth ${HOMOLOG_AUTH_HOST}:${HOMOLOG_AUTH_PORT}, Firestore ${HOMOLOG_FIRESTORE_HOST}:${HOMOLOG_FIRESTORE_PORT} (project ${HOMOLOG_PROJECT_ID})
- API: http://127.0.0.1:${HOMOLOG_API_PORT}
- Web: ${HOMOLOG_WEB_ORIGIN}
Run "npm run homolog:seed" in another terminal after services are ready to populate data.
Run "npm run homolog:restore" to reset and repopulate. Press Ctrl+C to stop.`);
