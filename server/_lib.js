import admin from 'firebase-admin';
import { createHash, randomBytes } from 'node:crypto';

export const roles = ['admin','manager','submanager','cook','auxiliar'];
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeEmail = email => typeof email === 'string' ? email.trim().toLowerCase() : '';
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('SERVER_NOT_CONFIGURED');
    const credential = JSON.parse(raw);
    const expected = process.env.FIREBASE_EXPECTED_PROJECT_ID;
    const staging = process.env.APP_ENV === 'staging';
    if (staging && (!expected || expected === 'triamicci-intelligence')) {
      throw new Error('STAGING_PROJECT_REQUIRED');
    }
    if (expected && credential.project_id !== expected) {
      throw new Error('FIREBASE_PROJECT_MISMATCH');
    }
    admin.initializeApp({ credential: admin.credential.cert(credential) });
  }
  return admin.firestore();
}
export function getAuth() { getDb(); return admin.auth(); }
export function send(res, status, message, extra = {}) { return res.status(status).json({ message, ...extra }); }
export function checkRequest(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); send(res,405,'Método não permitido.'); return false; }
  if (!req.headers['content-type']?.startsWith('application/json')) { send(res,415,'Use JSON.'); return false; }
  const configuredUrl = process.env.PUBLIC_APP_URL?.trim();
  if (!configuredUrl) { send(res,503,'PUBLIC_APP_URL não configurada.'); return false; }
  let allowedOrigin;
  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Invalid app URL');
    allowedOrigin = parsed.origin;
  } catch {
    send(res,503,'PUBLIC_APP_URL inválida. Configure uma URL HTTPS completa.');
    return false;
  }
  // O cabeçalho Origin é gerado pelo navegador. Exigir correspondência exata,
  // mas ignorar barras finais e caminhos na URL configurada.
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin !== allowedOrigin) {
    send(res,403,'Origem não autorizada. Confirme o domínio e PUBLIC_APP_URL.');
    return false;
  }
  return true;
}
export async function authenticate(req) {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!match) throw new Error('UNAUTHENTICATED');
  return getAuth().verifyIdToken(match[1], true);
}
export async function membership(uid) {
  const snap = await getDb().doc('memberships/' + uid).get();
  return snap.exists && snap.data().status === 'active' ? snap.data() : null;
}
export async function deliverInvite({ to, url, unitId, role }) {
  if (!process.env.RESEND_API_KEY || !process.env.INVITE_FROM_EMAIL) throw new Error('EMAIL_NOT_CONFIGURED');
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{'Authorization':'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({
      from:process.env.INVITE_FROM_EMAIL, to:[to],
      subject:'Convite para Triamicci Intelligence',
      text:'Você foi convidado para a unidade '+unitId+' como '+role+'. Abra este link para aceitar (válido por 7 dias): '+url
    })
  });
  if (!response.ok) throw new Error('EMAIL_DELIVERY_FAILED');
}
