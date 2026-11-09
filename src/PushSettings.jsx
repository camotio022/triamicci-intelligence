import React,{useEffect,useState} from 'react';
import {auth,isIndependentSession} from './firebase.js';
import {apiFetch} from './api-fetch.js';
export async function pushCall(action,subscription){
 const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Faça login novamente.');
 const response=await apiFetch('/api/members/manage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'push'+action[0].toUpperCase()+action.slice(1),subscription})});
 const data=await response.json();if(!response.ok)throw Error(data.message);return data;
}
const readOwner=()=>{try{return localStorage.getItem('ti-push-owner')}catch{return null}};
const saveOwner=value=>{try{if(value)localStorage.setItem('ti-push-owner',value);else localStorage.removeItem('ti-push-owner')}catch{}};
export async function disableDevicePush(){
 if(isIndependentSession||!('serviceWorker' in navigator))return;
 const registration=await navigator.serviceWorker.getRegistration('/');
 const sub=await registration?.pushManager?.getSubscription();
 if(sub){try{await pushCall('unsubscribe',sub.toJSON())}finally{await sub.unsubscribe();saveOwner(null)}}
}
const keyBytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
export default function PushSettings({unitId}){
 const [config,setConfig]=useState(null),[active,setActive]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const supported=typeof window!=='undefined'&&window.isSecureContext&&'Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const needsInstall=ios&&!(navigator.standalone||window.matchMedia('(display-mode: standalone)').matches);
 useEffect(()=>{let cancelled=false;(async()=>{
  if(!supported||needsInstall||isIndependentSession)return;
  try{
   const data=await pushCall('configuration');if(cancelled)return;
   const registration=await navigator.serviceWorker.register('/push-sw.js');
   await navigator.serviceWorker.ready;if(cancelled)return;setConfig(data);
   const sub=await registration.pushManager.getSubscription();
   if(readOwner()===auth.currentUser?.uid&&sub&&Notification.permission==='granted'&&data.configured){await pushCall('subscribe',sub.toJSON());if(!cancelled)setActive(true)}
  }catch(e){if(!cancelled)setMessage(e.message)}
 })();return()=>{cancelled=true}},[unitId,supported,needsInstall]);
 const enable=async()=>{
  setBusy(true);setMessage('');
  try{
   // Request immediately inside the tap handler, before any network awaits (iOS).
   const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Permissão não concedida. Você pode alterá-la nas configurações do aparelho.');
   const registration=await navigator.serviceWorker.ready;
   const sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});
   await pushCall('subscribe',sub.toJSON());saveOwner(auth.currentUser.uid);setActive(true);setMessage('Notificações ativadas neste dispositivo.');
  }catch(e){setMessage(e.message)}finally{setBusy(false)}
 };
 const run=async(action)=>{setBusy(true);try{if(action==='off'){await disableDevicePush();setActive(false);setMessage('Notificações desativadas.')}else{const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(!sub)throw Error('Ative as notificações novamente.');const data=await pushCall('test',sub.toJSON());setMessage(data.message)}}catch(e){setMessage(e.message)}finally{setBusy(false)}};
 return <section className="ti-push-settings" aria-label="Notificações no dispositivo"><strong>Avisos no celular ou computador</strong>
  <p>{isIndependentSession?'Use sua sessão principal para ativar os avisos neste aparelho.':needsInstall?'No iPhone, adicione o Triamicci à Tela de Início e abra pelo ícone para ativar os avisos.':!supported?'Este navegador não oferece notificações neste dispositivo.':active?'Ativadas neste dispositivo.':config&&!config.configured?'O envio de notificações ainda está sendo preparado.':'Receba avisos importantes mesmo com o app em segundo plano.'}</p>
  {supported&&!needsInstall&&!isIndependentSession&&config?.configured&&<div className="ti-notification-actions">{active?<><button type="button" disabled={busy} onClick={()=>run('test')}>Testar aviso</button><button type="button" disabled={busy} onClick={()=>run('off')}>Desativar aqui</button></>:<button type="button" disabled={busy} onClick={enable}>Ativar notificações</button>}</div>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
