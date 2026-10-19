import React,{useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {convertPackage,packageState} from '../server/operations/unit-engine.js';
async function load(productId){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Sessão expirada.');
 const res=await fetch('/api/products/measurements',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'get',productId})});
 const data=await res.json();if(!res.ok)throw Error(data.message||'Falha ao consultar apresentações.');return data.profile;
}
export default function PackageConference({productId,physicalUnit,mode}){
 const [profile,setProfile]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [saveBusy,setSaveBusy]=useState(false),[saved,setSaved]=useState(''),[saveError,setSaveError]=useState(''),[pendingId,setPendingId]=useState(null);
 const [presentation,setPresentation]=useState(''),[packages,setPackages]=useState(''),[opened,setOpened]=useState('0');
 useEffect(()=>{let active=true;setProfile(null);setPresentation('');setPackages('');setOpened('0');setSaved('');setSaveError('');setPendingId(null);setError('');if(!productId)return;
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
 const result=mode==='receive'&&positiveInteger&&count>0&&rule?convertPackage({quantity:count,presentation,packageRule:{...rule,version:String(profile.version)},to:physicalUnit}):null;
 const save=async()=>{
  if(!state?.ok||!countByPackage||!profile)return;
  setSaveBusy(true);setSaved('');setSaveError('');
  const id=pendingId||crypto.randomUUID();setPendingId(id);
  try{
   const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Entre novamente.');
   const res=await fetch('/api/operations/package-conference',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action:'record',productId,requestId:id,presentation:activePresentation,profileVersion:profile.version,closed:state.sealed,opened:state.opened})});
   const data=await res.json();if(!res.ok)throw Error(data.message||'Falha ao registrar conferência.');
   setSaved(data.message);setPendingId(null);
  }catch(e){setSaveError(e.message)}finally{setSaveBusy(false)}
 };
 if(mode==='count'&&!loading&&!error&&!countByPackage)return null;
 return <section className="ti-receive-stage" aria-label="Conferência de embalagens">
  <h3>{mode==='receive'?'Conferir apresentação da entrega':'Contar embalagens fechadas e abertas'}</h3>
  <p>A conferência de embalagens é registrada separadamente, sem alterar o saldo físico. Não substitui a contagem em unidade operacional.</p>
  {loading?<p>Carregando configurações...</p>:error?<p role="alert">{error}</p>:!profile?.packages?.length?<p>Este produto ainda não possui apresentações cadastradas pela gerência.</p>:<>
   <label>Apresentação<select disabled={countByPackage} value={activePresentation} onChange={e=>{setPresentation(e.target.value);setPackages('');setPendingId(null);setSaved('')}}>{profile.packages.map(x=><option key={x.presentation} value={x.presentation}>{x.presentation}</option>)}</select></label>
   <label>{mode==='receive'?'Quantidade de embalagens entregues':method.trackOpen?'Embalagens fechadas':'Embalagens contadas'}<input type="number" min={mode==='receive'?'1':'0'} step="1" value={packages} onChange={e=>{setPackages(e.target.value);setPendingId(null);setSaved('')}}/></label>
   {mode==='count'&&method.trackOpen&&<label>Embalagens abertas<input type="number" min="0" step="1" value={opened} onChange={e=>{setOpened(e.target.value);setPendingId(null);setSaved('')}}/></label>}
   {mode==='receive'&&result?.ok&&<div className="ti-receive-summary"><strong>Equivalência conferida: {result.quantity.toLocaleString('pt-BR')} {result.unit}</strong><span>Regra versão {result.ruleVersion}. Confira esse valor antes de preencher a quantidade física no formulário.</span></div>}
   {mode==='receive'&&count!==null&&!result?.ok&&<div className="ti-receive-warning" role="status">Conversão indisponível: embalagem com conteúdo variável, não homologado ou unidade incompatível. Não informar quantidade física por estimativa.</div>}
   {mode==='count'&&state?.ok&&<div className="ti-receive-summary"><strong>{state.sealed} {method.trackOpen?'fechadas · '+state.opened+' abertas':'embalagens contadas'}</strong><span>{method.trackOpen?'Quantidade restante nas abertas: desconhecida até medição. Não somar às embalagens completas.':'Conferência visual. Não converter automaticamente em saldo físico sem regra comprovada.'}</span></div>}
   {mode==='count'&&state&&!state.ok&&<p role="alert">Informe somente contagens inteiras não negativas.</p>}
   {mode==='count'&&state?.ok&&<button type="button" disabled={saveBusy||!positiveInteger} onClick={save}>{saveBusy?'Registrando...':'Registrar conferência de embalagens'}</button>}
   {saved&&<p role="status">{saved}</p>}
   {saveError&&<p role="alert">{saveError}</p>}
  </>}
 </section>;
}
