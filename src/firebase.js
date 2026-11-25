import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth,initializeAuth,browserSessionPersistence,browserPopupRedirectResolver, connectAuthEmulator } from 'firebase/auth';
import {authSession} from './auth-session.js';
import {terminalUser} from './terminal-state.js';

// Configuração pública do aplicativo Web Firebase.
// A autorização real de leitura/escrita depende das regras do Firestore.
const PRODUCTION_PROJECT_ID = 'triamicci-intelligence';
const productionConfig = {
  apiKey: "AIzaSyCd5j_ZZHUejPbvN1lsruyU9VVbSK7a27Y",
  authDomain: "triamicci-intelligence.firebaseapp.com",
  projectId: PRODUCTION_PROJECT_ID,
  storageBucket: "triamicci-intelligence.firebasestorage.app",
  messagingSenderId: "699330242504",
  appId: "1:699330242504:web:40e3ab2bd61cce3ce482fd",
  measurementId: "G-21SXSS978T"
};

const env = import.meta.env;
const appEnv = env.VITE_APP_ENV;
const staging = appEnv === 'staging';
const useEmulators = String(env.VITE_USE_FIREBASE_EMULATORS || '').toLowerCase() === 'true';
const localHomologation = useEmulators || appEnv === 'local' || appEnv === 'homologation';
const emulatorProjectId = env.VITE_FIREBASE_PROJECT_ID || env.VITE_FIREBASE_EXPECTED_PROJECT_ID || 'demo-triamicci-v31';

if (localHomologation) {
  if (!String(emulatorProjectId).startsWith('demo-') || emulatorProjectId === PRODUCTION_PROJECT_ID) {
    throw new Error('Homologação local exige projeto Firebase demo isolado. Não usar a produção.');
  }
}

const firebaseConfig = localHomologation ? {
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-triamicci-local-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${emulatorProjectId}.firebaseapp.com`,
  projectId: emulatorProjectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${emulatorProjectId}.appspot.com`,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '0',
  appId: env.VITE_FIREBASE_APP_ID || `1:0:web:${emulatorProjectId.replace(/[^a-z0-9]/gi, '')}`,
} : staging ? {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
} : productionConfig;

if (!localHomologation && staging && (!firebaseConfig.projectId || !firebaseConfig.apiKey || !firebaseConfig.appId ||
  firebaseConfig.projectId === productionConfig.projectId)) {
  throw new Error('Homologação sem configuração Firebase isolada válida. Não usar a produção.');
}
if (!localHomologation && !staging && firebaseConfig.projectId !== PRODUCTION_PROJECT_ID) {
  throw new Error('Configuração Firebase inesperada para produção.');
}

const session=authSession(typeof window==='undefined'?'':window.location.search);
export const isIndependentSession=session.independent;
export const isLocalHomologation = localHomologation;
export const app=getApps().find(app=>app.name===session.appName)||initializeApp(firebaseConfig,session.appName);
export const auth=session.independent?initializeAuth(app,{persistence:browserSessionPersistence,popupRedirectResolver:browserPopupRedirectResolver}):getAuth(app);
export const db=getFirestore(app);

if (localHomologation && typeof window !== 'undefined') {
  const key = `__triamicciEmulators:${session.appName}`;
  if (!window[key]) {
    const authHost = env.VITE_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
    const firestoreHost = env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
    const firestorePort = Number(env.VITE_FIRESTORE_EMULATOR_PORT || '8080');
    connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
    window[key] = true;
  }
}

export const sessionAuth={get currentUser(){return terminalUser()||auth.currentUser}};
