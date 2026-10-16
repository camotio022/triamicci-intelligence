import React, { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase.js';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined);
  const [membership, setMembership] = useState(undefined);
  const [membershipUid, setMembershipUid] = useState(null);
  const [error, setError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessReason, setAccessReason] = useState('');
  const [accessStatus, setAccessStatus] = useState('');
  const [invite, setInvite] = useState(() => {
    const fragment = window.location.hash;
    return fragment.startsWith('#invite=') ? decodeURIComponent(fragment.slice(8)) : '';
  });
  const [accepting, setAccepting] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState('');
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!user) {
      setMembership(null);
      setMembershipUid(null);
      setAccessError('');
      setAccessReason('');
      setAccessStatus('');
      return;
    }
    // O vínculo é acompanhado em tempo real. Nunca liberar a interface
    // a partir de uma cópia local: exigir confirmação do servidor.
    setMembership(undefined);
    setMembershipUid(user.uid);
    setAccessError('');
    setAccessReason('');
    setAccessStatus('checking');
    let cancelled = false;
    const ref = doc(db, 'memberships', user.uid);
    const unsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, snap => {
      if (cancelled) return;
      if (snap.metadata.fromCache) {
        // Sem ligação ao servidor não conseguimos garantir que o acesso
        // continua autorizado. Ocultar imediatamente as áreas protegidas.
        setMembership(null);
        setAccessStatus('offline');
        setAccessReason('Não foi possível confirmar o acesso com o servidor. Verifique a conexão; a verificação será refeita automaticamente.');
        return;
      }
      if (!snap.exists()) {
        setMembership(null);
        setAccessStatus('missing');
        setAccessReason('Esta conta ainda não está vinculada a uma unidade. Solicite um convite ao gerente ou administrador.');
        return;
      }
      const value = snap.data();
      if (value?.status === 'inactive') {
        setMembership(null);
        setAccessStatus('inactive');
        setAccessReason('Seu acesso à unidade foi desativado. Entre em contato com o administrador da unidade.');
        return;
      }
      if (value?.status !== 'active' || !value?.unitId) {
        setMembership(null);
        setAccessStatus('invalid');
        setAccessReason('Seu vínculo não está ativo ou não possui uma unidade válida. Entre em contato com o administrador.');
        return;
      }
      setAccessError('');
      setAccessReason('');
      setAccessStatus('active');
      setMembership(value);
    }, e => {
      if (cancelled) return;
      console.error('Erro ao acompanhar vínculo:', e.code, e.message);
      setMembership(null);
      setAccessStatus('error');
      setAccessError('Não foi possível verificar o acesso em tempo real (' + (e.code || 'erro desconhecido') + '). Atualize a página ou contate o administrador.');
    });
    return () => { cancelled = true; unsubscribe(); };
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
  if (user === undefined || (user && (membership === undefined || membershipUid !== user.uid))) return <main className="auth-screen"><section className="auth-card">Verificando acesso...</section></main>;
  if (!user) return <main className="auth-screen"><section className="auth-card"><h1>Triamicci Intelligence</h1><p>Entre com sua conta Google. O acesso às unidades depende de convite aprovado.</p><button onClick={login}>Entrar com Google</button>{error && <p role="alert">{error}</p>}</section></main>;
  if (!membership) return <main className="auth-screen"><section className="auth-card"><h1>{accessError ? 'Erro ao verificar acesso' : accessStatus === 'inactive' ? 'Acesso desativado' : accessStatus === 'offline' ? 'Verificação indisponível' : 'Acesso pendente'}</h1><p>{user.email}</p><p>{accessError || accessReason || 'Esta conta ainda não tem vínculo ativo com uma unidade. Solicite um convite ao gerente ou administrador.'}</p>{invite && accessStatus === 'missing' && <><p>Existe um convite neste link. Confirme que entrou com o mesmo e-mail que recebeu o convite.</p><button type="button" onClick={acceptInvite} disabled={accepting}>{accepting ? 'Validando...' : 'Aceitar convite'}</button>{inviteFeedback && <p role="alert">{inviteFeedback}</p>}</>}{error && <p role="alert">{error}</p>}<button onClick={() => signOut(auth)}>Sair</button></section></main>;
  return children({ user, membership, logout: () => signOut(auth) });
}
