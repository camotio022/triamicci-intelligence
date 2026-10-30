import {apiFetch} from './api-fetch.js';
import React,{useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
import draft from '../data/triamicci-product-catalog-56.staging.json';
const units=['kg','L','un'];
async function request(action,payload={}){
 const user=auth.currentUser;
 if(!user)throw Error('Faça login novamente.');
 const token=await user.getIdToken();
 const response=await apiFetch('/api/catalog/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({module:'operationalCatalog',action,...payload})});
 const data=await response.json();
 if(!response.ok)throw Error(data.message||'Não foi possível consultar o catálogo.');
 return data;
}
export default function OperationalCatalogSetup({onActivated}){
 const [entries,setEntries]=useState([]);
 const [selected,setSelected]=useState(null);
 const [form,setForm]=useState(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [filter,setFilter]=useState('');
 const [showRegistered,setShowRegistered]=useState(false),[loaded,setLoaded]=useState(false),[statusFilter,setStatusFilter]=useState('all');
 const statusLabels={active:'Ativo',duplicate:'Possível duplicidade',not_registered:'Cadastro pendente',inactive:'Cadastro inativo',missing_profile:'Configuração pendente',review_required:'Revisão necessária'};
 const refresh=async()=>{try{const r=await request('status');setEntries(r.items||[]);setLoaded(true);setError('')}catch(e){setError(e.message)}};
 useEffect(()=>{refresh()},[]);
 const product=useMemo(()=>draft.products.find(p=>p.id===selected),[selected]);
 const choose=p=>{setSelected(p.id);setError('');setNotice('');setForm({name:p.name,category:p.category,stockUnit:p.stockUnit,receivingUnit:p.receivingUnit||'',operationalUnit:p.operationalUnit||p.stockUnit,source:p.source,trackExpiry:p.trackExpiry,minStock:0,countFrequency:'weekly',critical:false,reviewConfirmed:false,existingProductId:null})};
 const status=new Map(entries.map(p=>[p.id,p]));
 const shown=draft.products.filter(p=>p.name.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR')) && (showRegistered || !status.get(p.id)?.active)&&(statusFilter==='all'||status.get(p.id)?.reason===statusFilter));
 const count=entries.filter(p=>p.active).length;
 const conflicts=entries.filter(p=>p.needsReconciliation).length;
 const set=(key,value)=>setForm(f=>({...f,[key]:value,reviewConfirmed:false}));
 const submit=async e=>{e.preventDefault();setError('');setNotice('');setBusy(true);try{await request('activate',{id:selected,...form});setNotice(form.existingProductId?'Cadastro conciliado; ID, saldo e histórico preservados.':'Cadastro ativado para a unidade com saldo inicial zero.');await refresh();onActivated?.()}catch(err){setError(err.message)}finally{setBusy(false)}};
 return <div className="ti-operational-setup"><h2>Configuração do Catálogo · 56 produtos</h2>
 <p>Revise os dados antes de ativar. Unidades pré-preenchidas são sugestões; não geram conversões automáticas nem lançamentos de estoque.</p>
 <p role="status">{loaded?<><strong>{count} de 56 ativos nesta unidade.</strong> {56-count} aguardam preparação; {conflicts} exigem revisão de cadastros existentes. Ativar não registra estoque: a gestão precisa fazer a primeira contagem.</>:"Consultando a preparação dos 56 produtos…"}</p>
 <label>Situação<select disabled={!loaded} value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);if(e.target.value==='active')setShowRegistered(true)}}><option value="all">Todas as situações</option>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label} · {entries.filter(x=>x.reason===key).length}</option>)}</select></label>
 <label>Buscar produto <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Nome do produto"/></label>
 <label><input type="checkbox" checked={showRegistered} onChange={e=>setShowRegistered(e.target.checked)}/> Mostrar também os já cadastrados</label>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8,margin:'12px 0'}}>{shown.map(p=><button type="button" key={p.id} onClick={()=>choose(p)} disabled={!loaded||Boolean(status.get(p.id)?.active)} aria-pressed={selected===p.id} style={{textAlign:'left',padding:12,border:'1px solid #ccc',borderRadius:8,background:selected===p.id?'#edf2ff':'transparent'}}><strong>{p.name}</strong><br/><small>{!loaded?'Consultando…':statusLabels[status.get(p.id)?.reason]||'Revisão necessária'} · {p.category}</small></button>)}</div>
 {product&&form&&<>{status.get(product.id)?.needsReconciliation&&<p role="alert">Possível cadastro anterior detectado: {status.get(product.id).matches?.map(m=>m.name+' ('+m.id+')').join(', ')}. Selecione explicitamente um vínculo compatível. Unidades, validade e saldo serão verificados no servidor; nenhum produto antigo será excluído.</p>}<form onSubmit={submit} className="inventory-form"><h3>Validar: {product.name}</h3>
 {status.get(product.id)?.needsReconciliation&&<label>Cadastro existente para conciliar<select value={form.existingProductId||''} onChange={e=>set('existingProductId',e.target.value||null)}><option value="">Selecione após revisar</option>{status.get(product.id).matches?.map(m=><option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label>}<label>Nome<input value={form.name} readOnly/></label><label>Categoria<input value={form.category} readOnly/></label>
 <label>Unidade de estoque<select value={form.stockUnit} onChange={e=>set('stockUnit',e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label>
 <label>Origem<select value={form.source} onChange={e=>{const source=e.target.value;setForm(f=>({...f,source,receivingUnit:source==='internal'?'':f.receivingUnit,reviewConfirmed:false}))}}><option value="supplier">Recebido de fornecedor</option><option value="internal">Preparado na cozinha</option></select></label>
 {form.source==='supplier'&&<label>Unidade de recebimento<select value={form.receivingUnit} onChange={e=>set('receivingUnit',e.target.value)}><option value="">Selecione</option>{units.map(u=><option key={u}>{u}</option>)}</select></label>}
 <label>Unidade para contagem<select value={form.operationalUnit} onChange={e=>set('operationalUnit',e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label>
 {form.source==='supplier'&&form.receivingUnit!==form.operationalUnit&&<p role="status">Na entrega, informe a quantidade recebida em {form.receivingUnit} e a quantidade física realmente conferida em {form.operationalUnit}. O sistema não calcula uma a partir da outra.</p>}
 <label>Estoque mínimo<input type="number" min="0" step="any" value={form.minStock} onChange={e=>set('minStock',Number(e.target.value))}/></label>
 <label>Frequência de contagem<select value={form.countFrequency} onChange={e=>set('countFrequency',e.target.value)}><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="on_demand">Sob demanda</option></select></label>
 <label><input type="checkbox" checked={form.critical} onChange={e=>set('critical',e.target.checked)}/> Produto crítico</label>
 <label><input type="checkbox" checked={form.trackExpiry} onChange={e=>set('trackExpiry',e.target.checked)}/> Exigir controle de validade</label>
 <label><input type="checkbox" checked={form.reviewConfirmed} onChange={e=>setForm(f=>({...f,reviewConfirmed:e.target.checked}))}/> Conferi os campos deste produto na operação</label>
 <button type="submit" disabled={busy||!form.reviewConfirmed||status.get(selected)?.active||(status.get(selected)?.needsReconciliation&&!form.existingProductId)}>{busy?'Salvando...':status.get(selected)?.active?'Já ativo':'Validar e ativar'}</button></form></>}
 {error&&<p role="alert">{error} <button type="button" onClick={refresh}>Tentar novamente</button></p>}{notice&&<p role="status">{notice}</p>}</div>;
}
