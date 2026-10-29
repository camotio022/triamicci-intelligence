import {useUnitLive} from './useUnitLive.js';
import React,{useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {PackageCheck,ClipboardCheck,Boxes,History,RefreshCw,AlertCircle,CookingPot} from 'lucide-react';

import {recordDay,balancePresentation} from './operation-time.js';
import {useOperationDay} from './useOperationDay.js';
export default function KitchenHome({membership,navigate}){
 const today=useOperationDay();
 const manager=['admin','manager','submanager'].includes(membership.role);
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
 const todayProductions=history.productions.filter(r=>recordDay(r.at)===today);
 const latest=[...history.receipts.map(x=>({...x,label:'Recebimento'})),...history.counts.map(x=>({...x,label:'Contagem'})),...history.outflows.map(x=>({...x,label:'Saída'})),...history.transfers.map(x=>({...x,label:'Transferência'})),...history.productions.map(x=>({...x,label:'Produção'}))]
   .filter(x=>recordDay(x.at)===today).sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,5);
 const actions=[{name:'Registrar produção',description:'Registrar preparo e transformação de insumos',page:'production',Icon:CookingPot},{name:'Receber mercadoria',description:'Conferir fornecedor e entrega',page:'receiving',Icon:PackageCheck},
  {name:'Contagem diária',description:'Registrar reserva e giro',page:'count',Icon:ClipboardCheck},
  {name:'Estoque físico',description:'Consultar produtos da cozinha',page:'inventory',Icon:Boxes},
  {name:'Histórico',description:'Consultar operações registradas',page:'history',Icon:History}];
 return <section className="kitchen-home">
  <p className="eyebrow">TRIAMICCI INTELLIGENCE · UNIDADE {membership.unitId.toUpperCase()}</p>
  <div className="kitchen-header"><div><h1>Operação da cozinha</h1><p>Recebimentos, contagens e estoque físico da unidade em um só lugar.</p></div><button type="button" onClick={load} disabled={loading}><RefreshCw size={16}/> Atualizar</button></div>
  <div className="ti-focus-note"><strong>Seu turno</strong><p>{manager?'Confira equipe e pendências, acompanhe a produção e faça a contagem prevista no fechamento.':'Confira seu turno e comunicados, registre o que produzir e confira as entregas. Antes de sair, avise o que ficou pendente.'}</p><small>Abrir o aplicativo não confirma presença. Conferir uma entrega aguarda aprovação para entrar no saldo.</small></div>
  <div className="kitchen-actions">{actions.filter(action=>action.page!=='count'||['admin','manager','submanager'].includes(membership.role)).map(({name,description,page,Icon})=><button type="button" key={page} onClick={()=>navigate(page)} className="kitchen-action"><Icon size={24}/><strong>{name}</strong><span>{description}</span></button>)}</div>
  {error&&<p role="alert" className="receiving-notice"><AlertCircle size={16}/> {error}</p>}
  <div className="kitchen-summary">{[['all',products.length,'Produtos vinculados'],['counted',counted.length,'Com contagem física'],['uncounted',products.length-counted.length,'Aguardam contagem']].map(([key,n,label])=><button type="button" key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}><strong>{n}</strong><span>{label}</span></button>)}</div>
  <div className="inventory-list-header"><h2>Produção de hoje</h2><button type="button" onClick={()=>navigate('production')}>Abrir produção</button></div>
  {loading?<p role="status">Carregando produções…</p>:todayProductions.length?<div className="kitchen-history">{todayProductions.slice(0,5).map(r=><div key={r.id}><div><strong>{r.recipeName||'Preparo'}</strong><span>{r.portions} {r.outputUnit||'porções'}</span></div><span>{r.at?new Date(r.at).toLocaleString('pt-BR'):'—'}</span></div>)}</div>:<p>Nenhuma produção de hoje entre os registros carregados.</p>}
  <div className="inventory-list-header"><h2>Produtos da cozinha</h2><button type="button" onClick={()=>navigate('inventory')}>Ver todos no estoque</button></div>
  {loading?<p>Carregando dados…</p>:displayed.length===0?<p>Nenhum produto neste filtro.</p>:<div className="kitchen-history">{displayed.slice(0,6).map(p=><div key={p.id}><div><strong>{p.name}</strong><span>{p.physicalBalance?`Reserva ${p.physicalBalance.reserve} ${p.physicalBalance.unit} · Giro ${p.physicalBalance.rotation} ${p.physicalBalance.unit}`:'Sem contagem física'}{p.physicalBalance&&` · ${balancePresentation(p.physicalBalance).title} · última contagem: ${p.physicalBalance.at?new Date(p.physicalBalance.at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'não registrada'}`}</span></div><strong>{p.physicalBalance?`${p.physicalBalance.total} ${p.physicalBalance.unit}`:'Não verificado'}</strong></div>)}</div>}
  <div className="inventory-list-header"><h2>Atividade de hoje</h2><button type="button" onClick={()=>navigate('history')}>Ver histórico</button></div>
  {loading?<p role="status">Carregando atividades…</p>:latest.length===0?<p>Nenhuma atividade de hoje entre os registros carregados.</p>:<div className="kitchen-history">{latest.map(x=><div key={x.id}><div><strong>{x.label}</strong><span>{x.productName}</span></div><span>{x.at?new Date(x.at).toLocaleString('pt-BR'):'—'}</span></div>)}</div>}
  <p className="inventory-footnote">Consulte o histórico para dias anteriores. Saldos calculados dependem das movimentações registradas e não substituem uma nova contagem física.</p>
 </section>;
}
