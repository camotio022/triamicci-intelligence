import {changedLiveDomains} from './live-hub.js';
import {readDomains} from './read-policy.js';
import {restaurantDay} from '../server/schedules/restaurant-today.js';
// Responses and bearer tokens are never stored outside memory. Keep the expensive Firestore
// dashboards briefly reusable while live events, React rerenders and navigation settle.
const readActions=new Set(['configuration','templates','run','photoRead','portionStatus','preparationList','status','list','v3Dashboard','v3Conference','v3Alerts','storageList','storageHistory','storageBalance','storageReceiptList','storageProductionOptions','dayList','notifications','myProfile','profiles','masterRegistryPreview','masterRegistryClaims','teamDirectory','teamToday','today','mine','publicNotices','leaveList','leaveContext','fixedOffList','dashboard','myProposals','shipmentsList','summary','lots','productActivity','v3Lots','v3LedgerHistory','v3LossPending','v3PendingReceipts','closeList','todayCounts','dailyReport','investigationGet','measurementGet','get','preview','history','policies']);
// These list endpoints scan multiple Firestore collections. Reuse responses briefly, scoped
// by URL, payload, token and membership; mutations and live signals invalidate immediately.
const heavyActions=new Set(['v3Dashboard','v3Conference','v3Alerts','storageList','dayList','list','notifications','summary','lots','productActivity']);
export function createApiFetch(fetcher,{now=()=>Date.now(),cooldownMs=60000,cacheMs=12000,liveCacheMs=300000,scope=()=>''}={}){
 const pending=new Map(),blocked=new Map(),recent=new Map();
 let generation=0,mutations=0,live=null;
 const invalidate=(domains=null)=>{
  generation++;pending.clear();
  if(!Array.isArray(domains)){recent.clear();return}
  for(const [key,entry] of recent)if(!entry.domains||entry.domains.some(d=>domains.includes(d)))recent.delete(key);
 };
 const liveIdentity=()=>scope().split(':').slice(0,2).join(':');
 const liveReady=()=>live?.identity===liveIdentity()&&live.data?.protocolVersion===2;
 const observeLive=(identity,event)=>{
  // A late event from the previous account/unit cannot bless the new scope.
  if(!scope()||identity!==liveIdentity())return;
  if(event.error||!event.connected){live=null;invalidate();return}
  const previous=live?.identity===identity?live.data:null;
  const domains=[...new Set([...Object.keys(previous?.domains||{}),...Object.keys(event.data?.domains||{})])];
  const changes=changedLiveDomains(previous,event.data||{},domains);
  if(changes===null||changes.length)invalidate(changes);
  live={identity,data:event.data||{}};
 };
 const quotaResponse=()=>new Response(JSON.stringify({code:'DATA_QUOTA_EXHAUSTED',message:'Consulta temporariamente indisponível: o banco atingiu o limite de uso. Os dados não representam estoque zero. Tente novamente mais tarde.'}),{status:503,headers:{'content-type':'application/json','retry-after':String(Math.ceil(cooldownMs/1000))}});
 async function monitorQuota(response,actor){
  if(response.status!==503)return;
  try{if((await response.clone().json()).code==='DATA_QUOTA_EXHAUSTED'){blocked.set(actor,now()+cooldownMs);invalidate()}}catch{}
 }
 const apiFetch=async(input,init={})=>{
  let body;try{body=JSON.parse(init.body)}catch{return fetcher(input,init)}
  const headers=new Headers(init.headers),actor=headers.get('authorization');
  if(!actor||init.method!=='POST'||typeof input!=='string'||!input.startsWith('/api/'))return fetcher(input,init);
  const read=readActions.has(body.action),domains=readDomains(input,body.action);
  const key=scope()+'|'+input+'|'+actor+'|'+init.body+(domains?'|'+restaurantDay(new Date(now())):'');
  if(!read){
   // A read completed during a write must never become the post-write snapshot.
   mutations++;invalidate();
   try{
    const response=await fetcher(input,init);
    await monitorQuota(response,actor);
    return response;
   }finally{mutations--;invalidate()}
  }
  if((blocked.get(actor)||0)>now())return quotaResponse();
  blocked.delete(actor);
  const bypass=init.cache==='no-store'||init.cache==='reload';
  if(bypass)invalidate(domains);
  const cached=!bypass&&!mutations?recent.get(key):null;
  if(cached&&cached.until>now())return cached.response.clone();
  if(cached)recent.delete(key);
  let request=!bypass&&!mutations?pending.get(key):null;
  if(!request){
   const readGeneration=generation;
   request=(async()=>{
    const response=await fetcher(input,init);
    await monitorQuota(response,actor);
    if(response.ok&&!bypass&&!mutations&&readGeneration===generation&&heavyActions.has(body.action)&&cacheMs>0){
     // Never renew freshness merely by reading the cache. Revisions invalidate it
     // immediately; the five-minute ceiling also bounds missing external signals.
     const ttl=domains&&liveReady()?Math.max(cacheMs,liveCacheMs):cacheMs;
     recent.set(key,{until:now()+ttl,domains,response:response.clone()});
     // Bound memory on long-lived PWA sessions.
     if(recent.size>36)recent.delete(recent.keys().next().value);
    }
    return response;
   })();
   pending.set(key,request);
  }
  try{return (await request).clone()}finally{if(pending.get(key)===request)pending.delete(key)}
 };
 apiFetch.clearCache=()=>invalidate();
 apiFetch.observeLive=observeLive;
 apiFetch.resetScope=()=>{live=null;blocked.clear();invalidate()};
 return apiFetch;
}
let currentScope='';
export function setApiScope(scope){const next=scope||'';if(next!==currentScope){currentScope=next;apiFetch.resetScope();}}
export const apiFetch=createApiFetch((...args)=>fetch(...args),{scope:()=>currentScope});
