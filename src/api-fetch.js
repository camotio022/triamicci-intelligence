// In-memory in-flight coalescing only. No tokens/responses are persisted.
const readActions=new Set(['portionStatus','preparationList','status','list','v3Dashboard','v3Alerts','dayList','notifications','myProfile','profiles','masterRegistryPreview','masterRegistryClaims','teamDirectory','teamToday','today','mine','publicNotices','leaveList','leaveContext','fixedOffList','dashboard','myProposals','shipmentsList','summary','lots','productActivity','v3Lots','v3LedgerHistory','v3LossPending','v3PendingReceipts','closeList','todayCounts','dailyReport','investigationGet','measurementGet','get','preview','history','policies']);
export function createApiFetch(fetcher,{now=()=>Date.now(),cooldownMs=60000,scope=()=>''}={}){
 const pending=new Map(),blocked=new Map();
 const quotaResponse=()=>new Response(JSON.stringify({code:'DATA_QUOTA_EXHAUSTED',message:'Consulta temporariamente indisponível: o banco atingiu o limite de uso. Os dados não representam estoque zero. Tente novamente mais tarde.'}),{status:503,headers:{'content-type':'application/json','retry-after':String(Math.ceil(cooldownMs/1000))}});
 return async function apiFetch(input,init={}){
  let body;try{body=JSON.parse(init.body)}catch{return fetcher(input,init)}
  const headers=new Headers(init.headers),actor=headers.get('authorization');
  if(!actor||init.method!=='POST'||typeof input!=='string'||!input.startsWith('/api/'))return fetcher(input,init);
  const read=readActions.has(body.action),key=scope()+'|'+input+'|'+actor+'|'+init.body;
  if(!read){pending.clear();try{return await fetcher(input,init)}finally{pending.clear()}}
  if((blocked.get(actor)||0)>now())return quotaResponse();blocked.delete(actor);
  let request=pending.get(key);
  if(!request){
   request=(async()=>{const response=await fetcher(input,init);if(response.status===503){try{if((await response.clone().json()).code==='DATA_QUOTA_EXHAUSTED')blocked.set(actor,now()+cooldownMs)}catch{}}return response})();
   pending.set(key,request);
  }
  try{return (await request).clone()}finally{if(pending.get(key)===request)pending.delete(key)}
 };
}
let currentScope='';
export function setApiScope(scope){currentScope=scope||'';}
export const apiFetch=createApiFetch((...args)=>fetch(...args),{scope:()=>currentScope});
