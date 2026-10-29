import React,{useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
import draft from '../data/triamicci-product-catalog-56.staging.json';
const units=['kg','L','un'];
async function request(action,payload={}){
 const user=auth.currentUser;
 if(!user)throw Error('Faça login novamente.');
 const token=await user.getIdToken();
 const response=await fetch('/api/catalog/activate-draft',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
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
 const refresh=async()=>{try{const r=await request('status');setEntries(r.items||[])}catch(e){setError(e.message)}};
 useEffect(()=>{refresh()},[]);
 const product=useMemo(()=>draft.products.find(p=>p.id===selected),[selected]);
 const choose=p=>{setSelected(p.id);setError('');setNotice('');setForm({name:p.name,category:p.category,stockUnit:p.stockUnit,receivingUnit:p.receivingUnit||'',operationalUnit:p.operationalUnit||p.stockUnit,source:p.source,trackExpiry:p.trackExpiry,minStock:0,countFrequency:'weekly',critical:false,reviewConfirmed:false})};
 const status=new Map(entries.map(p=>[p.id,p]));
 const shown=draft.products.filter(p=>p.name.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR')));
 const count=entries.filter(p=>p.active).length;
 const set=(key,value)=>setForm(f=>({...f,[key]:value,reviewConfirmed:false}));
 const submit=async e=>{e.preventDefault();setError('');setNotice('');setBusy(true);try{await request('activate',{id:selected,...form});setNotice('Cadastro ativado para a unidade com saldo inicial zero.');await refresh();onActivated?.()}catch(err){setError(err.message)}finally{setBusy(false)}};
 return <div className="ti-operational-setup"><h2>Configuração do Catálogo · 56 produtos</h2>
 <p>Revise os dados antes de ativar. Unidades pré-preenchidas são sugestões; não geram conversões automáticas nem lançamentos de estoque.</p>
 <p><strong>{count} de 56 ativos nesta unidade.</strong> Os cadastros experimentais não são apagados automaticamente.</p>
 <label>Buscar produto <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Nome do produto"/></label>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8,margin:'12px 0'}}>{shown.map(p=><button type="button" key={p.id} onClick={()=>choose(p)} aria-pressed={selected===p.id} style={{textAlign:'left',padding:12,border:'1px solid #ccc',borderRadius:8,background:selected===p.id?'#edf2ff':'transparent'}}><strong>{p.name}</strong><br/><small>{status.get(p.id)?.active?'Ativo':'Pendente'} · {p.category}</small></button>)}</div>
 {product&&form&&<form onSubmit={submit} className="inventory-form"><h3>Validar: {product.name}</h3>
 <label>Nome<input value={form.name} readOnly/></label><label>Categoria<input value={form.category} readOnly/></label>
 <label>Unidade de estoque<select value={form.stockUnit} onChange={e=>set('stockUnit',e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label>
 <label>Origem<select value={form.source} onChange={e=>{const source=e.target.value;setForm(f=>({...f,source,receivingUnit:source==='internal'?'':f.receivingUnit,reviewConfirmed:false}))}}><option value="supplier">Recebido de fornecedor</option><option value="internal">Preparado na cozinha</option></select></label>
 {form.source==='supplier'&&<label>Unidade de recebimento<select value={form.receivingUnit} onChange={e=>set('receivingUnit',e.target.value)}><option value="">Selecione</option>{units.map(u=><option key={u}>{u}</option>)}</select></label>}
 <label>Unidade para contagem<select value={form.operationalUnit} onChange={e=>set('operationalUnit',e.target.value)}>{units.map(u=><option key={u}>{u}</option>)}</select></label>
 <label>Estoque mínimo<input type="number" min="0" step="any" value={form.minStock} onChange={e=>set('minStock',Number(e.target.value))}/></label>
 <label>Frequência de contagem<select value={form.countFrequency} onChange={e=>set('countFrequency',e.target.value)}><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="on_demand">Sob demanda</option></select></label>
 <label><input type="checkbox" checked={form.critical} onChange={e=>set('critical',e.target.checked)}/> Produto crítico</label>
 <label><input type="checkbox" checked={form.trackExpiry} onChange={e=>set('trackExpiry',e.target.checked)}/> Exigir controle de validade</label>
 <label><input type="checkbox" checked={form.reviewConfirmed} onChange={e=>setForm(f=>({...f,reviewConfirmed:e.target.checked}))}/> Conferi os campos deste produto na operação</label>
 <button type="submit" disabled={busy||!form.reviewConfirmed||status.get(selected)?.active}>{busy?'Salvando...':status.get(selected)?.active?'Já ativo':'Validar e ativar'}</button></form>}
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</div>;
}
