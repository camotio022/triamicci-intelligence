import path from 'node:path';
import { loadEnvFile, createLocalApiServer, assertPortAvailable } from './local-dev-server-lib.mjs';
import { applyHomologServerEnv, HOMOLOG_API_HOST, HOMOLOG_API_PORT, assertHomologSafety } from './homolog-env.mjs';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env.local');
// Load .env.local only for non-conflicting values; homologation env is enforced below.
loadEnvFile(envPath);
applyHomologServerEnv(process.env);
assertHomologSafety(process.env);

await assertPortAvailable(HOMOLOG_API_PORT, HOMOLOG_API_HOST, 'homolog-api');
const server = createLocalApiServer({ bustCache: true });
server.on('error', (err) => {
  console.error('Homologation API server failed:', err?.code || err?.message || String(err));
  process.exit(1);
});
server.listen(HOMOLOG_API_PORT, HOMOLOG_API_HOST, () => {
  console.log(`Homologation API listening on http://${HOMOLOG_API_HOST}:${HOMOLOG_API_PORT} (emulator-only, demo project).`);
});

function shutdown(signal) {
  console.log(`\nShutting down homologation API (${signal})...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
