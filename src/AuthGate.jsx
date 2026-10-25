import React, { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import {clearViewCache} from './fastCache.js';
import TriamicciLogo from './TriamicciLogo.jsx';
import { ShieldCheck, Package, CookingPot, Users, ArrowRight, AlertCircle } from 'lucide-react';
import './auth-v41.css';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined);
  const [membership, setMembership] = useState(undefined);
  const [membershipUid, setMembershipUid] = useState(null);
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
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
  const logout = async () => { clearViewCache(user?.uid); await signOut(auth); };
  const login = async () => {
    if (loggingIn) return;
    setError('');setLoggingIn(true);
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
    } finally { setLoggingIn(false); }
  };
  const pending=user === undefined || (user && (membership === undefined || membershipUid !== user.uid));
  if (pending || !user || !membership) {
    const title=pending?'Verificando seu acesso':!user?'Bem-vindo ao Triamicci Intelligence':accessError?'Não foi possível verificar o acesso':accessStatus==='inactive'?'Acesso desativado':accessStatus==='offline'?'Verificação indisponível':'Acesso pendente';
    return <main className="ti-auth-portal">
      <div className="ti-auth-layout">
        <section className="ti-auth-identity" aria-label="Triamicci Intelligence">
          <div className="ti-auth-logo"><TriamicciLogo/><span>INTELLIGENCE</span></div>
          <div className="ti-auth-intro"><span className="ti-auth-eyebrow">PLATAFORMA OPERACIONAL</span><h1>Sua operação começa aqui.</h1><p>Um ambiente para organizar a cozinha, conectar a equipe e acompanhar a operação.</p><div className="ti-auth-features"><span><Package size={17}/> Estoque</span><span><CookingPot size={17}/> Produção</span><span><Users size={17}/> Equipe</span></div></div>
          <div className="ti-auth-footnote">TRIAMICCI INTELLIGENCE</div>
        </section>
        <section className="ti-auth-content" aria-label="Acesso ao sistema">
          <div className="ti-auth-panel"><span className="ti-auth-section-tag">PORTAL DE ACESSO</span><h2>{title}</h2>
          {pending?<p role="status">Estamos confirmando sua sessão e suas permissões.</p>:!user?<><p>Entre com sua conta Google para acessar seu ambiente de trabalho.</p><button type="button" className="ti-auth-primary" onClick={login} disabled={loggingIn}>{loggingIn?'Abrindo acesso...':'Entrar com Google'}<ArrowRight size={18} aria-hidden="true"/></button>{error&&<div className="ti-auth-alert" role="alert"><AlertCircle size={19} aria-hidden="true"/><span>{error}</span></div>}<div className="ti-auth-security"><ShieldCheck size={20} aria-hidden="true"/><span>O acesso depende de vínculo ativo e das permissões da unidade.</span></div></>:<><p className="ti-auth-email">{user.email}</p><p>{accessError||accessReason||'Esta conta ainda não tem vínculo ativo com uma unidade. Solicite um convite ao responsável.'}</p>{invite&&accessStatus==='missing'&&<div className="ti-auth-invite"><p>Existe um convite neste link. Confirme que você entrou com o e-mail convidado.</p><button type="button" className="ti-auth-primary" onClick={acceptInvite} disabled={accepting}>{accepting?'Validando convite...':'Aceitar convite'}<ArrowRight size={18} aria-hidden="true"/></button>{inviteFeedback&&<div role="alert" className="ti-auth-alert">{inviteFeedback}</div>}</div>}<button type="button" className="ti-auth-secondary" onClick={logout}>Sair desta conta</button></>}
          </div>
        </section>
      </div>
    </main>;
  }
  return children({ user, membership, logout });
}
