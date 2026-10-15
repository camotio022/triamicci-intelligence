import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import { db, auth } from './firebase.js';

const roleLabels = { admin: 'Administrador', manager: 'Gerente', cook: 'Cozinheiro', auxiliar: 'Auxiliar' };
const roleOptions = [
  { value: 'auxiliar', label: 'Auxiliar' },
  { value: 'cook', label: 'Cozinheiro' },
  { value: 'manager', label: 'Gerente' },
  { value: 'admin', label: 'Administrador' }
];

export default function TeamManagement({ user, membership }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('auxiliar');
  const [invitations, setInvitations] = useState([]);
  const [readState, setReadState] = useState('loading');
  const [readError, setReadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const allowed = membership.role === 'admin' || membership.role === 'manager';
  const roles = membership.role === 'admin' ? roleOptions : roleOptions.filter(item => ['auxiliar', 'cook'].includes(item.value));

  const sendInvitation = async event => {
    event.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true); setFeedback('');
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/invitations/create', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({email:email.trim(),role,unitId:membership.unitId})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Falha ao enviar convite.');
      setEmail(''); setFeedback(data.message);
    } catch(error) { setFeedback(error.message || 'Não foi possível enviar.'); }
    finally { setSubmitting(false); }
  };

  if (!allowed) return;
    const ref = query(collection(db, 'units', membership.unitId, 'invitations'), limit(50));
    return onSnapshot(ref, snapshot => {
      setInvitations(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      setReadState('ready');
      setReadError('');
    }, error => {
      setReadState('error');
      setReadError(error.code === 'permission-denied'
        ? 'A leitura de convites ainda não está autorizada. Confira se as regras do Firestore foram publicadas.'
        : 'Não foi possível carregar os convites (' + (error.code || 'erro desconhecido') + ').');
    });
  }, [allowed, membership.unitId]);

  if (!allowed) return <section className="team-page"><h1>Gestão de colaboradores</h1><p>Esta área é reservada a gerentes e administradores.</p></section>;

  return <section className="team-page">
    <p className="eyebrow">ADMINISTRAÇÃO · UNIDADE {membership.unitId.toUpperCase()}</p>
    <h1>Gestão de colaboradores</h1>
    <p>Prepare os convites e acompanhe os registos da sua unidade.</p>
    <div className="team-warning"><strong>Convites por e-mail:</strong> para ativar o envio, configure as variáveis de ambiente da API no Vercel. A API verificará as permissões antes de enviar.</div>
    <div className="team-grid">
      <section className="team-panel">
        <h2>Novo convite</h2>
        <p>Gerentes podem convidar auxiliares e cozinheiros. Administradores podem atribuir os demais perfis.</p>
        <form onSubmit={sendInvitation}>
          <label htmlFor="invite-email">E-mail do colaborador</label>
          <input id="invite-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="colaborador@exemplo.com" />
          <label htmlFor="invite-role">Função na unidade</label>
          <select id="invite-role" value={role} onChange={event => setRole(event.target.value)}>{roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <p className="team-unit">Unidade de destino: <strong>{membership.unitId}</strong></p>
          <button type="submit" disabled={submitting || !email.trim()}>{submitting ? "Enviando..." : "Enviar convite"}</button>{feedback && <p role="status">{feedback}</p>}
        </form>
      </section>
      <section className="team-panel">
        <h2>Convites da unidade</h2>
        {readState === 'loading' && <p>Carregando convites...</p>}
        {readState === 'error' && <p role="alert">{readError}</p>}
        {readState === 'ready' && (invitations.length === 0 ? <p>Ainda não existem convites registados.</p> : <div className="team-invite-list">{invitations.map(item => <div key={item.id} className="team-invite"><strong>{item.email || 'E-mail não informado'}</strong><span>{roleLabels[item.role] || item.role || 'Sem função'} · {item.status || 'Sem estado'}</span></div>)}</div>)}
        <p className="team-note">Os convites devem ser criados exclusivamente pelo backend, com verificação de função e unidade.</p>
      </section>
    </div>
    <p className="team-note">Sessão atual: {user.email} · {roleLabels[membership.role] || membership.role}. A listagem de todos os colaboradores será adicionada com consultas autorizadas por unidade.</p>
  </section>;
}
