import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Configuração pública do aplicativo Web Firebase.
// A autorização real de leitura/escrita depende das regras do Firestore.
const firebaseConfig = {
  apiKey: "AIzaSyCd5j_ZZHUejPbvN1lsruyU9VVbSK7a27Y",
  authDomain: "triamicci-intelligence.firebaseapp.com",
  projectId: "triamicci-intelligence",
  storageBucket: "triamicci-intelligence.firebasestorage.app",
  messagingSenderId: "699330242504",
  appId: "1:699330242504:web:40e3ab2bd61cce3ce482fd",
  measurementId: "G-21SXSS978T"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
