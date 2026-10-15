import React, { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase.js';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined);
  const [membership, setMembership] = useState(undefined);
  const [error, setError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessReason, setAccessReason] = useState('');
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!user) { setMembership(null); setAccessError(''); setAccessReason(''); return; }
    setMembership(undefined);
    setAccessError('');
    setAccessReason('');
    return onSnapshot(doc(db, 'memberships', user.uid), snap => {
      const value = snap.exists() ? snap.data() : null;
      if (!snap.exists()) { setMembership(null); setAccessReason('Não existe um vínculo para esta conta.'); return; }
      if (value?.status !== 'active' || !value?.unitId) { setMembership(null); setAccessReason('O vínculo existe, mas está inativo ou sem unidade.'); return; }
      setAccessReason('');
      setMembership(value);
    }, (e) => {
      console.error('Erro ao consultar vínculo no Firestore:', e.code, e.message);
      setMembership(null);
      setAccessError(`Falha ao consultar autorização (${e.code || 'erro desconhecido'}). Confira as regras publicadas do Firestore.`);
    });
  }, [user]);
  const login = async () => {
    setError('');
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) {
      const explanations = {
        'auth/popup-closed-by-user': 'Login cancelado: a janela foi fechada.',
        'auth/popup-blocked': 'O navegador bloqueou a janela de login. Permita pop-ups para este site.',
        'auth/operation-not-allowed': 'Login com Google desativado no Firebase Authentication.',
        'auth/unauthorized-domain': 'Este domínio não está autorizado no Firebase Authentication.',
        'auth/network-request-failed': 'Falha de rede ao comunicar com o Firebase.',
        'auth/cancelled-popup-request': 'Já existe outra tentativa de login em andamento.'
      };
      setError(explanations[e.code] || `Não foi possível entrar (${e.code || 'erro desconhecido'}).`);
      console.error('Firebase login:', e.code, e.message);
    }
  };
  if (user === undefined || (user && membership === undefined)) return <main className="auth-screen"><section className="auth-card">Verificando acesso...</section></main>;
  if (!user) return <main className="auth-screen"><section className="auth-card"><h1>Triamicci Intelligence</h1><p>Entre com sua conta Google. O acesso às unidades depende de convite aprovado.</p><button onClick={login}>Entrar com Google</button>{error && <p role="alert">{error}</p>}</section></main>;
  if (!membership) return <main className="auth-screen"><section className="auth-card"><h1>{accessError ? 'Erro ao verificar acesso' : 'Acesso pendente'}</h1><p>{user.email}</p><p>{accessError || accessReason || 'Esta conta ainda não tem vínculo ativo com uma unidade. Solicite um convite ao gerente ou administrador.'}</p>{error && <p role="alert">{error}</p>}<button onClick={() => signOut(auth)}>Sair</button></section></main>;
  return children({ user, membership, logout: () => signOut(auth) });
}
