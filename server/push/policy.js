import {MANAGEMENT_ROLES} from '../permissions/v31-policy.js';
import {createHash} from 'node:crypto';
export const deviceId=endpoint=>createHash('sha256').update(endpoint).digest('hex');
// Only browser push services may be contacted; never accept arbitrary URLs (SSRF).
export function validSubscription(value){
 try{
  const u=new URL(value.endpoint);
  const host=u.hostname;
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&value.endpoint.length<4096&&
   (host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com'))&&
   /^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh)&&/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth);
 }catch{return false}
}
export function allowedRecipient(member,unitId,audience){
 return member?.status==='active'&&member.unitId===unitId&&(audience!=='managers'||MANAGEMENT_ROLES.includes(member.role));
}
export function noticeUrl(page,unitId){
 const safe=['my-profile','leave-requests','people','kitchen-v3','mural'];
 return '/?'+new URLSearchParams({page:safe.includes(page)?page:'my-profile',pushUnit:unitId});
}
