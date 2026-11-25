import { applyHomologServerEnv, assertHomologSafety, waitForHttp, HOMOLOG_AUTH_HOST, HOMOLOG_AUTH_PORT, HOMOLOG_FIRESTORE_HOST, HOMOLOG_FIRESTORE_PORT, clearHomologData } from './homolog-env.mjs';

applyHomologServerEnv(process.env);
assertHomologSafety(process.env);

await waitForHttp(`http://${HOMOLOG_FIRESTORE_HOST}:${HOMOLOG_FIRESTORE_PORT}/`, { timeoutMs: 15000 }).catch(() => {
  throw new Error('Firestore emulator is not running. Start emulators first (npm run homolog:emulators).');
});
await waitForHttp(`http://${HOMOLOG_AUTH_HOST}:${HOMOLOG_AUTH_PORT}/`, { timeoutMs: 15000 }).catch(() => {
  throw new Error('Auth emulator is not running. Start emulators first (npm run homolog:emulators).');
});

const result = await clearHomologData();
console.log(`Homologation data cleared (Firestore ${result.firestore}, Auth ${result.auth}).`);
console.log('Run `npm run homolog:seed` to populate the reproducible scenario.');
