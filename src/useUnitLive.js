import {useEffect,useRef,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {db} from './firebase.js';

// One safe, unit-scoped invalidation document; data stays behind the authorized APIs.
export function useUnitLive(unitId, refresh) {
 const latest=useRef(refresh);latest.current=refresh;
 const [state,setState]=useState({status:'connecting',updatedAt:null});
 useEffect(()=>{
  if(!unitId)return;
  let alive=true,running=false,queued=false,connected=false;
  setState({status:'connecting',updatedAt:null});
  const load=async()=>{
   if(!alive)return;
   if(running){queued=true;return;}
   running=true;
   try{
    do{queued=false;const result=await latest.current?.();if(result===false||Array.isArray(result)&&result.includes(false))throw Error('REFRESH_FAILED');}while(alive&&queued);
    if(alive)setState({status:connected?'live':'reconnecting',updatedAt:new Date(),errorCode:null});
   }catch{if(alive)setState(s=>({...s,status:'error',errorCode:'refresh-failed'}));}
   finally{running=false;}
  };
  let revision;
  const unsubscribe=onSnapshot(doc(db,'units',unitId,'live','attendance'),{includeMetadataChanges:true},snapshot=>{
   const wasConnected=connected;
   connected=!snapshot.metadata.fromCache&&navigator.onLine!==false;
   if(!connected)setState(s=>({...s,status:'reconnecting'}));
   const next=(snapshot.data()?.revision||'initial')+':'+(snapshot.data()?.updatedAt?.toMillis?.()||0);
   if(connected&&(next!==revision||revision===undefined||!wasConnected)){revision=next;load();}
   else if(connected&&!running)setState(s=>({...s,status:s.status==='error'?'error':s.updatedAt?'live':'connecting'}));
  },error=>{connected=false;const code=typeof error?.code==='string'?error.code:'unknown';console.warn('Unit live listener failed:',code);if(alive)setState(s=>({...s,status:'error',errorCode:code}));});
  const offline=()=>{connected=false;setState(s=>({...s,status:'reconnecting'}));};
  const online=()=>{setState(s=>({...s,status:'connecting'}));load();};
  window.addEventListener('offline',offline);window.addEventListener('online',online);
  return()=>{alive=false;unsubscribe();window.removeEventListener('offline',offline);window.removeEventListener('online',online);};
 },[unitId]);
 return state;
}
