import {TEAM_ROLES} from './permissions/v31-policy.js';
import {verifyTerminalCredential} from './terminals/policy.js';
import admin from 'firebase-admin';
import { createHash, randomBytes } from 'node:crypto';

export const roles=TEAM_ROLES;
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeEmail = email => typeof email === 'string' ? email.trim().toLowerCase() : '';
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

const PRODUCTION_FIREBASE_PROJECT_ID = 'triamicci-intelligence';

function emulatorHostsConfigured(env = process.env) {
  return Boolean(String(env.FIRESTORE_EMULATOR_HOST || '').trim() && String(env.FIREBASE_AUTH_EMULATOR_HOST || '').trim());
}
export function isFirebaseEmulatorMode(env = process.env) {
  return emulatorHostsConfigured(env) && (env.APP_ENV === 'local' || env.APP_ENV === 'homologation') && String(env.FIREBASE_EXPECTED_PROJECT_ID || '').startsWith('demo-');
}
function assertSafeFirebaseProject(projectId, env = process.env) {
  if (!projectId || projectId === PRODUCTION_FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_UNSAFE');
  }
  if (isFirebaseEmulatorMode(env)) {
    if (!String(projectId).startsWith('demo-')) throw new Error('EMULATOR_PROJECT_REQUIRED');
    return;
  }
  const staging = env.APP_ENV === 'staging';
  const expected = env.FIREBASE_EXPECTED_PROJECT_ID;
  if (staging && (!expected || expected === PRODUCTION_FIREBASE_PROJECT_ID)) {
    throw new Error('STAGING_PROJECT_REQUIRED');
  }
  if (expected && projectId !== expected) {
    throw new Error('FIREBASE_PROJECT_MISMATCH');
  }
}

export function getDb() {
  if (!admin.apps.length) {
    const env = process.env;
    if (isFirebaseEmulatorMode(env)) {
      const projectId = String(env.FIREBASE_EXPECTED_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || '').trim();
      assertSafeFirebaseProject(projectId, env);
      if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const credential = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
        assertSafeFirebaseProject(credential.project_id, env);
        admin.initializeApp({ credential: admin.credential.cert(credential), projectId });
      } else {
        admin.initializeApp({ projectId });
      }
    } else {
      if (emulatorHostsConfigured(env)) throw new Error('EMULATOR_ENV_UNSAFE');
      const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!raw) throw new Error('SERVER_NOT_CONFIGURED');
      const credential = JSON.parse(raw);
      assertSafeFirebaseProject(credential.project_id, env);
      admin.initializeApp({ credential: admin.credential.cert(credential) });
    }
  }
  return admin.firestore();
}
export function getAuth() { getDb(); return admin.auth(); }
export function send(res, status, message, extra = {}) { return res.status(status).json({ message, ...extra }); }
function isExplicitLocalDevEnv(env = process.env) {
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv === 'production' || vercelEnv === 'preview') return false;
  if (vercelEnv === 'development') return true;
  return env.APP_ENV === 'development' || env.APP_ENV === 'local' || env.NODE_ENV === 'development';
}
function isLoopbackHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}
export function checkRequest(req, res, env = process.env) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); send(res,405,'Método não permitido.'); return false; }
  if (!req.headers['content-type']?.startsWith('application/json')) { send(res,415,'Use JSON.'); return false; }
  const configuredUrl = (env.PUBLIC_APP_URL || '').trim();
  if (!configuredUrl) { send(res,503,'PUBLIC_APP_URL não configurada.'); return false; }
  let allowedOrigin;
  try {
    const parsed = new URL(configuredUrl);
    const allowInsecureLocal = parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname) && isExplicitLocalDevEnv(env);
    if ((!allowInsecureLocal && parsed.protocol !== 'https:') || parsed.username || parsed.password) throw new Error('Invalid app URL');
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
  if(match[1].startsWith('ts1.')){
    const {session,member}=await verifyTerminalCredential(match[1],getDb());
    let account;
    try{account=await getAuth().getUser(session.uid)}catch(e){if(e.code==='auth/user-not-found')throw Error('UNAUTHENTICATED');throw e}
    if(account.disabled||(account.tokensValidAfterTime&&Date.parse(account.tokensValidAfterTime)>session.createdAt.toMillis())){
      await getDb().doc('terminalSessions/'+session.id).update({state:'ended',endedAt:new Date(),endReason:'account-revoked'});
      throw Error('UNAUTHENTICATED');
    }
    req.terminalIdentity={terminalId:session.terminalId,sessionId:session.id,uid:session.uid};
    await getDb().collection('auditLogs').add({event:'terminal.request_authorized',at:new Date(),unitId:member.unitId,actorUid:session.uid,terminalId:session.terminalId,sessionId:session.id,action:String(req.body?.action||'').slice(0,80),module:String(req.body?.module||'').slice(0,80),path:String(req.url||'').split('?')[0].slice(0,150)});
    return {uid:session.uid,email:member.email||'',terminalId:session.terminalId,terminalSessionId:session.id};
  }
  try{return await getAuth().verifyIdToken(match[1], !isFirebaseEmulatorMode())}catch(error){
    if(['auth/argument-error','auth/invalid-id-token','auth/id-token-expired','auth/id-token-revoked','auth/user-disabled','auth/user-not-found'].includes(error.code))throw new Error('UNAUTHENTICATED');
    throw error;
  }
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
