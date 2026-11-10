import {useEffect,useRef,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {auth,db} from './firebase.js';
import {apiFetch} from './api-fetch.js';
import {createLiveHub,liveRevision,changedLiveDomains,invalidateOncePerDelivery} from './live-hub.js';
const hub=createLiveHub((unitId,emit)=>onSnapshot(doc(db,'units',unitId,'live','attendance'),{includeMetadataChanges:true},
 snapshot=>emit({data:snapshot.data()||{},connected:!snapshot.metadata.fromCache}),error=>emit({error})));
// The listener owns initial loading; callers must not also fetch on mount.
export function useUnitLive(unitId,refresh,{domains=['all'],refreshKey=''}={}){
 const latest=useRef(refresh);latest.current=refresh;
 const domainKey=[...domains].sort().join(','),uid=auth.currentUser?.uid;
 const [state,setState]=useState({status:'connecting',updatedAt:null});
 useEffect(()=>{
  if(!unitId||!uid)return;
  let alive=true,running=false,queued=false,connected=false,started=false,revision,previous,queuedDomains,timer=null,scheduledDomains=undefined,lastLiveRefresh=0;
  setState({status:'connecting',updatedAt:null});
  const load=async(changes=null)=>{
   if(!alive)return;if(running){queued=true;queuedDomains=changes===null||queuedDomains===null?null:[...new Set([...(queuedDomains||[]),...changes])];return;}running=true;let first=!started;started=true;
   try{
    do{queued=false;const result=await latest.current?.(first,changes);if(result===false||Array.isArray(result)&&result.includes(false))throw Error('REFRESH_FAILED');first=false;changes=queuedDomains;queuedDomains=undefined;}while(alive&&queued);
    if(alive)setState({status:connected?'live':'reconnecting',updatedAt:new Date(),errorCode:null});
   }catch{if(alive)setState(s=>({...s,status:'error',errorCode:'refresh-failed'}));}
   finally{running=false;}
  };
  // Burst of count saves should not fan out into full dashboards on every Firestore signal.
  const schedule=changes=>{
   if(changes===null||scheduledDomains===null)scheduledDomains=null;
   else scheduledDomains=[...new Set([...(scheduledDomains||[]),...(changes||[])])];
   if(timer!==null)return;
   const delay=Math.max(0,lastLiveRefresh+8000-Date.now());
   const flush=()=>{timer=null;lastLiveRefresh=Date.now();const domains=scheduledDomains;scheduledDomains=undefined;load(domains);};
   if(delay===0)flush();else timer=setTimeout(flush,delay);
  };
  const unsubscribe=hub.subscribe(uid+':'+unitId,unitId,event=>{
   if(!alive)return;
   if(event.error){connected=false;if(!started)load();setState(s=>({...s,status:'error',errorCode:event.error.code||'unknown'}));return;}
   const wasConnected=connected;connected=event.connected&&navigator.onLine!==false;
   if(!connected){setState(s=>({...s,status:'reconnecting'}));return;}
   const next=liveRevision(event.data,domainKey.split(','));
   const changes=wasConnected?changedLiveDomains(previous,event.data,domainKey.split(',')):null;
   previous=event.data;
   if(revision!==next||!wasConnected){revision=next;if(started){invalidateOncePerDelivery(event,apiFetch.clearCache);schedule(changes);}else load(changes);}
  });
  const offline=()=>{connected=false;setState(s=>({...s,status:'reconnecting'}))};
  window.addEventListener('offline',offline);
  return()=>{alive=false;if(timer!==null)clearTimeout(timer);unsubscribe();window.removeEventListener('offline',offline)};
 },[unitId,uid,domainKey,refreshKey]);
 return state;
}
