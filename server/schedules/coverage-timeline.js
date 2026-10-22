import {minutes} from '../coverage/engine.js';
const time=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export function coverageTimeline({date,entries,people,requirements}){
 const weekday=new Date(date+'T12:00:00Z').getUTCDay(),day=['dom','seg','ter','qua','qui','sex','sab'][weekday];
 const working=new Set(entries.filter(e=>e.date===date&&e.type==='work').map(e=>e.uid));
 const rows=[];
 for(const rule of requirements.filter(r=>r.weekday===weekday)){
  const start=minutes(rule.start),rawEnd=minutes(rule.end);if(start===null||rawEnd===null||start===rawEnd)continue;const end=rawEnd<=start?rawEnd+1440:rawEnd;
  const available=people.filter(p=>p.status==='active'&&working.has(p.uid)&&(p.professional?.sector||p.sector)===rule.sector&&(!rule.skill||(p.professional?.certifications||p.certifications||[]).includes(rule.skill))).map(p=>{
   const slot=(p.professional?.availability||p.availability||[]).find(a=>a.day===day);if(!slot)return null;
   const a=minutes(slot.start),b=minutes(slot.end);if(a===null||b===null)return null;
   let stop=b<=a?b+1440:b;let pauseStart=minutes(slot.breakStart),pauseEnd=minutes(slot.breakEnd);
   if(pauseStart!==null&&pauseStart<a)pauseStart+=1440;if(pauseEnd!==null&&pauseEnd<a)pauseEnd+=1440;
   return {uid:p.uid,start:a,end:stop,pauseStart,pauseEnd};
  }).filter(Boolean);
  const points=[...new Set([start,end,...available.flatMap(p=>[p.start,p.end,p.pauseStart,p.pauseEnd]).filter(x=>x!==null&&x>start&&x<end)])].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++){const from=points[i],to=points[i+1],workers=available.filter(p=>p.start<=from&&p.end>=to&&!(p.pauseStart!==null&&p.pauseEnd!==null&&from<p.pauseEnd&&to>p.pauseStart));rows.push({date,sector:rule.sector,skill:rule.skill||'',start:time(from),end:time(to),minimum:rule.minimum,covered:workers.length,deficit:Math.max(0,rule.minimum-workers.length),uids:workers.map(p=>p.uid)});}
 }
 return rows;
}
