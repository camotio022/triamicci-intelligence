import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';

const roleLabels = {admin:'Administrador',manager:'Gerente',cook:'Cozinheiro',auxiliar:'Auxiliar'};
const roles = Object.entries(roleLabels);
const statuses = {active:'Ativo',inactive:'Desativado'};

async function request(action, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sessão expirada. Entre novamente.');
  const token = await user.getIdToken();
  const response = await fetch('/api/members/manage', {
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...payload})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Não foi possível realizar a operação.');
  return data;
}

export default function MemberDirectory({user,membership}) {
 const {notify}=useFeedback();
  const [members,setMembers] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [query,setQuery] = useState('');
  const [editing,setEditing] = useState(null);
  const [role,setRole] = useState('auxiliar');
  const [status,setStatus] = useState('active');
  const [saving,setSaving] = useState(false);
  const isAdmin = membership.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);setError('');
    try {
      const data = await request('list');
      setMembers(data.members || []);
    } catch (err) {setError(err.message);}
    finally {setLoading(false);}
  },[]);
  useEffect(() => {load();},[load]);

  const filtered = useMemo(() => members.filter(item =>
    ((item.name || '') + ' ' + (item.email || '') + ' ' + (roleLabels[item.role] || '')).toLocaleLowerCase('pt-BR')
      .includes(query.trim().toLocaleLowerCase('pt-BR'))),[members,query]);

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
    <div className="team-directory-heading">
      <div><h2>Colaboradores cadastrados</h2><p>Funcionários vinculados à unidade {membership.unitId}. As alterações são auditadas.</p></div>
      <button type="button" className="team-refresh" onClick={load} disabled={loading}>{loading?'Carregando...':'Atualizar'}</button>
    </div>
    <label htmlFor="member-search">Buscar colaborador</label>
    <input id="member-search" type="search" placeholder="Nome, e-mail ou função" value={query} onChange={event => setQuery(event.target.value)}/>
    {error && <p role="alert" className="team-error">{error}</p>}
    {notice && <p role="status" className="team-notice">{notice}</p>}
    {!loading && !error && <p className="team-note">{filtered.length} de {members.length} colaboradores · {members.filter(m => m.status === 'active').length} ativos</p>}
    <div className="team-member-list">
      {filtered.map(item => <article className="team-member" key={item.uid}>
        <div className="team-member-info">
          <strong>{item.name || item.email || 'Colaborador'}</strong>
          <span>{item.email || 'E-mail não informado'}</span>
          <div className="team-member-tags"><span>{roleLabels[item.role] || item.role}</span><span className={item.status === 'active' ? 'team-status-active':'team-status-inactive'}>{statuses[item.status] || item.status}</span></div>
        </div>
        {canManage(item) ? <button type="button" className="team-member-edit" onClick={() => startEdit(item)}>Gerir acesso</button> :
          <span className="team-note">{item.uid === user.uid ? 'Sua conta' : 'Acesso protegido'}</span>}
      </article>)}
      {!loading && !error && filtered.length === 0 && <p>Nenhum colaborador encontrado.</p>}
    </div>
    {editing && <form className="team-edit-form" onSubmit={save}>
      <h3>Gerir acesso</h3>
      <p>{editing.email} · unidade {membership.unitId}</p>
      <label htmlFor="member-role">Função</label>
      <select id="member-role" value={role} onChange={event => setRole(event.target.value)}>
        {roles.filter(([value]) => isAdmin || ['cook','auxiliar'].includes(value)).map(([value,label]) =>
          <option key={value} value={value}>{label}</option>)}
      </select>
      <label htmlFor="member-status">Situação</label>
      <select id="member-status" value={status} onChange={event => setStatus(event.target.value)}>
        <option value="active">Ativo</option><option value="inactive">Desativado</option>
      </select>
      <p className="team-note">Desativar bloqueia novas verificações de acesso. Uma sessão já aberta pode precisar ser atualizada para refletir a mudança.</p>
      <div className="team-edit-actions">
        <button type="submit" disabled={saving}>{saving?'Salvando...':'Salvar alterações'}</button>
        <button type="button" className="team-secondary" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button>
      </div>
    </form>}
  </section>;
}
