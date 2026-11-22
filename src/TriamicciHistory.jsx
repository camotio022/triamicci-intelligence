import {useOperationDay} from './useOperationDay.js';
import {recordDay,inPeriod} from './operation-time.js';
import HistoryPeriod from './HistoryPeriod.jsx';
import React,{useMemo,useState} from 'react';
import {History,ChefHat,Search,ChevronDown,ChevronUp} from 'lucide-react';
import './triamicci-history.css';
const day=recordDay;
const stamp=v=>{if(!v)return 'Data indisponível';const d=new Date(v);return Number.isNaN(d.getTime())?'Data indisponível':new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};
export default function TriamicciHistory({title='Histórico',records=[],getId=r=>r.id,getTitle=r=>r.title,getQuantity=()=>'',getBadge,getDate=r=>r.at,getDescription=()=>'',getPerson=r=>r.actorName,renderDetails,renderRecord,getSearchText,empty='Nenhum registro encontrado.',loading=false,defaultPeriod='today'}){
 const [period,setPeriod]=useState(defaultPeriod),[query,setQuery]=useState(''),[expanded,setExpanded]=useState(null),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const today=useOperationDay(),yesterday=day(new Date(Date.parse(today+'T12:00:00Z')-86400000));
 const filtered=useMemo(()=>records.filter(r=>{const date=getDate(r),dateKey=day(date),when=date?new Date(date).getTime():NaN;const valid=period==='all'||period==='custom'&&inPeriod(date,from,to)||period==='today'&&dateKey===today||period==='yesterday'&&dateKey===yesterday||period==='week'&&Number.isFinite(when)&&when>=Date.now()-7*86400000&&when<=Date.now();const term=[getTitle(r),getDescription(r),getBadge?.(r),getPerson(r),getSearchText?.(r)].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');return valid&&term.includes(query.trim().toLocaleLowerCase('pt-BR'))}),[records,period,query,today,yesterday,from,to,getDate,getTitle,getDescription,getBadge,getPerson,getSearchText]);
 return <section className="ti-history-shell" aria-label={title}>
  <header className="ti-history-banner"><div><h2><History size={19} aria-hidden="true"/>{title}</h2></div><ChefHat size={23} aria-hidden="true"/></header>
  <div className="ti-history-toolbar"><div className="ti-history-periods" role="group" aria-label="Período">{[['today','Hoje'],['yesterday','Ontem'],['week','7 dias'],['all','Todos'],['custom','Personalizado']].map(([value,label])=><button type="button" key={value} className={period===value?'selected':''} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{label}</button>)}</div><label className="ti-history-search"><Search size={16} aria-hidden="true"/><input aria-label="Buscar registros históricos" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar no histórico..."/></label></div>
  {period==='custom'&&<HistoryPeriod from={from} to={to} onFrom={setFrom} onTo={setTo}/>}
  {!loading&&filtered.length>0&&<p className="ti-history-count">{filtered.length} {filtered.length===1?'registro':'registros'}</p>}
  {loading?<p role="status">Consultando registros...</p>:filtered.length===0?<p className="ti-history-empty">{empty}</p>:<div className="ti-history-cards">{filtered.map((r,index)=>{const id=getId(r)??index;if(renderRecord)return <React.Fragment key={id}>{renderRecord(r,stamp(getDate(r)))}</React.Fragment>;const isOpen=expanded===id;return <article className="ti-history-card" key={id}>
   <button type="button" className="ti-history-trigger" aria-label={(isOpen?'Fechar':'Ver')+' detalhes de '+getTitle(r)} aria-expanded={isOpen} onClick={()=>setExpanded(isOpen?null:id)}>
    <span className="ti-history-record-title"><strong>{getTitle(r)}</strong>{getQuantity(r)&&<b>{getQuantity(r)}</b>}</span>
    <span className="ti-history-record-meta">{getBadge?.(r)&&<b>{getBadge(r)}</b>}<span>{stamp(getDate(r))}</span></span>
    {getDescription(r)&&<span className="ti-history-record-description">{getDescription(r)}</span>}
    {isOpen?<ChevronUp size={17} aria-hidden="true"/>:<ChevronDown size={17} aria-hidden="true"/>}
   </button>
   {isOpen&&<div className="ti-history-expanded"><div>Responsável: {getPerson(r)||'Não identificado'}</div>{renderDetails?.(r)}</div>}
  </article>})}</div>}
 </section>;
}
