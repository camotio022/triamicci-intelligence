import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

const cwd = process.cwd();
const API_DIR = path.join(cwd, 'api');

export function loadEnvFile(filePath) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(filePath);
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return;
      throw error;
    }
    return;
  }

  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rest] = match;
    if (process.env[key] !== undefined) continue;
    let value = rest.trim();
    const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trimEnd();
    }
    value = value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"');
    process.env[key] = value;
  }
}

export function applyLocalDevEnv({ browserOrigin = 'http://localhost:5173' } = {}) {
  // Backend-only local dev adjustments. Never print env values.
  const vercelEnv = process.env.VERCEL_ENV;
  const deployed = vercelEnv === 'production' || vercelEnv === 'preview';
  if (!deployed) {
    process.env.APP_ENV = 'local';
    process.env.NODE_ENV = 'development';
  }
  process.env.PUBLIC_APP_URL = browserOrigin;
}

export async function readRequestBody(req) {
  const method = (req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return undefined;
  const type = String(req.headers['content-type'] || '').toLowerCase();
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return type.startsWith('application/json') ? {} : undefined;
  const buffer = Buffer.concat(chunks);
  const text = buffer.toString('utf8');
  if (!text.trim()) return type.startsWith('application/json') ? {} : undefined;
  if (type.startsWith('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      const error = new Error('INVALID_JSON_BODY');
      error.statusCode = 400;
      throw error;
    }
  }
  return text;
}

export function enhanceResponse(res) {
  if (typeof res.status !== 'function') {
    res.status = function status(code) {
      this.statusCode = code;
      return this;
    };
  }
  if (typeof res.json !== 'function') {
    res.json = function json(payload) {
      if (!this.getHeader('Content-Type')) {
        this.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      this.end(JSON.stringify(payload));
      return this;
    };
  }
  if (typeof res.send !== 'function') {
    res.send = function send(payload) {
      if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
        return this.json(payload);
      }
      return this.end(payload);
    };
  }
  return res;
}

export function enhanceRequest(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const query = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      const current = query[key];
      query[key] = Array.isArray(current) ? [...current, value] : [current, value];
    } else {
      query[key] = value;
    }
  }
  req.query = query;
  return req;
}

export function resolveApiHandler(pathname, apiDir = API_DIR) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/api/')) return null;
  let route = pathname.slice('/api/'.length).replace(/\/+$/, '');
  if (!route) return null;
  const segments = route.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\\') || segment.includes('\0'))) {
    return null;
  }
  const root = path.resolve(apiDir);
  const candidate = path.resolve(path.join(root, ...segments) + '.js');
  if (!(candidate === root || candidate.startsWith(root + path.sep))) return null;
  return candidate;
}

export async function invokeHandler(handlerPath, req, res, { bustCache = false } = {}) {
  const baseUrl = pathToFileURL(handlerPath).href;
  const moduleUrl = bustCache ? `${baseUrl}?t=${Date.now()}-${Math.random()}` : baseUrl;
  const mod = await import(moduleUrl);
  const handler = mod.default || mod;
  if (typeof handler !== 'function') {
    throw new Error('INVALID_HANDLER_EXPORT');
  }
  return await handler(req, res);
}

export function createLocalApiServer({ apiDir = API_DIR, bustCache = false } = {}) {
  const root = path.resolve(apiDir);
  return http.createServer(async (req, res) => {
    enhanceResponse(res);
    enhanceRequest(req);
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const handlerPath = resolveApiHandler(url.pathname, root);
      if (!handlerPath || !fs.existsSync(handlerPath) || !(handlerPath === root || handlerPath.startsWith(root + path.sep))) {
        res.status(404).json({ message: 'Rota de API não encontrada no servidor local.' });
        return;
      }
      try {
        req.body = await readRequestBody(req);
      } catch (error) {
        if (error.message === 'INVALID_JSON_BODY') {
          res.status(400).json({ message: 'JSON inválido.' });
          return;
        }
        throw error;
      }
      await invokeHandler(handlerPath, req, res, { bustCache });
      if (!res.writableEnded && !res.headersSent) {
        res.status(500).json({ message: 'A API local não retornou resposta.' });
      }
    } catch (error) {
      console.error('Local API server error:', error?.message || String(error));
      if (!res.headersSent && !res.writableEnded) {
        res.status(500).json({ message: 'Falha no servidor local de API.' });
      } else if (!res.writableEnded) {
        try { res.end(); } catch {}
      }
    }
  });
}

export async function checkPortAvailable(port, host = '127.0.0.1') {
  return await new Promise((resolve) => {
    const tester = net.createServer();
    tester.unref();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, host);
  });
}

export async function assertPortAvailable(port, host = '127.0.0.1', label = String(port)) {
  const available = await checkPortAvailable(port, host);
  if (!available) {
    const error = new Error(`PORT_IN_USE:${label}:${host}:${port}`);
    error.code = 'PORT_IN_USE';
    throw error;
  }
}
