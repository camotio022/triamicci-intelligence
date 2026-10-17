import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
async function request(action,payload={}){
 const token=await auth.currentUser?.getIdToken();
 if(!token)throw new Error('Sessão expirada.');
 const res=await fetch('/api/catalog/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
 const data=await res.json();
 if(!res.ok)throw new Error(data.message||'Falha ao consultar catálogo.');
 return data;
}
export default function CatalogPicker({onAttached,isAdmin=false}){
 const [catalog,setCatalog]=useState([]);
 const [search,setSearch]=useState('');
 const [selected,setSelected]=useState('');
 const [minimum,setMinimum]=useState('0');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const reload=useCallback(async()=>{
   setLoading(true);setError('');
   try{const data=await request('list');setCatalog(data.catalog||[]);}
   catch(e){setError(e.message);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{reload();},[reload]);
 const visible=useMemo(()=>catalog.filter(p=>(p.name+' '+p.category).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))),[catalog,search]);
 const item=catalog.find(p=>p.id===selected);
 const approveBatch=async()=>{
   const candidates=catalog.filter(p=>!p.active&&p.approvalEligible);
   if(!isAdmin||busy||!candidates.length)return;
   if(!window.confirm('Solicitar aprovação dos '+candidates.length+' produtos candidatos? Produtos com revisão pendente serão recusados pelo servidor.'))return;
   setBusy(true);setError('');setNotice('');
   try{
     const data=await request('approveBatch',{catalogIds:candidates.map(p=>p.id)});
     setNotice('Aprovados: '+data.approved.length+' · Já ativos: '+data.alreadyActive.length+' · Não elegíveis: '+data.rejected.length);
     await reload();
   }catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const approve=async()=>{
   if(!item||!isAdmin||busy||!window.confirm('Aprovar '+item.name+' com unidade '+item.stockUnit+' no catálogo central?'))return;
   setBusy(true);setError('');setNotice('');
   try{const data=await request('approve',{catalogId:item.id});setNotice(data.message);await reload();}
   catch(e){setError(e.message);}finally{setBusy(false);}
 };
 const submit=async e=>{
   e.preventDefault();
   if(!item||item.reviewRequired||busy)return;
   const value=Number(minimum);
   if(!Number.isFinite(value)||value<0){setError('Estoque mínimo inválido.');return;}
   setBusy(true);setError('');setNotice('');
   try{const data=await request('attach',{catalogId:item.id,minStock:value});setNotice(data.message);setSelected('');await onAttached?.();}
   catch(e){setError(e.message);}finally{setBusy(false);}
 };
 return <form className="inventory-form catalog-picker" onSubmit={submit}>
  <h2>Adicionar produto do catálogo inteligente</h2>
  <p>Escolha um produto já definido pela Triamicci. Categoria, unidade e validade vêm do Firebase e não podem ser alteradas aqui.</p>
  {isAdmin&&<div className="inventory-actions"><button type="button" onClick={approveBatch} disabled={busy||loading}>Revisar e aprovar candidatos em lote</button></div>}
  <div className="inventory-fields">
   <label>Buscar no catálogo<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ex.: óleo, frango, strogonoff" /></label>
   <label>Produto<select value={selected} onChange={e=>{setSelected(e.target.value);setError('');setNotice('');}} disabled={loading} required>
    <option value="">{loading?'Carregando...':'Selecione um produto'}</option>
    {visible.map(p=><option value={p.id} key={p.id}>{p.name}{p.reviewRequired?' · aguardando aprovação':''}</option>)}
   </select></label>
  </div>
  {item&&<div className="catalog-product-detail">
   <strong>{item.name}</strong><span>Categoria: {item.category} · Unidade fixa: {item.stockUnit} · Validade: {item.trackExpiry?'controlada':'não exigida'}</span>
   <span>Tipo: {({raw:'Matéria-prima',intermediate:'Produto intermediário',prepared:'Preparação'})[item.type]||item.type}</span>
   {item.producedFrom.length>0&&<span>Origem cadastrada: {item.producedFrom.join(', ')}</span>}
   {item.relatedProducts.length>0&&<span>Produtos relacionados: {item.relatedProducts.join(', ')}</span>}
   {item.notes&&<span>{item.notes}</span>}
   {item.reviewRequired&&!item.approvalEligible&&<p>Cadastro ainda precisa de dados operacionais validados no Firebase antes da aprovação.</p>}
   {item.reviewRequired&&<strong className="inventory-lot-warning">Aguardando aprovação do catálogo central. Não é possível vincular este item ainda.</strong>}
   {item.reviewRequired&&item.approvalEligible&&isAdmin&&<button type="button" className="inventory-cancel" onClick={approve} disabled={busy}>Aprovar produto (admin)</button>}
  </div>}
  <div className="inventory-fields">
   <label>Estoque mínimo ({item?.stockUnit||'unidade automática'})<input type="number" min="0" max="100000000" step="any" value={minimum} onChange={e=>setMinimum(e.target.value)} disabled={!item||item.reviewRequired}/></label>
  </div>
  <div className="inventory-actions"><button type="submit" disabled={!item||item.reviewRequired||busy}>{busy?'Adicionando...':'Adicionar à unidade'}</button><button type="button" className="inventory-cancel" onClick={reload} disabled={loading}>Atualizar catálogo</button></div>
  {error&&<p role="alert">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {!loading&&catalog.length===0&&!error&&<p>O catálogo central ainda está vazio. Execute a importação antes de cadastrar produtos.</p>}
  <small>Vincular não movimenta saldo. Preparações relacionadas ainda não descontam matérias-primas automaticamente.</small>
 </form>;
}
