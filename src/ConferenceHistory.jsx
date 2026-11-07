import React,{useMemo,useState} from 'react';
import {Archive,CalendarDays,ChevronDown,ChevronRight,ClipboardCheck,Search,SlidersHorizontal,UserRound} from 'lucide-react';
import {timestamp,unitLabel} from './stock-conference-model.js';
import './conference-history.css';

const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3});
const day=v=>timestamp(v)?.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})||'Data não informada';
const hour=v=>timestamp(v)?.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})||'';
const ms=v=>timestamp(v)?.getTime()||0;
const area=a=>a==='giro'?'Giro':a==='reserva'?'Reserva':a||'Área não informada';
export function groupConferenceHistory(operations,products=[]){
 const names=new Map(products.map(p=>[p.id,p.profile?.displayName||p.name]));
 const groups=new Map();
 [...operations].filter(r=>r.kind==='count').sort((a,b)=>ms(b.at)-ms(a.at)).forEach(r=>{
  // Sem sessionId, não inventar vínculo entre lançamentos.
  const key=r.sessionId?'round:'+r.sessionId:'entry:'+r.id;
  if(!groups.has(key))groups.set(key,{key,at:r.at,actorName:r.actorName||'',entries:[],products:new Map()});
  const group=groups.get(key);
  group.entries.push(r);
  const pid=r.productId||r.productName||r.id;
  if(!group.products.has(pid))group.products.set(pid,{name:r.productName||names.get(r.productId)||'Produto',entries:[]});
  group.products.get(pid).entries.push(r);
 });
 return [...groups.values()].map(g=>({...g,products:[...g.products.values()]}));
}
function quantitySummary(entries){
 const uniqueAreas=new Set(entries.map(e=>e.location));
 const unit=entries[0]?.unit;
 const canSum=entries.length>1&&uniqueAreas.size===entries.length&&entries.every(e=>e.unit===unit&&Number.isFinite(Number(e.quantity)));
 return canSum?fmt(entries.reduce((n,e)=>n+Number(e.quantity),0))+' '+unitLabel(unit):null;
}
export default function ConferenceHistory({operations=[],products=[],loading=false,error='',hasMore=false,onMore,onRetry,busy=false}){
 const [query,setQuery]=useState(''),[period,setPeriod]=useState('all'),[areaFilter,setAreaFilter]=useState('all'),[expanded,setExpanded]=useState(null),[showFilters,setShowFilters]=useState(false);
 const groups=useMemo(()=>groupConferenceHistory(operations,products),[operations,products]);
 const visible=useMemo(()=>groups.filter(g=>{
  const now=new Date(),today=day(now),yesterday=day(new Date(now.getTime()-86400000)),stamp=ms(g.at);
  const matches=period==='all'||period==='today'&&day(g.at)===today||period==='yesterday'&&day(g.at)===yesterday||period==='week'&&stamp>=Date.now()-7*86400000;
  const areaMatches=areaFilter==='all'||g.entries.some(r=>r.location===areaFilter);
  const haystack=[g.actorName,...g.products.map(p=>p.name),...g.entries.map(r=>r.actorName)].join(' ').toLocaleLowerCase('pt-BR');
  return matches&&areaMatches&&haystack.includes(query.trim().toLocaleLowerCase('pt-BR'));
 }),[groups,period,areaFilter,query]);
 return <section className="conference-history" aria-label="Histórico de conferências">
  <div className="conf-history-head"><div><h2>Histórico</h2><p>Conferências realizadas · registros preservados</p></div><Archive size={20} aria-hidden="true"/></div>
  <label className="conf-history-search"><Search size={18} aria-hidden="true"/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar produto ou responsável" aria-label="Buscar produto ou responsável"/></label>
  <div className="conf-history-toolbar"><div className="conf-history-chips" role="group" aria-label="Filtrar período">{[['all','Todos'],['today','Hoje'],['yesterday','Ontem'],['week','7 dias']].map(([k,label])=><button key={k} type="button" aria-pressed={period===k} onClick={()=>setPeriod(k)}>{label}</button>)}</div><button type="button" className="conf-history-filter-button" aria-expanded={showFilters} onClick={()=>setShowFilters(x=>!x)}><SlidersHorizontal size={16}/>Área</button></div>
  {showFilters&&<div className="conf-history-area" role="group" aria-label="Filtrar área">{[['all','Todas'],['giro','Giro'],['reserva','Reserva']].map(([k,label])=><button type="button" key={k} aria-pressed={areaFilter===k} onClick={()=>setAreaFilter(k)}>{label}</button>)}</div>}
  <div className="conf-history-result">{visible.length} {visible.length===1?'conferência encontrada':'conferências encontradas'}{hasMore&&<span> · há registros anteriores</span>}</div>
  {error&&<div role="alert" className="conference-error">{error}<button type="button" onClick={onRetry}>Tentar novamente</button></div>}
  {loading&&!groups.length&&<p role="status">Carregando histórico…</p>}
  {!loading&&!visible.length&&<p className="conference-empty">Nenhuma conferência encontrada nos registros carregados. Ajuste os filtros ou carregue registros anteriores.</p>}
  {visible.map(g=><article className="conf-history-card" key={g.key}>
   <button type="button" className="conf-history-card-main" aria-expanded={expanded===g.key} onClick={()=>setExpanded(expanded===g.key?null:g.key)}>
    <span className="conf-history-card-icon"><ClipboardCheck size={19}/></span><span className="conf-history-card-title"><strong>Conferência de estoque</strong><small><CalendarDays size={13}/>{day(g.at)} · {hour(g.at)}</small></span><ChevronRight size={18} className={expanded===g.key?'conf-history-rotated':''}/>
   </button>
   <div className="conf-history-products">{g.products.slice(0,expanded===g.key?undefined:2).map((p,i)=><div className="conf-history-product" key={i}><strong>{p.name}</strong>{quantitySummary(p.entries)?<b>{quantitySummary(p.entries)}</b>:<span>{p.entries.length} {p.entries.length===1?'registro':'registros'}</span>}<small>{p.entries.map(r=>area(r.location)+': '+fmt(r.quantity)+' '+unitLabel(r.unit)).join(' · ')}</small></div>)}{expanded!==g.key&&g.products.length>2&&<small>+ {g.products.length-2} produtos</small>}</div>
   {expanded===g.key&&<div className="conf-history-expanded"><div className="conf-history-person"><UserRound size={15}/>Responsável: {g.actorName||g.entries.find(e=>e.actorName)?.actorName||'Não identificado'}</div>{g.entries.map((r,i)=><div className="conf-history-entry" key={r.id||i}><strong>{r.productName||products.find(p=>p.id===r.productId)?.name||'Produto'} · {area(r.location)}</strong><span>{fmt(r.quantity)} {unitLabel(r.unit)} · {hour(r.at)}</span>{r.notes&&<p>{r.notes}</p>}</div>)}<small>Registros originais preservados para auditoria.</small></div>}
   <button type="button" className="conf-history-details" onClick={()=>setExpanded(expanded===g.key?null:g.key)}>{expanded===g.key?'Fechar detalhes':'Ver detalhes'}<ChevronDown size={15} className={expanded===g.key?'conf-history-rotated':''}/></button>
  </article>)}
  {hasMore&&<button type="button" className="conf-history-more" disabled={busy||loading} onClick={onMore}>{busy?'Carregando…':'Carregar registros anteriores'}</button>}
 </section>;
}
