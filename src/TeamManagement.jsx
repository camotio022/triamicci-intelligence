import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import { db, auth } from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import MemberDirectory from './MemberDirectory.jsx';
import TeamProfiles from './TeamProfiles.jsx';
import TeamPreRegister from './TeamPreRegister.jsx';
import './team-preregister.css';

const roleLabels = { admin: 'Administrador', manager: 'Gerente', submanager:'Subgerente', cook: 'Cozinheiro', auxiliar: 'Auxiliar' };
const roleOptions = [
  { value: 'auxiliar', label: 'Auxiliar' },
  { value: 'cook', label: 'Cozinheiro' },
  { value: 'manager', label: 'Gerente' },
  { value: 'submanager', label: 'Subgerente' },
  { value: 'admin', label: 'Administrador' }
];

export default function TeamManagement({ user, membership, accessOnly = false }) {
 const {notify}=useFeedback();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('auxiliar');
  const [invitations, setInvitations] = useState([]);
  const [readState, setReadState] = useState('loading');
  const [readError, setReadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('link');
  const [shareInvite, setShareInvite] = useState(null);
  const [revokingId, setRevokingId] = useState('');
  const allowed = ['admin','manager','submanager'].includes(membership.role);
  const roles = membership.role === 'admin' ? roleOptions : roleOptions.filter(item => ['auxiliar', 'cook'].includes(item.value));

  const sendInvitation = async event => {
    event.preventDefault();
    if (!email.trim() || submitting) return;
    if (email.trim().toLowerCase() === user.email?.trim().toLowerCase()) {
      setFeedback('Não podes convidar a tua própria conta. Usa o e-mail de outro colaborador.');
      return;
    }
    setSubmitting(true); setFeedback(''); setShareInvite(null);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/invitations/create', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({email:email.trim(),role,unitId:membership.unitId,deliveryMethod})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Falha ao enviar convite.');
      if (deliveryMethod === 'link' && data.inviteUrl) {
        setShareInvite({url:data.inviteUrl,email:email.trim(),role});
      } else {
        setEmail('');
      }
      setFeedback(data.message);notify(data.message,'success');
    } catch(error) { setFeedback(error.message || 'Não foi possível enviar.');notify(error.message,'error'); }
    finally { setSubmitting(false); }
  };

  const invitationText = shareInvite
    ? 'Olá! Você foi convidado para o Triamicci Intelligence, unidade ' + membership.unitId +
      ', como ' + (roleLabels[shareInvite.role] || shareInvite.role) +
      '. Entre com a conta Google do e-mail ' + shareInvite.email +
      ' para aceitar o convite (válido por 7 dias): ' + shareInvite.url
    : '';
  const copyInvitation = async () => {
    if (!shareInvite) return;
    try {
      await navigator.clipboard.writeText(invitationText);
      setFeedback('Mensagem copiada. Envie apenas ao colaborador correto.');
    } catch {
      setFeedback('Não foi possível copiar automaticamente. Use o botão Compartilhar pelo WhatsApp.');
    }
  };
  const shareWhatsApp = () => {
    if (!shareInvite) return;
    window.open('https://wa.me/?text=' + encodeURIComponent(invitationText), '_blank', 'noopener,noreferrer');
  };
  const revokeInvitation = async invitationId => {
    if (!window.confirm('Revogar este convite? O link deixará de funcionar.')) return;
    setRevokingId(invitationId); setFeedback('');
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/invitations/revoke', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({unitId:membership.unitId,invitationId})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Falha ao revogar convite.');
      setFeedback(data.message);
      setShareInvite(null);
    } catch (error) { setFeedback(error.message || 'Não foi possível revogar.');notify(error.message,'error'); }
    finally { setRevokingId(''); }
  };

  useEffect(() => {
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
    {!accessOnly&&<p className="eyebrow">ADMINISTRAÇÃO · UNIDADE {membership.unitId.toUpperCase()}</p>}
    <h1>{accessOnly?"Contas e convites":"Gestão de colaboradores"}</h1>
    <p>{accessOnly?"Gerencie acesso ao sistema sem confundir contas com fichas profissionais.":"Prepare os convites e acompanhe os registos da sua unidade."}</p>
    <div className="team-warning"><strong>Convites por link:</strong> gera um link único e envia manualmente pelo WhatsApp, sem precisar de domínio próprio. O destinatário deve entrar com o e-mail Google informado. Nunca publiques o link em grupos ou capturas de tela.</div>
    {!accessOnly&&<TeamPreRegister membership={membership} onInvite={(targetEmail,targetRole)=>{setEmail(targetEmail);setRole(targetRole);setFeedback('Convite preparado. Escolha a forma de envio e confirme abaixo.');}} />}
    <MemberDirectory user={user} membership={membership} />
    {!accessOnly&&<TeamProfiles membership={membership} />}
    <div className="team-grid">
      <section className="team-panel">
        <h2>Novo convite</h2>
        <p>Gerentes podem convidar auxiliares e cozinheiros. Administradores podem atribuir os demais perfis.</p>
        <div className="team-delivery" role="group" aria-label="Forma de envio">
          <button type="button" className={deliveryMethod === 'link' ? 'selected' : ''} onClick={() => {setDeliveryMethod('link');setShareInvite(null);setFeedback('');}}>Link / WhatsApp</button>
          <button type="button" className={deliveryMethod === 'email' ? 'selected' : ''} onClick={() => {setDeliveryMethod('email');setShareInvite(null);setFeedback('');}}>E-mail (Resend)</button>
        </div>
        <form onSubmit={sendInvitation}>
          <label htmlFor="invite-email">E-mail do colaborador</label>
          <input id="invite-email" type="email" autoComplete="email" value={email} onChange={event => {setEmail(event.target.value);setShareInvite(null);}} placeholder="colaborador@exemplo.com" />
          <label htmlFor="invite-role">Função na unidade</label>
          <select id="invite-role" value={role} onChange={event => {setRole(event.target.value);setShareInvite(null);}}>{roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <p className="team-unit">Unidade de destino: <strong>{membership.unitId}</strong></p>
          <button type="submit" disabled={submitting || !email.trim() || email.trim().toLowerCase() === user.email?.trim().toLowerCase()}>{submitting ? 'Aguarda...' : deliveryMethod === 'link' ? 'Gerar link de convite' : 'Enviar convite por e-mail'}</button>
          {feedback && <p role="status">{feedback}</p>}
          {shareInvite && <div className="team-share" role="status">
            <strong>Link criado para {shareInvite.email}</strong>
            <p>Válido por 7 dias, uma única utilização. Confirma o destinatário antes de enviar. O link só será mostrado nesta sessão.</p>
            <div className="team-share-actions">
              <button type="button" onClick={shareWhatsApp}>Compartilhar pelo WhatsApp</button>
              <button type="button" className="team-secondary" onClick={copyInvitation}>Copiar mensagem</button>
              <button type="button" className="team-secondary" onClick={() => setShareInvite(null)}>Ocultar link</button>
            </div>
          </div>}
        </form>
      </section>
      <section className="team-panel">
        <h2>Convites da unidade</h2>
        {readState === 'loading' && <p>Carregando convites...</p>}
        {readState === 'error' && <p role="alert">{readError}</p>}
        {readState === 'ready' && (invitations.length === 0 ? <p>Ainda não existem convites registados.</p> : <div className="team-invite-list">{invitations.map(item => <div key={item.id} className="team-invite"><strong>{item.email || 'E-mail não informado'}</strong><span>{roleLabels[item.role] || item.role || 'Sem função'} · {item.status || 'Sem estado'} · {item.deliveryMethod === 'link' ? 'Link' : 'E-mail'}</span>
          {['pending','delivery_failed'].includes(item.status) && (membership.role === 'admin' || item.createdBy === user.uid) &&
            <button type="button" className="team-revoke" disabled={revokingId === item.id} onClick={() => revokeInvitation(item.id)}>{revokingId === item.id ? 'Revogando...' : 'Revogar convite'}</button>}
          </div>)}</div>)}
        <p className="team-note">Os convites devem ser criados exclusivamente pelo backend, com verificação de função e unidade.</p>
      </section>
    </div>
    <p className="team-note">Sessão atual: {user.email} · {roleLabels[membership.role] || membership.role}. A listagem de colaboradores é consultada via API autenticada por unidade.</p>
  </section>;
}
