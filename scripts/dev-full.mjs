import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';

const cwd = process.cwd();
const FRONTEND_PORT = 5173;
const BACKEND_PORT = 3001;
const HOST = '127.0.0.1';

function checkPort(port, host = HOST) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.unref();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, host);
  });
}

async function ensurePorts() {
  const [frontFree, backFree] = await Promise.all([
    checkPort(FRONTEND_PORT, '127.0.0.1'),
    checkPort(BACKEND_PORT, '127.0.0.1'),
  ]);
  const problems = [];
  if (!frontFree) problems.push(`frontend:${FRONTEND_PORT}`);
  if (!backFree) problems.push(`backend:${BACKEND_PORT}`);
  if (problems.length) {
    console.error(`Porta(s) indisponível(is): ${problems.join(', ')}. Libere as portas 5173 e 3001 antes de iniciar.`);
    process.exit(1);
  }
}

function spawnManaged(command, args, name, { onError } = {}) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    shell: false,
    windowsHide: false,
  });
  child.on('error', (error) => {
    console.error(`[${name}] failed to start:`, error.message);
    onError?.(error);
  });
  return child;
}

function killTree(child) {
  if (!child || child.pid == null || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: false });
      killer.on('exit', () => resolve());
      killer.on('error', () => {
        try { child.kill(); } catch {}
        resolve();
      });
      return;
    }
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => {
      try { if (child.exitCode === null) child.kill('SIGKILL'); } catch {}
      resolve();
    }, 500).unref?.();
  });
}

await ensurePorts();

let shuttingDown = false;
let exitCode = 0;
let backend;
let frontend;

async function shutdown(code = 0, reason = 'shutdown') {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;
  console.log(`\nEncerrando serviços locais (${reason})...`);
  await Promise.all([killTree(frontend), killTree(backend)]);
  process.exit(exitCode);
}

backend = spawnManaged(process.execPath, ['--watch', path.join('scripts', 'local-api-server.mjs')], 'backend', {
  onError: () => { void shutdown(1, 'backend-start-error'); },
});

const frontendCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
const frontendArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm', 'run', 'dev']
  : ['run', 'dev'];
frontend = spawnManaged(frontendCommand, frontendArgs, 'frontend', {
  onError: () => { void shutdown(1, 'frontend-start-error'); },
});

process.on('SIGINT', () => { void shutdown(130, 'SIGINT'); });
process.on('SIGTERM', () => { void shutdown(143, 'SIGTERM'); });

backend.on('exit', (code, signal) => {
  if (shuttingDown) return;
  const failed = code !== 0;
  console.error(`[backend] exited${signal ? ` with signal ${signal}` : ` with code ${code}`}`);
  void shutdown(failed ? (code ?? 1) : 0, 'backend-exit');
});

frontend.on('exit', (code, signal) => {
  if (shuttingDown) return;
  const failed = code !== 0;
  console.error(`[frontend] exited${signal ? ` with signal ${signal}` : ` with code ${code}`}`);
  void shutdown(failed ? (code ?? 1) : 0, 'frontend-exit');
});
