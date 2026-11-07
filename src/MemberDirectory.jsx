import ProfileAvatar from './ProfileAvatar.jsx';
import {apiFetch} from './api-fetch.js';
import {useDialogFocus} from './useDialogFocus.js';
import {useUnitLive} from './useUnitLive.js';
import {useViewState} from './useViewState.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';

const roleLabels = {admin:'Administrador',manager:'Gerente',submanager:'Subgerente',cook:'Cozinheiro',auxiliar:'Auxiliar'};
const roles = Object.entries(roleLabels);
const statuses = {active:'Ativo',inactive:'Desativado'};

async function request(action, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sessão expirada. Entre novamente.');
  const token = await user.getIdToken();
  const response = await apiFetch('/api/members/manage', {
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...payload})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Não foi possível realizar a operação.');
  return data;
}

export default function MemberDirectory({user,membership,filterStatus=null,onCounts}) {
 const {notify}=useFeedback();
  const [members,setMembers] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [query,setQuery]=useViewState('MemberDirectory.jsx:query',membership.unitId,'');
  const [editing,setEditing] = useState(null);
  const [role,setRole] = useState('auxiliar');
  const [status,setStatus] = useState('active');
  const [saving,setSaving] = useState(false);
  const dialog=useRef(null);useDialogFocus(dialog,!!editing,()=>{if(!saving)setEditing(null)});
 const isAdmin = membership.role === 'admin';

  const load = useCallback(async (silent=false) => {
    if(!silent)setLoading(true);setError('');
    try {
      const data = await request('list');
      setMembers(data.members || []);onCounts?.({active:(data.members||[]).filter(m=>m.status==='active').length,inactive:(data.members||[]).filter(m=>m.status!=='active').length});
    } catch (err) {setError(err.message);}
    finally {setLoading(false);}
  },[membership.unitId,onCounts]);

 useUnitLive(membership.unitId,initial=>load(!initial),{domains:['team'],refreshKey:membership.role});

  const filtered = useMemo(() => members.filter(item => (!filterStatus||item.status===filterStatus)&&
    ((item.name || '') + ' ' + (item.email || '') + ' ' + (roleLabels[item.role] || '')).toLocaleLowerCase('pt-BR')
      .includes(query.trim().toLocaleLowerCase('pt-BR'))),[members,query,filterStatus]);

  const canManage = item => item.uid !== user.uid &&
    (isAdmin || ['cook','auxiliar'].includes(item.role));
  const startEdit = item => {
    setEditing(item);setRole(item.role);setStatus(item.status);setNotice('');
  };
  const save = async event => {
    event.preventDefault();
    if (!editing || saving) return;
    if (role === editing.role && status === editing.status) {
      setNotice('Nenhuma alteração selecionada.');return;
    }
    if (!window.confirm('Confirmar alteração do acesso de ' + (editing.name || editing.email) + '?')) return;
    setSaving(true);setNotice('');
    try {
      const data = await request('update',{uid:editing.uid,role,status});
      setNotice(data.message);notify(data.message,'success');
      setEditing(null);
      await load();
    } catch (err) {setNotice(err.message);notify(err.message,'error');}
    finally {setSaving(false);}
  };

  return <section className="team-panel team-directory">
    <h2 className="access-sr-only">Contas da unidade</h2>
    <label htmlFor="member-search">Buscar pessoa</label>
    <input id="member-search" type="search" placeholder="Buscar nome, e-mail ou função" value={query} onChange={event => setQuery(event.target.value)}/>
    {error && <div role="alert" className="team-error"><p>{error}</p><button type="button" onClick={()=>load()} disabled={loading}>Tentar novamente</button></div>}
    {notice && <p role="status" className="team-notice">{notice}</p>}
    {!loading && !error && <p className="team-note">{filtered.length} {filtered.length===1?'conta encontrada':'contas encontradas'}</p>}
    <div className="team-member-list">
      {filtered.map(item => <article className="team-member" key={item.uid}>
        <ProfileAvatar src={item.avatar} name={item.name||item.email}/><div className="team-member-info">
          <strong>{item.name || item.email || 'Colaborador'}</strong>
          <span>{item.email || 'E-mail não informado'}</span>
          <div className="team-member-tags"><span>{roleLabels[item.role] || item.role}</span><span className={item.status === 'active' ? 'team-status-active':'team-status-inactive'}>{statuses[item.status] || item.status}</span></div>
        </div>
        {canManage(item) ? <button type="button" className="team-member-edit" aria-label={'Gerir acesso de '+(item.name||item.email)} onClick={() => startEdit(item)}><span className="access-manage-label">Gerir acesso</span><span aria-hidden="true">›</span></button> :
          <span className="team-note">{item.uid === user.uid ? 'Sua conta' : 'Acesso protegido'}</span>}
      </article>)}
      {!loading && !error && filtered.length === 0 && <p>Nenhum colaborador encontrado.</p>}
    </div>
    {editing && <div className="ti-unified-modal-backdrop"><div ref={dialog} className="ti-unified-modal" role="dialog" aria-modal="true" aria-label="Gerir acesso"><form className="team-edit-form" onSubmit={save}>
      <div className="access-person-heading"><ProfileAvatar src={editing.avatar} name={editing.name||editing.email} large/><div><h3>{editing.name||'Gerir acesso'}</h3><p>{editing.email}</p><small>Unidade {membership.unitId}</small></div></div>
      <label htmlFor="member-role">Função</label>
      <select id="member-role" value={role} onChange={event => setRole(event.target.value)}>
        {roles.filter(([value]) => isAdmin || ['cook','auxiliar'].includes(value)).map(([value,label]) =>
          <option key={value} value={value}>{label}</option>)}
      </select>
      <label htmlFor="member-status">Situação</label>
      <select id="member-status" value={status} onChange={event => setStatus(event.target.value)}>
        <option value="active">Ativo</option><option value="inactive">Desativado</option>
      </select>
      <p className="team-note">Desativar bloqueia novas verificações de acesso. O vínculo é acompanhado em tempo real para atualizar sessões abertas.</p>
      <div className="team-edit-actions">
        <button type="submit" disabled={saving}>{saving?'Salvando...':'Salvar alterações'}</button>
        <button type="button" className="team-secondary" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button>
      </div>
    </form></div></div>}
  </section>;
}
