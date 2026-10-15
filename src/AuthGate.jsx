import React, { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './firebase.js';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined);
  const [membership, setMembership] = useState(undefined);
  const [error, setError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessReason, setAccessReason] = useState('');
  const [invite, setInvite] = useState(() => {
    const fragment = window.location.hash;
    return fragment.startsWith('#invite=') ? decodeURIComponent(fragment.slice(8)) : '';
  });
  const [accepting, setAccepting] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState('');
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!user) { setMembership(null); setAccessError(''); setAccessReason(''); return; }
    let cancelled = false;
    setMembership(undefined);
    setAccessError('');
    setAccessReason('');
    // Busca autoritativa no servidor: não confundir cache desatualizado com ausência de vínculo.
    getDocFromServer(doc(db, 'memberships', user.uid)).then(snap => {
      if (cancelled) return;
      if (!snap.exists()) {
        setMembership(null);
        setAccessReason('O servidor não encontrou o vínculo desta conta. Confira o UID e o caminho memberships/{uid}.');
        return;
      }
      const value = snap.data();
      if (value?.status !== 'active' || !value?.unitId) {
        setMembership(null);
        setAccessReason('O vínculo existe, mas está inativo ou sem unidade.');
        return;
      }
      setMembership(value);
    }).catch(e => {
      if (cancelled) return;
      console.error('Erro na leitura do vínculo no servidor:', e.code, e.message);
      setMembership(null);
      setAccessError(`Falha na leitura do servidor (${e.code || 'erro desconhecido'}). Verifique as regras publicadas e a conexão.`);
    });
    return () => { cancelled = true; };
  }, [user]);
  const acceptInvite = async () => {
    if (!user || !invite || accepting) return;
    setAccepting(true); setInviteFeedback('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/invitations/accept', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({invite})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Falha ao aceitar convite.');
      window.history.replaceState(null,'',window.location.pathname + window.location.search);
      setInvite('');
      window.location.reload();
    } catch(error) { setInviteFeedback(error.message || 'Não foi possível aceitar.'); }
    finally { setAccepting(false); }
  };
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
  if (!membership) return <main className="auth-screen"><section className="auth-card"><h1>{accessError ? 'Erro ao verificar acesso' : 'Acesso pendente'}</h1><p>{user.email}</p><p>{accessError || accessReason || 'Esta conta ainda não tem vínculo ativo com uma unidade. Solicite um convite ao gerente ou administrador.'}</p>{invite && <><p>Existe um convite neste link. Confirme que entrou com o mesmo e-mail que recebeu o convite.</p><button type="button" onClick={acceptInvite} disabled={accepting}>{accepting ? 'Validando...' : 'Aceitar convite'}</button>{inviteFeedback && <p role="alert">{inviteFeedback}</p>}</>}{error && <p role="alert">{error}</p>}<button onClick={() => signOut(auth)}>Sair</button></section></main>;
  return children({ user, membership, logout: () => signOut(auth) });
}
