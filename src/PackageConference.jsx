import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {convertPackage,packageState} from '../server/operations/unit-engine.js';
import {reconcilePackageCount} from '../server/operations/package-reconciliation.js';
import ManagerPackageReview from './ManagerPackageReview.jsx';
async function load(productId){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada.');
 const res=await fetch('/api/products/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'measurementGet',productId})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Falha ao consultar apresentações.');return data.profile;
}
export default function PackageConference({productId,physicalUnit,mode,canReview=false}){
 const [profile,setProfile]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [conferenceId,setConferenceId]=useState('');
 const [saveBusy,setSaveBusy]=useState(false),[saved,setSaved]=useState(''),[saveError,setSaveError]=useState(''),[pendingId,setPendingId]=useState(null);
 const [remainders,setRemainders]=useState([]);
 const [area,setArea]=useState('giro');
 const [presentation,setPresentation]=useState(''),[packages,setPackages]=useState(''),[opened,setOpened]=useState('0');
 useEffect(()=>{let active=true;setProfile(null);setPresentation('');setPackages('');setOpened('0');setRemainders([]);setConferenceId('');setArea('giro');setSaved('');setSaveError('');setPendingId(null);setError('');if(!productId)return;
 setLoading(true);load(productId).then(p=>{if(active){setProfile(p);setPresentation(p?.packages?.[0]?.presentation||'')}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
 return()=>{active=false}},[productId]);
 if(!productId)return null;
 const method=profile?.countingMethod||{kind:'base'};
 const countByPackage=mode==='count'&&method.kind==='packages';
 const activePresentation=countByPackage?method.presentation:presentation;
 const rule=profile?.packages?.find(x=>x.presentation===activePresentation);
 const count=packages===''?null:Number(packages),openCount=Number(opened);
 const positiveInteger=count!==null&&Number.isInteger(count)&&count>=0;
 const state=positiveInteger&&Number.isInteger(openCount)&&openCount>=0?packageState({sealed:count,opened:openCount}):null;
 const reconciliation=mode==='count'&&countByPackage&&state?.ok?reconcilePackageCount({
  closed:state.sealed,opened:state.opened,presentation:activePresentation,
  rule,profileVersion:profile?.version,stockUnit:physicalUnit,
  openedMeasurements:remainders.length===state.opened&&remainders.every(v=>v!==''&&Number.isFinite(Number(v))&&Number(v)>0)
   ?remainders.map(v=>({quantity:Number(v),unit:physicalUnit})):[]
 }):null;
 const result=mode==='receive'&&positiveInteger&&count>0&&rule?convertPackage({quantity:count,presentation,packageRule:{...rule,version:String(profile.version)},to:physicalUnit}):null;
 const save=async()=>{
  if(!state?.ok||!countByPackage||!profile)return;
  setSaveBusy(true);setSaved('');setSaveError('');
  const id=pendingId||crypto.randomUUID();setPendingId(id);
  try{
   const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Entre novamente.');
   const res=await fetch('/api/operations/stock',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action:'packageRecord',productId,requestId:id,area,presentation:activePresentation,profileVersion:profile.version,closed:state.sealed,opened:state.opened})});
   const data=await res.json();if(!res.ok)throw Error(data.message||'Falha ao registrar conferência.');
   setSaved(data.message);setConferenceId(data.conferenceId||'');setPendingId(null);
  }catch(e){setSaveError(e.message)}finally{setSaveBusy(false)}
 };
 if(mode==='count'&&!loading&&!error&&!countByPackage)return null;
 return <section className="ti-receive-stage" aria-label="Conferência de embalagens">
  <h3>{mode==='receive'?'Conferir apresentação da entrega':'Contar embalagens fechadas e abertas'}</h3>
  <p>A conferência de embalagens é registrada separadamente, sem alterar o saldo físico. Não substitui a contagem em unidade operacional.</p>
  {loading?<p>Carregando configurações...</p>:error?<p role="alert">{error}</p>:!profile?.packages?.length?<p>Este produto ainda não possui apresentações cadastradas pela gerência.</p>:<>
   {mode==='count'&&<label>Local da contagem<select value={area} onChange={e=>{setArea(e.target.value);setPendingId(null);setSaved('')}}><option value="reserva">Reserva</option><option value="giro">Giro</option></select></label>}
   <label>Apresentação<select disabled={countByPackage} value={activePresentation} onChange={e=>{setPresentation(e.target.value);setPackages('');setPendingId(null);setSaved('')}}>{profile.packages.map(x=><option key={x.presentation} value={x.presentation}>{x.presentation}</option>)}</select></label>
   <label>{mode==='receive'?'Quantidade de embalagens entregues':method.trackOpen?'Embalagens fechadas':'Embalagens contadas'}<input type="number" min={mode==='receive'?'1':'0'} step="1" value={packages} onChange={e=>{setPackages(e.target.value);setPendingId(null);setSaved('')}}/></label>
   {mode==='count'&&method.trackOpen&&<label>Embalagens abertas<input type="number" min="0" step="1" value={opened} onChange={e=>{setOpened(e.target.value);setRemainders(Array.from({length:Math.min(Math.max(0,Number(e.target.value)||0),30)},()=>''));setPendingId(null);setSaved('')}}/></label>}
   {mode==='receive'&&result?.ok&&<div className="ti-receive-summary"><strong>Equivalência conferida: {result.quantity.toLocaleString('pt-BR')} {result.unit}</strong><span>Regra versão {result.ruleVersion}. Confira esse valor antes de preencher a quantidade física no formulário.</span></div>}
   {mode==='receive'&&count!==null&&!result?.ok&&<div className="ti-receive-warning" role="status">Conversão indisponível: embalagem com conteúdo variável, não homologado ou unidade incompatível. Não informar quantidade física por estimativa.</div>}
   {mode==='count'&&state?.ok&&<div className="ti-receive-summary"><strong>{state.sealed} {method.trackOpen?'fechadas · '+state.opened+' abertas':'embalagens contadas'}</strong><span>{method.trackOpen?'Quantidade restante nas abertas: desconhecida até medição. Não somar às embalagens completas.':'Conferência visual. Não converter automaticamente em saldo físico sem regra comprovada.'}</span></div>}
   {mode==='count'&&state&&!state.ok&&<p role="alert">Informe somente contagens inteiras não negativas.</p>}
   {mode==='count'&&method.trackOpen&&state?.ok&&state.opened>0&&state.opened<=30&&<div className="ti-receive-summary">
    <strong>Pesagem opcional das embalagens abertas</strong>
    <span>Preencha somente pesos efetivamente medidos. Uma embalagem sem pesagem impede a conciliação numérica.</span>
    {Array.from({length:state.opened},(_,i)=><label key={i}>Quantidade restante na embalagem aberta {i+1} ({physicalUnit})<input type="number" step="any" min="0.001" value={remainders[i]||''} onChange={e=>setRemainders(old=>Array.from({length:state.opened},(_,j)=>j===i?e.target.value:old[j]||''))}/></label>)}
   </div>}
   {mode==='count'&&reconciliation?.ok&&<div className="ti-receive-summary"><strong>Prévia calculada: {reconciliation.quantity.toLocaleString('pt-BR')} {reconciliation.unit}</strong><span>Somente para conferência. Exige revisão antes de qualquer atualização dos saldos físicos.</span></div>}
   {mode==='count'&&reconciliation&&!reconciliation.ok&&<div className="ti-receive-warning">Saldo em {physicalUnit} não conciliável automaticamente: {({NEEDS_MEASUREMENT:'há embalagens abertas sem quantidade medida',NEEDS_VERIFIED_CONVERSION:'falta equivalência homologada para a embalagem',INCOMPATIBLE_REMAINDER:'uma medição não é compatível com a unidade do saldo',ZERO_REMAINDER_REQUIRES_CLOSURE:'embalagem vazia deve ser encerrada na conferência',INVALID_INPUT:'quantidade inválida',INVALID_MEASUREMENTS:'medição inválida'})[reconciliation.status]||'é necessária conferência adicional'}.</div>}
   {mode==='count'&&state?.ok&&<button type="button" disabled={saveBusy||!positiveInteger} onClick={save}>{saveBusy?'Registrando...':'Registrar conferência de embalagens'}</button>}
   {saved&&<p role="status">{saved}</p>}
   {saveError&&<p role="alert">{saveError}</p>}
   {mode==='count'&&canReview&&conferenceId&&<ManagerPackageReview key={conferenceId} productId={productId} conferenceId={conferenceId} opened={state?.opened||0} physicalUnit={physicalUnit}/>}
  </>}
 </section>;
}
