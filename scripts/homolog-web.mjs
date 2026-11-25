import { spawn } from 'node:child_process';
import { applyHomologWebEnv, HOMOLOG_WEB_ORIGIN, assertHomologSafety } from './homolog-env.mjs';

applyHomologWebEnv(process.env);
assertHomologSafety(process.env);

const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npx', 'vite', '--host', 'localhost', '--port', '5173', '--strictPort', '--mode', 'homologation']
  : ['vite', '--host', 'localhost', '--port', '5173', '--strictPort', '--mode', 'homologation'];

console.log(`Starting homologation web at ${HOMOLOG_WEB_ORIGIN} (Firebase emulators only).`);
const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  shell: false,
});

child.on('error', (error) => {
  console.error('Homologation web failed to start:', error?.message || String(error));
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
process.on('SIGINT', () => { try { child.kill('SIGINT'); } catch {} });
process.on('SIGTERM', () => { try { child.kill('SIGTERM'); } catch {} });
