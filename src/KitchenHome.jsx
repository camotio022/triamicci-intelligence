import {useUnitLive} from './useUnitLive.js';
import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {PackageCheck,ClipboardCheck,Boxes,History,RefreshCw,AlertCircle,CookingPot,CheckCircle2,Package,ClipboardList} from 'lucide-react';
import './triamicci-history.css';

export default function KitchenHome({membership,navigate}){
 const [products,setProducts]=useState([]),[history,setHistory]=useState({receipts:[],counts:[],outflows:[],transfers:[],productions:[]}),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);setError('');
  try{
   const token=await auth.currentUser.getIdToken();
   const call=async(url,action)=>{const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action})});const data=await res.json();if(!res.ok)throw Error(data.message||'Falha ao carregar a operação');return data};
   const [stock,ops]=await Promise.all([call('/api/products/manage','list'),call('/api/operations/stock','list')]);
   setProducts(stock.products||[]);setHistory({receipts:ops.receipts||[],counts:ops.counts||[],outflows:ops.outflows||[],transfers:ops.transfers||[],productions:ops.productions||[]});
  }catch(e){setError(e.message)}finally{setLoading(false)}
 },[]);
 useUnitLive(membership?.unitId,()=>load(true));
 useEffect(()=>{load()},[load]);
 const [filter,setFilter]=useState('counted');
 const counted=products.filter(p=>p.physicalBalance);
 const displayed=products.filter(p=>filter==='all'||filter==='counted'&&p.physicalBalance||filter==='uncounted'&&!p.physicalBalance);
 const latest=[...history.receipts.map(x=>({...x,label:'Recebimento'})),...history.counts.map(x=>({...x,label:'Contagem'})),...history.outflows.map(x=>({...x,label:'Saída'})),...history.transfers.map(x=>({...x,label:'Transferência'})),...history.productions.map(x=>({...x,label:'Produção'}))]
   .sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,5);
 const actions=[{name:'Registrar produção',description:'Registrar preparo e transformação de insumos',page:'production',Icon:CookingPot},{name:'Receber mercadoria',description:'Conferir fornecedor e entrega',page:'receiving',Icon:PackageCheck},
  {name:'Contagem diária',description:'Registrar reserva e giro',page:'count',Icon:ClipboardCheck},
  {name:'Estoque físico',description:'Consultar produtos da cozinha',page:'inventory',Icon:Boxes},
  {name:'Histórico',description:'Consultar operações registradas',page:'history',Icon:History}];
 return <section className="kitchen-home">
  <p className="eyebrow">TRIAMICCI INTELLIGENCE · UNIDADE {membership.unitId.toUpperCase()}</p>
  <div className="kitchen-header"><div><h1>Operação da cozinha</h1><p>Recebimentos, contagens e estoque físico da unidade em um só lugar.</p></div><button type="button" onClick={load} disabled={loading}><RefreshCw size={16}/> Atualizar</button></div>
  <div className="kitchen-actions">{actions.filter(action=>action.page!=='count'||['admin','manager','submanager'].includes(membership.role)).map(({name,description,page,Icon})=><button type="button" key={page} onClick={()=>navigate(page)} className="kitchen-action"><Icon size={24}/><strong>{name}</strong><span>{description}</span></button>)}</div>
  {error&&<p role="alert" className="receiving-notice"><AlertCircle size={16}/> {error}</p>}
  <section className="ti-operations-overview" aria-label="Resumo operacional">
   <h2>Resumo operacional</h2>
   <div className="ti-operations-primary" role="status">
    <div className="ti-operations-status-icon"><CheckCircle2 size={28} aria-hidden="true"/></div>
    <div className="ti-operations-status-copy">
     <strong>{loading?'Consultando estoque…':products.length===0?'Nenhum produto cadastrado':counted.length===products.length?'Cadastro com contagem registrada':'Contagem inicial pendente'}</strong>
     <span>{counted.length} de {products.length} produtos com contagem física registrada</span>
     <small>{products.length-counted.length} sem primeira contagem · não indica conferência de hoje</small>
    </div>
    <span className="ti-operations-fraction">{counted.length}/{products.length}</span>
   </div>
   <div className="ti-operations-secondary">
    <button type="button" className={filter==='all'?'selected':''} aria-pressed={filter==='all'} onClick={()=>setFilter('all')}><Package size={19} aria-hidden="true"/><span><strong>{products.length}</strong><small>Produtos cadastrados</small></span></button>
    <button type="button" className={filter==='uncounted'?'selected':''} aria-pressed={filter==='uncounted'} onClick={()=>setFilter('uncounted')}><ClipboardList size={19} aria-hidden="true"/><span><strong>{products.length-counted.length}</strong><small>Sem primeira contagem</small></span></button>
   </div>
   {filter==='counted'&&<p className="ti-operations-filter-note">Lista abaixo: produtos com contagem registrada. <button type="button" onClick={()=>setFilter('all')}>Mostrar todos</button></p>}
  </section>
  <div className="inventory-list-header"><h2>Produção registrada</h2><button type="button" onClick={()=>navigate('production')}>Abrir produção</button></div>
  {history.productions.length?<div className="ti-history-summary" aria-label="Últimas produções">{history.productions.slice(0,5).map(r=><button type="button" key={r.id} onClick={()=>navigate('production')} className="ti-history-summary-item"><span><strong>{r.recipeName||'Preparo'}</strong><small>{r.portions} {r.outputUnit||'un'}</small></span><time>{r.at?new Date(r.at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}</time></button>)}</div>:<p>Nenhuma produção registrada nesta consulta.</p>}
  <div className="inventory-list-header"><h2>Produtos da cozinha</h2><button type="button" onClick={()=>navigate('inventory')}>Ver todos no estoque</button></div>
  {loading?<p>Carregando dados…</p>:displayed.length===0?<p>Nenhum produto neste filtro.</p>:<div className="ti-history-summary" aria-label="Resumo dos produtos da cozinha">{displayed.slice(0,6).map(p=><button type="button" key={p.id} className="ti-history-summary-item ti-history-summary-product" onClick={()=>navigate('inventory')}><span><strong>{p.name}</strong><small>{p.physicalBalance?`Reserva ${p.physicalBalance.reserve} ${p.physicalBalance.unit} · Giro ${p.physicalBalance.rotation} ${p.physicalBalance.unit}`:'Sem contagem física'}</small></span><b>{p.physicalBalance?`${p.physicalBalance.total} ${p.physicalBalance.unit}`:'Não verificado'}</b></button>)}</div>}
  <div className="inventory-list-header"><h2>Atividade recente</h2><button type="button" onClick={()=>navigate('history')}>Ver histórico</button></div>
  {latest.length===0?<p>Nenhuma operação física registrada nesta unidade.</p>:<div className="ti-history-summary" aria-label="Atividade recente">{latest.map(x=><button type="button" key={x.label+'-'+x.id} className="ti-history-summary-item" onClick={()=>navigate('history')}><span><strong>{x.label}</strong><small>{x.productName||x.recipeName||'Operação registrada'}</small></span><time>{x.at?new Date(x.at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}</time></button>)}</div>}
  <p className="inventory-footnote">Os dados são carregados do Firebase. Contagem física e saldos legados permanecem separados até serem conciliados.</p>
 </section>;
}
