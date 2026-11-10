// Responses and bearer tokens are never stored outside memory. Keep the expensive Firestore
// dashboards briefly reusable while live events, React rerenders and navigation settle.
const readActions=new Set(['configuration','templates','run','photoRead','portionStatus','preparationList','status','list','v3Dashboard','v3Conference','v3Alerts','storageList','storageHistory','storageReceiptList','storageProductionOptions','dayList','notifications','myProfile','profiles','masterRegistryPreview','masterRegistryClaims','teamDirectory','teamToday','today','mine','publicNotices','leaveList','leaveContext','fixedOffList','dashboard','myProposals','shipmentsList','summary','lots','productActivity','v3Lots','v3LedgerHistory','v3LossPending','v3PendingReceipts','closeList','todayCounts','dailyReport','investigationGet','measurementGet','get','preview','history','policies']);
const heavyActions=new Set(['v3Dashboard','v3Conference','v3Alerts','storageList']);
export function createApiFetch(fetcher,{now=()=>Date.now(),cooldownMs=60000,cacheMs=12000,scope=()=>''}={}){
 const pending=new Map(),blocked=new Map(),recent=new Map();
 const quotaResponse=()=>new Response(JSON.stringify({code:'DATA_QUOTA_EXHAUSTED',message:'Consulta temporariamente indisponível: o banco atingiu o limite de uso. Os dados não representam estoque zero. Tente novamente mais tarde.'}),{status:503,headers:{'content-type':'application/json','retry-after':String(Math.ceil(cooldownMs/1000))}});
 async function monitorQuota(response,actor){
  if(response.status!==503)return;
  try{if((await response.clone().json()).code==='DATA_QUOTA_EXHAUSTED'){blocked.set(actor,now()+cooldownMs);recent.clear()}}catch{}
 }
 const apiFetch=async(input,init={})=>{
  let body;try{body=JSON.parse(init.body)}catch{return fetcher(input,init)}
  const headers=new Headers(init.headers),actor=headers.get('authorization');
  if(!actor||init.method!=='POST'||typeof input!=='string'||!input.startsWith('/api/'))return fetcher(input,init);
  const read=readActions.has(body.action),key=scope()+'|'+input+'|'+actor+'|'+init.body;
  if(!read){
   // A mutation invalidates all previously cached stock screens before the operation starts.
   recent.clear();pending.clear();
   const response=await fetcher(input,init);
   await monitorQuota(response,actor);
   return response;
  }
  if((blocked.get(actor)||0)>now())return quotaResponse();
  blocked.delete(actor);
  const cached=recent.get(key);
  if(cached&&cached.until>now())return cached.response.clone();
  if(cached)recent.delete(key);
  let request=pending.get(key);
  if(!request){
   request=(async()=>{
    const response=await fetcher(input,init);
    await monitorQuota(response,actor);
    if(response.ok&&heavyActions.has(body.action)&&cacheMs>0){
     recent.set(key,{until:now()+cacheMs,response:response.clone()});
     // Bound memory on long-lived PWA sessions.
     if(recent.size>36)recent.delete(recent.keys().next().value);
    }
    return response;
   })();
   pending.set(key,request);
  }
  try{return (await request).clone()}finally{if(pending.get(key)===request)pending.delete(key)}
 };
 apiFetch.clearCache=()=>recent.clear();
 return apiFetch;
}
let currentScope='';
export function setApiScope(scope){currentScope=scope||'';apiFetch.clearCache();}
export const apiFetch=createApiFetch((...args)=>fetch(...args),{scope:()=>currentScope});
