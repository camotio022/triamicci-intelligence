// Only these reads may outlive the short TTL while their unit's live stream is
// server-confirmed. Unknown endpoints keep the conservative short-lived policy.
export function readDomains(path,action){
 if(path==='/api/products/manage'&&action==='list')return ['stock','catalog'];
 if(path==='/api/production/manage'){
  if(action==='list')return ['stock','catalog','production'];
  if(action==='dayList')return ['production'];
 }
 if(path==='/api/members/manage'&&action==='notifications')return ['notifications'];
 if(path==='/api/operations/stock'){
  if(['list','summary','lots','productActivity','v3Dashboard','v3Conference','storageList'].includes(action))return ['stock','catalog','production'];
  if(action==='v3Alerts')return ['stock'];
 }
 return null;
}
