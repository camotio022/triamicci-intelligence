import {isManagement} from '../server/permissions/v31-policy.js';
import {apiFetch} from './api-fetch.js';
import React, {useCallback,useEffect,useState} from 'react';
import ConfirmSheet from './ConfirmSheet.jsx';
import './stock-movements-mobile.css';
import {auth} from './firebase.js';
import {useFeedback} from './FeedbackProvider.jsx';

async function api(action,payload={}) {
  const user=auth.currentUser;
  if (!user) throw new Error('Sessão expirada. Entre novamente.');
  const token=await user.getIdToken();
  const response=await apiFetch('/api/stock/movements',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...payload})
  });
  const result=await response.json();
  if (!response.ok) throw new Error(result.message || 'Não foi possível concluir a operação.');
  return result;
}
const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3});
export default function StockMovements({products,membership,onUpdated}) {
  const {notify}=useFeedback();
  const [history,setHistory]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [productId,setProductId]=useState('');
  const [type,setType]=useState('entry');
  const [amount,setAmount]=useState('');
  const [note,setNote]=useState('');
  const [saving,setSaving]=useState(false);
  const [pending,setPending]=useState(null);
  const [query,setQuery]=useState('');
  const [kind,setKind]=useState('all');
  const [openId,setOpenId]=useState(null);
  // Manter o mesmo ID após erro de rede evita lançamentos duplicados no reenvio.
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const canEnter=isManagement(membership.role);
  const selected=products.find(p=>p.id===productId);
  const eligible=products.filter(p=>p.status==='active');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const result=await api('list');setHistory(result.movements||[]);}
    catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{if(!canEnter&&type==='entry')setType('exit');},[canEnter,type]);
  const resetRequest=()=>setRequestId(crypto.randomUUID());
  const filtered=history.filter(m=>(kind==='all'||m.type===kind)&&[m.productName,m.actorName,m.note].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  const submit=event=>{
    event.preventDefault();if(saving)return;
    const quantity=Number(amount);
    if(!selected||!Number.isFinite(quantity)||quantity<=0||!note.trim()){
      setNotice('Selecione o insumo e preencha quantidade e motivo.');return;
    }
    if(selected.trackExpiry){
      setNotice('Este insumo exige lote e validade. A movimentação ficará disponível na próxima etapa.');return;
    }
    setPending({productId,type,quantity,note:note.trim(),requestId,productName:selected.name,unit:selected.unit});
  };
  const confirm=async()=>{
    if(saving||!pending)return;
    const action=pending;setSaving(true);setNotice('');
    try{
      const result=await api('create',{productId:action.productId,type:action.type,amount:action.quantity,note:action.note,requestId:action.requestId});
      setNotice(result.message+' Novo saldo: '+fmt(result.movement.after)+' '+action.unit+'.');notify(result.message,'success');
      setAmount('');setNote('');resetRequest();setPending(null);
      await Promise.all([load(),onUpdated?.()]);
    }catch(e){setNotice(e.message);notify(e.message,'error');}
    finally{setSaving(false);}
  };
  return <section className="inventory-movements">
    <h2>Movimentações de estoque</h2>
    <p>Entradas e saídas reais com saldo atualizado em transação e histórico de quem registrou.</p>
    <form className="inventory-form" onSubmit={submit}>
      <div className="inventory-fields">
        <label>Insumo
          <select required value={productId} onChange={e=>{setProductId(e.target.value);resetRequest();}}>
            <option value="">Selecione um insumo</option>
            {eligible.map(p=><option key={p.id} value={p.id}>{p.name} · {fmt(p.quantity)} {p.unit}{p.trackExpiry?' · exige lote':''}</option>)}
          </select>
        </label>
        <label>Operação
          <select value={type} onChange={e=>{setType(e.target.value);resetRequest();}}>
            {canEnter&&<option value="entry">Entrada</option>}
            <option value="exit">Saída / consumo</option>
          </select>
        </label>
        <label>Quantidade {selected?'('+selected.unit+')':''}
          <input required type="number" min="0.001" max="100000" step="0.001" value={amount}
            onChange={e=>{setAmount(e.target.value);resetRequest();}} placeholder="Ex.: 2,5"/>
        </label>
        <label>Motivo / referência
          <input required minLength={3} maxLength={240} value={note}
            onChange={e=>{setNote(e.target.value);resetRequest();}} placeholder="Ex.: recebimento da nota 123 / preparo do almoço"/>
        </label>
      </div>
      {selected && <p className="inventory-stock-preview">Saldo atual: <strong>{fmt(selected.quantity)} {selected.unit}</strong>
        {selected.trackExpiry && <span className="inventory-lot-warning"> · Lote e validade obrigatórios: movimentação indisponível nesta etapa.</span>}
      </p>}
      <div className="inventory-actions"><button type="submit" disabled={saving||!selected||selected.trackExpiry}>{saving?'Registrando...':'Confirmar movimentação'}</button></div>
      {notice&&<p role="status">{notice}</p>}
    </form>
    <div className="inventory-list-header"><h2>Últimas 50 movimentações</h2><button type="button" disabled={loading} onClick={load}>{loading?'Carregando...':'Atualizar histórico'}</button></div>
    {error&&<p role="alert">{error}</p>}
    <div className="ti-movements-filters"><label className="ti-movements-search">Buscar no histórico<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Produto, responsável ou motivo"/></label><div className="ti-movements-types" role="group" aria-label="Tipo de movimentação">{[['all','Todas'],['entry','Entradas'],['exit','Saídas']].map(([value,label])=><button type="button" key={value} aria-pressed={kind===value} onClick={()=>setKind(value)}>{label}</button>)}</div></div>
    <p className="ti-movements-caption">{filtered.length} de {history.length} movimentações carregadas</p>
    <div className="ti-movements-cards">{filtered.map(m=><article className="ti-movement-card" key={m.id}>
      <div className="ti-movement-top"><div><strong>{m.productName||'Produto'}</strong><small>{m.at?new Date(m.at).toLocaleString('pt-BR'):'Data indisponível'}</small></div><span className={m.type==='entry'?'ti-movement-in':'ti-movement-out'}>{m.type==='entry'?'Entrada':'Saída'}</span></div>
      <div className="ti-movement-line"><b>{m.type==='entry'?'+':'−'} {fmt(m.amount)} {m.unit}</b><span>{fmt(m.before)} → {fmt(m.after)} {m.unit}</span></div>
      <button type="button" className="ti-movement-details" aria-expanded={openId===m.id} onClick={()=>setOpenId(id=>id===m.id?null:m.id)}>{openId===m.id?'Ocultar detalhes':'Ver responsável e motivo'}</button>
      {openId===m.id&&<div className="ti-movement-expanded"><p><strong>Responsável</strong> {m.actorName||'Não identificado'}</p><p><strong>Motivo</strong> {m.note||'Não informado'}</p></div>}
    </article>)}</div>
    <div className="inventory-table-wrap ti-movement-desktop"><table className="inventory-table"><thead><tr><th>DATA</th><th>INSUMO</th><th>TIPO</th><th>QUANTIDADE</th><th>SALDO ANTES</th><th>SALDO DEPOIS</th><th>RESPONSÁVEL</th><th>MOTIVO</th></tr></thead><tbody>{filtered.map(m=><tr key={m.id}><td>{m.at?new Date(m.at).toLocaleString('pt-BR'):'—'}</td><td>{m.productName}</td><td>{m.type==='entry'?'Entrada':'Saída'}</td><td>{fmt(m.amount)} {m.unit}</td><td>{fmt(m.before)} {m.unit}</td><td>{fmt(m.after)} {m.unit}</td><td>{m.actorName||'Responsável não identificado'}</td><td>{m.note}</td></tr>)}</tbody></table></div>
    {!loading&&!error&&filtered.length===0&&<p className="ti-movement-empty">{history.length?'Nenhuma movimentação corresponde aos filtros.':'Nenhuma movimentação registrada.'}</p>}
    <ConfirmSheet open={!!pending} title="Confirmar movimentação" description={pending?'Registrar '+(pending.type==='entry'?'entrada':'saída')+' de '+fmt(pending.quantity)+' '+pending.unit+' de '+pending.productName+'? O saldo será atualizado após confirmação da API.':''} confirmLabel="Registrar movimentação" busy={saving} onCancel={()=>setPending(null)} onConfirm={confirm}/> 
  </section>;
}
