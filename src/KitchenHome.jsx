import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {PackageCheck,ClipboardCheck,Boxes,History,RefreshCw,AlertCircle} from 'lucide-react';

export default function KitchenHome({membership,navigate}){
 const [products,setProducts]=useState([]),[history,setHistory]=useState({receipts:[],counts:[]}),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const token=await auth.currentUser.getIdToken();
   const call=async(url,action)=>{const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action})});const data=await res.json();if(!res.ok)throw Error(data.message||'Falha ao carregar a operação');return data};
   const [stock,ops]=await Promise.all([call('/api/products/manage','list'),call('/api/operations/stock','list')]);
   setProducts(stock.products||[]);setHistory({receipts:ops.receipts||[],counts:ops.counts||[]});
  }catch(e){setError(e.message)}finally{setLoading(false)}
 },[]);
 useEffect(()=>{load()},[load]);
 const counted=products.filter(p=>p.physicalBalance);
 const latest=[...history.receipts.map(x=>({...x,label:'Recebimento'})),...history.counts.map(x=>({...x,label:'Contagem'}))]
   .sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,5);
 const actions=[{name:'Receber mercadoria',description:'Conferir fornecedor e entrega',page:'receiving',Icon:PackageCheck},
  {name:'Contagem diária',description:'Registrar reserva e giro',page:'count',Icon:ClipboardCheck},
  {name:'Estoque físico',description:'Consultar produtos da cozinha',page:'inventory',Icon:Boxes},
  {name:'Histórico',description:'Consultar operações registradas',page:'history',Icon:History}];
 return <section className="kitchen-home">
  <p className="eyebrow">TRIAMICCI INTELLIGENCE · UNIDADE {membership.unitId.toUpperCase()}</p>
  <div className="kitchen-header"><div><h1>Operação da cozinha</h1><p>Recebimentos, contagens e estoque físico da unidade em um só lugar.</p></div><button type="button" onClick={load} disabled={loading}><RefreshCw size={16}/> Atualizar</button></div>
  <div className="kitchen-actions">{actions.map(({name,description,page,Icon})=><button type="button" key={page} onClick={()=>navigate(page)} className="kitchen-action"><Icon size={24}/><strong>{name}</strong><span>{description}</span></button>)}</div>
  {error&&<p role="alert" className="receiving-notice"><AlertCircle size={16}/> {error}</p>}
  <div className="kitchen-summary"><div><strong>{products.length}</strong><span>Produtos vinculados</span></div><div><strong>{counted.length}</strong><span>Com contagem física</span></div><div><strong>{products.length-counted.length}</strong><span>Aguardam contagem</span></div></div>
  <div className="inventory-list-header"><h2>Produtos conferidos</h2><button type="button" onClick={()=>navigate('inventory')}>Ver estoque</button></div>
  {loading?<p>Carregando dados do Firebase...</p>:counted.length===0?<p>Ainda não há contagens físicas para esta unidade. Registre a primeira contagem de reserva e giro para começar.</p>:
   <div className="operational-products">{counted.slice(0,6).map(p=><article key={p.id} className="operational-product"><div className="operational-product-head"><strong>{p.name}</strong><span>{p.physicalBalance.unit}</span></div><div className="operational-counts"><div><span>Reserva</span><strong>{p.physicalBalance.reserve}</strong></div><div><span>Giro</span><strong>{p.physicalBalance.rotation}</strong></div><div><span>Total</span><strong>{p.physicalBalance.total}</strong></div></div></article>)}</div>}
  <div className="inventory-list-header"><h2>Atividade recente</h2><button type="button" onClick={()=>navigate('history')}>Ver histórico</button></div>
  {latest.length===0?<p>Nenhuma operação física registrada nesta unidade.</p>:<div className="kitchen-history">{latest.map(x=><div key={x.id}><div><strong>{x.label}</strong><span>{x.productName}</span></div><span>{x.at?new Date(x.at).toLocaleString('pt-BR'):'—'}</span></div>)}</div>}
  <p className="inventory-footnote">Os dados são carregados do Firebase. Contagem física e saldos legados permanecem separados até serem conciliados.</p>
 </section>;
}
