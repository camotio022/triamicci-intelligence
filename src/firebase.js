import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth,initializeAuth,browserSessionPersistence,browserPopupRedirectResolver } from 'firebase/auth';
import {authSession} from './auth-session.js';
import {terminalUser} from './terminal-state.js';

// Configuração pública do aplicativo Web Firebase.
// A autorização real de leitura/escrita depende das regras do Firestore.
const productionConfig = {
  apiKey: "AIzaSyCd5j_ZZHUejPbvN1lsruyU9VVbSK7a27Y",
  authDomain: "triamicci-intelligence.firebaseapp.com",
  projectId: "triamicci-intelligence",
  storageBucket: "triamicci-intelligence.firebasestorage.app",
  messagingSenderId: "699330242504",
  appId: "1:699330242504:web:40e3ab2bd61cce3ce482fd",
  measurementId: "G-21SXSS978T"
};

const staging = import.meta.env.VITE_APP_ENV === 'staging';
const env = import.meta.env;
const firebaseConfig = staging ? {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
} : productionConfig;
if (staging && (!firebaseConfig.projectId || !firebaseConfig.apiKey || !firebaseConfig.appId ||
  firebaseConfig.projectId === productionConfig.projectId)) {
  throw new Error('Homologação sem configuração Firebase isolada válida. Não usar a produção.');
}
const session=authSession(typeof window==='undefined'?'':window.location.search);
export const isIndependentSession=session.independent;
export const app=getApps().find(app=>app.name===session.appName)||initializeApp(firebaseConfig,session.appName);
export const auth=session.independent?initializeAuth(app,{persistence:browserSessionPersistence,popupRedirectResolver:browserPopupRedirectResolver}):getAuth(app);
export const db=getFirestore(app);
export const sessionAuth={get currentUser(){return terminalUser()||auth.currentUser}};
