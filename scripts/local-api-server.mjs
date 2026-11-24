import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvFile, applyLocalDevEnv, createLocalApiServer, assertPortAvailable } from './local-dev-server-lib.mjs';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env.local');
// Load private vars only in backend process.
loadEnvFile(envPath);
applyLocalDevEnv({ browserOrigin: 'http://localhost:5173' });

const host = '127.0.0.1';
const port = Number(process.env.LOCAL_API_PORT || 3001);

await assertPortAvailable(port, host, 'backend');
const server = createLocalApiServer();
server.on('error', (err) => {
  console.error('Local API server failed:', err?.code || err?.message || err);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`Local API server listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`\nShutting down local API server (${signal})...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
