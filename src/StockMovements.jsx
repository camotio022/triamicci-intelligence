import React, {useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';

async function api(action,payload={}) {
  const user=auth.currentUser;
  if (!user) throw new Error('Sessão expirada. Entre novamente.');
  const token=await user.getIdToken();
  const response=await fetch('/api/stock/movements',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...payload})
  });
  const result=await response.json();
  if (!response.ok) throw new Error(result.message || 'Não foi possível concluir a operação.');
  return result;
}
const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3});
export default function StockMovements({products,membership,onUpdated}) {
  const [history,setHistory]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [productId,setProductId]=useState('');
  const [type,setType]=useState('entry');
  const [amount,setAmount]=useState('');
  const [note,setNote]=useState('');
  const [saving,setSaving]=useState(false);
  // Manter o mesmo ID após erro de rede evita lançamentos duplicados no reenvio.
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const canEnter=['admin','manager'].includes(membership.role);
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
  const submit=async event=>{
    event.preventDefault();if(saving)return;
    const quantity=Number(amount);
    if(!selected||!Number.isFinite(quantity)||quantity<=0||!note.trim()){
      setNotice('Selecione o insumo e preencha quantidade e motivo.');return;
    }
    if(selected.trackExpiry){
      setNotice('Este insumo exige lote e validade. A movimentação ficará disponível na próxima etapa.');return;
    }
    if(!window.confirm('Confirmar '+(type==='entry'?'entrada':'saída')+' de '+fmt(quantity)+' '+selected.unit+' de '+selected.name+'?'))return;
    setSaving(true);setNotice('');
    try{
      const result=await api('create',{productId,type,amount:quantity,note:note.trim(),requestId});
      setNotice(result.message+' Novo saldo: '+fmt(result.movement.after)+' '+selected.unit+'.');
      setAmount('');setNote('');resetRequest();
      await Promise.all([load(),onUpdated()]);
    }catch(e){setNotice(e.message);}
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
    <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>DATA</th><th>INSUMO</th><th>TIPO</th><th>QUANTIDADE</th><th>SALDO ANTES</th><th>SALDO DEPOIS</th><th>RESPONSÁVEL (UID)</th><th>MOTIVO</th></tr></thead>
      <tbody>{history.map(m=><tr key={m.id}><td>{m.at?new Date(m.at).toLocaleString('pt-BR'):'—'}</td><td>{m.productName}</td><td>{m.type==='entry'?'Entrada':'Saída'}</td><td>{fmt(m.amount)} {m.unit}</td><td>{fmt(m.before)} {m.unit}</td><td>{fmt(m.after)} {m.unit}</td><td title={m.actorUid}>{m.actorUid?.slice(0,10)}…</td><td>{m.note}</td></tr>)}</tbody></table>
      {!loading&&!error&&history.length===0&&<p>Nenhuma movimentação registrada.</p>}
    </div>
  </section>;
}
