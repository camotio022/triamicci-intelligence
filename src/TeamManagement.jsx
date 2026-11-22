import {MANAGEMENT_ROLES} from '../server/permissions/v31-policy.js';
import {apiFetch} from './api-fetch.js';
import {createPortal} from 'react-dom';
import {useDialogFocus} from './useDialogFocus.js';
import {invitationLabels,invitationState,invitationPending} from '../server/team/invitation-view.js';
import './access-management.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { sessionAuth as auth } from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';
import MemberDirectory from './MemberDirectory.jsx';
import TeamProfiles from './TeamProfiles.jsx';
import TeamPreRegister from './TeamPreRegister.jsx';
import ConfirmSheet from './ConfirmSheet.jsx';
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
 const [inviteOpen,setInviteOpen]=useState(false),[tab,setTab]=useState('active'),[counts,setCounts]=useState({active:0,inactive:0});
 const inviteDialog=useRef(null);
 const closeInvite=()=>{if(!submitting){setInviteOpen(false);setShareInvite(null);setFeedback('');}};
 useDialogFocus(inviteDialog,inviteOpen,closeInvite);
 useEffect(()=>{setInviteOpen(false);setShareInvite(null);setEmail('');setInvitations([]);setTab('active');},[membership.unitId]);
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
 const [pendingRevoke, setPendingRevoke] = useState(null);
  const allowed = MANAGEMENT_ROLES.includes(membership.role);
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
      const response = await apiFetch('/api/invitations/create', {
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
      await refreshInvitations();
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
  const revokeInvitation = async () => {
    if (!pendingRevoke || revokingId) return;
    const invitationId=pendingRevoke.id;
    setRevokingId(invitationId); setFeedback('');
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await apiFetch('/api/invitations/revoke', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({unitId:membership.unitId,invitationId})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Falha ao revogar convite.');
      setFeedback(data.message);notify(data.message,'success');
      setShareInvite(null);
      await refreshInvitations();
      setPendingRevoke(null);
    } catch (error) { setFeedback(error.message || 'Não foi possível revogar.');notify(error.message,'error'); }
    finally { setRevokingId(''); }
  };

  const refreshInvitations = useCallback(async () => {
    if (!allowed) return;
    setReadState('loading');
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await apiFetch('/api/invitations/revoke', {
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({action:'list',unitId:membership.unitId})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Não foi possível consultar os convites.');
      setInvitations(data.invitations||[]);
      setReadState('ready');setReadError('');
    } catch (error) {
      setReadState('error');setReadError(error.message || 'Não foi possível consultar os convites.');
    }
  },[allowed,membership.unitId]);
  useEffect(() => {refreshInvitations();},[refreshInvitations]);

  if (!allowed) return <section className="team-page"><h1>Gestão de colaboradores</h1><p>Esta área é reservada a gerentes e administradores.</p></section>;

  const pending=invitations.filter(invitationPending),history=invitations.filter(item=>!invitationPending(item));
  const inviteRow=item=><article key={item.id} className="access-invite-row"><div><strong>{item.email||'E-mail não informado'}</strong><span>{roleLabels[item.role]||'Função não informada'} · {invitationLabels[invitationState(item)]||'Situação indisponível'}</span><small>{item.deliveryMethod==='link'?'Link / WhatsApp':'E-mail'}{item.createdAt?' · '+new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(item.createdAt)):''}</small></div>{invitationPending(item)&&(membership.role==='admin'||item.createdBy===user.uid)&&<button type="button" disabled={!!revokingId} onClick={()=>setPendingRevoke({id:item.id,email:item.email||'destinatário não identificado',role:item.role})}>{revokingId===item.id?'Revogando…':'Revogar convite'}</button>}</article>;
  return <section className="team-page access-page">
    <header className="access-heading"><div><p className="eyebrow">EQUIPE · ACESSOS</p><h1>Acessos da unidade</h1><p>{membership.unitId} · {counts.active} {counts.active===1?'conta ativa':'contas ativas'}</p></div><button type="button" className="access-primary" onClick={()=>{setEmail('');setRole('auxiliar');setShareInvite(null);setFeedback('');setInviteOpen(true);}}>+ Convidar pessoa</button></header>
    <nav className="access-tabs" aria-label="Situação dos acessos">{[['active','Ativos',counts.active],['pending','Pendentes',pending.length],['inactive','Desativados',counts.inactive]].map(([key,label,count])=><button type="button" key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label} <span>{count}</span></button>)}</nav>
    <div hidden={tab==='pending'}><MemberDirectory key={membership.unitId} user={user} membership={membership} filterStatus={tab==='inactive'?'inactive':'active'} onCounts={setCounts}/></div>
    {tab==='pending'&&<section className="team-panel access-pending"><h2>Convites pendentes</h2><p>A pessoa precisa aceitar com o e-mail informado.</p>{readState==='loading'?<p role="status">Carregando convites…</p>:readState==='error'?<p role="alert">{readError}</p>:pending.length?pending.map(inviteRow):<p className="access-empty">Nenhum convite pendente.</p>}</section>}
    <details className="access-history"><summary><span>Histórico de convites<small>Aceitos, revogados e expirados</small></span><span aria-hidden="true">⌄</span></summary>{readState==='error'?<p role="alert">{readError}</p>:readState==='loading'?<p role="status">Carregando histórico…</p>:history.length?history.map(inviteRow):<p>Nenhum convite no histórico.</p>}</details>
    {!accessOnly&&<details className="access-history"><summary>Cadastro e fichas da equipe</summary><TeamPreRegister membership={membership} onInvite={(targetEmail,targetRole)=>{setEmail(targetEmail);setRole(targetRole);setShareInvite(null);setFeedback('Confira os dados e gere o convite.');setInviteOpen(true);}}/><TeamProfiles membership={membership}/></details>}
    <ConfirmSheet open={!!pendingRevoke} title="Revogar convite?" description={pendingRevoke?'O convite de '+pendingRevoke.email+' ('+(roleLabels[pendingRevoke.role]||'Colaborador')+') será invalidado. O link não poderá mais ser usado para entrar nesta unidade.':''} confirmLabel="Revogar convite" tone="danger" busy={!!revokingId} error={feedback&&!revokingId?feedback:''} onCancel={()=>{if(!revokingId){setPendingRevoke(null);setFeedback('')}}} onConfirm={revokeInvitation}/>
    {inviteOpen&&createPortal(<div className="access-sheet-backdrop"><section ref={inviteDialog} className="access-sheet" role="dialog" aria-modal="true" aria-labelledby="invite-title"><div className="access-sheet-handle" aria-hidden="true"/><header><div><h2 id="invite-title">Convidar pessoa</h2><p>Acesso à unidade {membership.unitId}</p></div><button type="button" className="access-close" aria-label="Fechar convite" disabled={submitting} onClick={closeInvite}>×</button></header><form onSubmit={sendInvitation}>
      <label htmlFor="invite-email">E-mail da pessoa</label><input id="invite-email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={event=>{setEmail(event.target.value);setShareInvite(null);}} placeholder="nome@exemplo.com" disabled={submitting}/>
      <label htmlFor="invite-role">Função na unidade</label><select id="invite-role" value={role} onChange={event=>{setRole(event.target.value);setShareInvite(null);}} disabled={submitting}>{roles.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <span className="access-form-label">Como enviar?</span><div className="team-delivery" role="group" aria-label="Forma de envio"><button type="button" disabled={submitting} aria-pressed={deliveryMethod==='link'} className={deliveryMethod==='link'?'selected':''} onClick={()=>{setDeliveryMethod('link');setShareInvite(null);setFeedback('');}}>Link / WhatsApp</button><button type="button" disabled={submitting} aria-pressed={deliveryMethod==='email'} className={deliveryMethod==='email'?'selected':''} onClick={()=>{setDeliveryMethod('email');setShareInvite(null);setFeedback('');}}>E-mail</button></div>
      <p className="access-security">Somente o e-mail informado poderá aceitar.</p>
      <button type="submit" className="access-primary" disabled={submitting||!email.trim()||email.trim().toLowerCase()===user.email?.trim().toLowerCase()}>{submitting?'Gerando…':deliveryMethod==='link'?'Gerar convite':'Enviar convite por e-mail'}</button>
      {feedback&&<p role="status" className="access-feedback">{feedback}</p>}
      {shareInvite?<section className="team-share" aria-label="Convite gerado"><strong>Convite criado para {shareInvite.email}</strong><p>Copie e envie apenas à pessoa convidada. O link fica disponível nesta janela e vale por 7 dias.</p><div className="team-share-actions"><button type="button" className="access-primary" onClick={shareWhatsApp}>Compartilhar pelo WhatsApp</button><button type="button" onClick={copyInvitation}>Copiar mensagem</button></div></section>:<small className="access-help">{deliveryMethod==='link'?'Você poderá copiar o link e enviá-lo.':'O convite será enviado ao e-mail informado.'}</small>}
    </form></section></div>,document.body)}
  </section>;
}
