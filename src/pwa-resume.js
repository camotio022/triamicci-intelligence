// Restore only UI navigation after iOS discards a standalone PWA process.
// Do not persist access rights, tokens, operational records, forms or messages here.
const PREFIX='ti.pwa.resume.v1:';
const TTL_MS=24*60*60*1000;
export const isStandalone=()=>typeof window!=='undefined'&&
 (window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true);
export function resumeKey(uid,unitId){return PREFIX+uid+':'+unitId;}
export function rememberRoute(storage,{uid,unitId,page,scroll=0,at=Date.now()}){
 if(!uid||!unitId||typeof page!=='string'||!page)return;
 try{storage.setItem(resumeKey(uid,unitId),JSON.stringify({v:1,page,scroll:Math.max(0,Math.min(250000,Math.floor(Number(scroll)||0))),at}));}catch{}
}
export function recallRoute(storage,{uid,unitId,allowed,now=Date.now()}){
 if(!uid||!unitId||typeof allowed!=='function')return null;
 try{
  const raw=storage.getItem(resumeKey(uid,unitId));if(!raw)return null;
  const value=JSON.parse(raw);
  if(value?.v!==1||!Number.isFinite(value.at)||value.at>now+60000||now-value.at>TTL_MS||!allowed(value.page))return null;
  return {page:value.page,scroll:Math.max(0,Math.min(250000,Number(value.scroll)||0))};
 }catch{return null;}
}
export function selectInitialRoute({params,allowed,stored,fallback='kitchen',standalone=false,unitId}){
 const target=params.get('page');
 if(params.get('pushUnit')&&params.get('pushUnit')!==unitId)return fallback;
 if(target)return allowed(target)?target:fallback;
 return standalone&&stored?.page&&allowed(stored.page)?stored.page:fallback;
}
