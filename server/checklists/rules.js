import {isManagement,TEAM_ROLES} from '../permissions/v31-policy.js';
export const RETENTION_DAYS=90;
export const MAX_PHOTO_BYTES=600*1024;
const reservedIds=new Set([...Object.getOwnPropertyNames(Object.prototype),'prototype']);
export const idOk=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(x)&&!reservedIds.has(x);
const text=(s,max,empty=false)=>typeof s==='string'&&s.trim().length<=(max)&& (empty||s.trim().length>0);
export function normalizeTemplate(input,{allowEmptyItems=false}={}){
 if(!input||!text(input.name,100)||!['opening','closing','other'].includes(input.moment)||!['daily','weekdays','manual'].includes(input.frequency)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime||''))return null;
 if(!Array.isArray(input.weekdays)||input.weekdays.length>7||input.weekdays.some(x=>!Number.isInteger(x)||x<0||x>6)||new Set(input.weekdays).size!==input.weekdays.length||input.frequency==='weekdays'&&!input.weekdays.length)return null;
 if(!Array.isArray(input.roles)||!input.roles.length||input.roles.length>TEAM_ROLES.length||input.roles.some(x=>!TEAM_ROLES.includes(x))||new Set(input.roles).size!==input.roles.length)return null;
 if(!Array.isArray(input.items)||!input.items.length&&!allowEmptyItems||input.items.length>40)return null;
 const ids=new Set();const items=[];
 for(const item of input.items){
  if(!item||!idOk(item.id)||ids.has(item.id)||!text(item.title,160)||!text(item.guidance,600,true)||['required','critical','photoRequired','allowNA'].some(k=>typeof item[k]!=='boolean')||item.critical&&(!item.required||item.allowNA))return null;
  ids.add(item.id);items.push({id:item.id,title:item.title.trim(),guidance:item.guidance.trim(),required:item.required,critical:item.critical,photoRequired:item.photoRequired,allowNA:item.allowNA});
 }
 return {name:input.name.trim(),moment:input.moment,frequency:input.frequency,dueTime:input.dueTime,weekdays:[...input.weekdays].sort(),roles:[...input.roles],items};
}
export const canExecute=(role,model)=>TEAM_ROLES.includes(role)&&(isManagement(role)||model?.roles?.includes(role));
export const scheduledOn=(model,day)=>model.frequency==='daily'||model.frequency==='weekdays'&&model.weekdays.includes(new Date(day+'T12:00:00Z').getUTCDay());
export const expiresAfter=(now,days=RETENTION_DAYS)=>new Date(now.getTime()+days*86400000);
export function validateAnswer(item,{status,note='',photoId=null}){
 if(!item||!['checked','problem','na'].includes(status)||!text(note,600,true)||status==='na'&&!item.allowNA)return false;
 if(['problem','na'].includes(status)&&note.trim().length<5)return false;
 if(photoId!==null&&!idOk(photoId))return false;
 if(item.photoRequired&&!photoId)return false;
 return true;
}
export function runProgress(run){
 const answers=run.answers||{},items=run.model.items;
 const answered=items.filter(i=>answers[i.id]);
 const problems=items.filter(i=>answers[i.id]?.status==='problem'&&!answers[i.id]?.resolution);
 const missing=items.filter(i=>i.required&&!answers[i.id]);
 return {answered:answered.length,total:items.length,problems:problems.length,criticalPending:items.filter(i=>i.critical&&(!answers[i.id]||answers[i.id].status==='problem'&&!answers[i.id].resolution)).length,status:problems.length?'problem':missing.length||!answered.length?'pending':'completed'};
}
export function jpegDimensions(bytes){
 if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)return null;
 let offset=2;
 while(offset+4<bytes.length){
  if(bytes[offset]!==255)return null;
  const marker=bytes[offset+1];offset+=2;
  if(marker===218||marker===217)break;
  const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)return null;
  if([192,193,194].includes(marker)&&length>=8){const height=bytes.readUInt16BE(offset+3),width=bytes.readUInt16BE(offset+5);return width>=160&&height>=120&&width<=1920&&height<=1920?{width,height}:null;}
  offset+=length;
 }
 return null;
}
