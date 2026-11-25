import {minutes} from '../coverage/engine.js';

const days=['dom','seg','ter','qua','qui','sex','sab'];
const time=m=>`${String(Math.floor(((m%1440)+1440)%1440/60)).padStart(2,'0')}:${String(((m%1440)+1440)%1440%60).padStart(2,'0')}`;

function normalizeSpan(slot){
 if(!slot)return null;
 const start=minutes(slot.start), rawEnd=minutes(slot.end);
 if(start===null||rawEnd===null||start===rawEnd)return null;
 const end=rawEnd<=start?rawEnd+1440:rawEnd;
 let pauseStart=minutes(slot.breakStart), pauseEnd=minutes(slot.breakEnd);
 if(pauseStart!==null&&pauseEnd!==null){
  if(pauseStart<start){ pauseStart+=1440; pauseEnd+=1440; }
  else if(pauseEnd<=pauseStart){ pauseEnd+=1440; }
  if(pauseStart>=end||pauseEnd<=start||pauseEnd<=pauseStart){ pauseStart=null; pauseEnd=null; }
 } else {
  pauseStart=null; pauseEnd=null;
 }
 return {start,end,pauseStart,pauseEnd};
}

function buildSectorDay({date,entries,people,sector}){
 const weekday=new Date(date+'T12:00:00Z').getUTCDay(), day=days[weekday];
 const working=new Set(entries.filter(e=>e.date===date&&e.type==='work').map(e=>e.uid));
 return people
  .filter(p=>p.status==='active'&&working.has(p.uid)&&(p.professional?.sector||p.sector)===sector)
  .map(p=>{
   const span=normalizeSpan((p.professional?.availability||p.availability||[]).find(a=>a.day===day));
   if(!span)return null;
   return {
    uid:p.uid,
    start:span.start,end:span.end,
    pauseStart:span.pauseStart,pauseEnd:span.pauseEnd,
    skills:new Set((p.professional?.certifications||p.certifications||[]).filter(Boolean).map(s=>String(s).toLowerCase()))
   };
  }).filter(Boolean);
}

function availableInSlice(person,from,to){
 return person.start<=from&&person.end>=to&&!(person.pauseStart!==null&&person.pauseEnd!==null&&from<person.pauseEnd&&to>person.pauseStart);
}

function canFill(person,rule){
 return !rule.skill||person.skills.has(rule.skill);
}

function allocateSlice(rules,activePeople){
 const slots=rules.flatMap((rule,index)=>Array.from({length:Math.max(0,rule.minimum||0)},(_,pos)=>({rule,index,pos})))
  .sort((a,b)=>(a.rule.skill?0:1)-(b.rule.skill?0:1)||b.rule.minimum-a.rule.minimum||a.index-b.index||a.pos-b.pos);
 const assignment=new Array(slots.length).fill(null);

 const tryAssign=(slotIndex,seenPersons)=>{
  for(let i=0;i<activePeople.length;i++){
   if(seenPersons.has(i)||!canFill(activePeople[i],slots[slotIndex].rule))continue;
   seenPersons.add(i);
   const usedAt=assignment.indexOf(i);
   if(usedAt===-1){ assignment[slotIndex]=i; return true; }
   const prev=assignment[slotIndex];
   assignment[slotIndex]=i;
   assignment[usedAt]=null;
   if(tryAssign(usedAt,seenPersons)) return true;
   assignment[usedAt]=i;
   assignment[slotIndex]=prev;
  }
  return false;
 };

 for(let s=0;s<slots.length;s++) tryAssign(s,new Set());
 return {slots,assignment};
}

export function coverageTimeline({date,entries,people,requirements}){
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 const rows=[];
 const dayRules=requirements.filter(r=>r.weekday===weekday);
 const bySector=new Map();
 for(const rule of dayRules){
  const start=minutes(rule.start), rawEnd=minutes(rule.end);
  if(start===null||rawEnd===null||start===rawEnd)continue;
  const end=rawEnd<=start?rawEnd+1440:rawEnd;
  const normalized={...rule,skill:String(rule.skill||'').toLowerCase(),minimum:Math.max(0,Number(rule.minimum)||0),startMin:start,endMin:end};
  if(!bySector.has(rule.sector))bySector.set(rule.sector,[]);
  bySector.get(rule.sector).push(normalized);
 }

 for(const [sector,rules] of bySector.entries()){
  if(!rules.length)continue;
  const staff=buildSectorDay({date,entries,people,sector});
  const pointsSet=new Set();
  for(const rule of rules){ pointsSet.add(rule.startMin); pointsSet.add(rule.endMin); }
  for(const person of staff){
   for(const p of [person.start,person.end,person.pauseStart,person.pauseEnd]){
    if(p!==null)pointsSet.add(p);
   }
  }
  const boundsStart=Math.min(...rules.map(r=>r.startMin));
  const boundsEnd=Math.max(...rules.map(r=>r.endMin));
  const points=[...pointsSet].filter(p=>p>=boundsStart&&p<=boundsEnd).sort((a,b)=>a-b);

  const perRuleSlices=new Map(rules.map(r=>[r,[]]));
  for(let i=0;i<points.length-1;i++){
   const from=points[i], to=points[i+1];
   if(to<=from)continue;
   const activeRules=rules.filter(r=>r.startMin<=from&&r.endMin>=to);
   if(!activeRules.length)continue;
   const present=staff.filter(p=>availableInSlice(p,from,to));

   if(activeRules.length===1){
    const rule=activeRules[0];
    const workers=present.filter(p=>canFill(p,rule));
    perRuleSlices.get(rule).push({from,to,uids:workers.map(p=>p.uid),covered:workers.length});
    continue;
   }

   const {slots,assignment}=allocateSlice(activeRules,present);
   const uidsByRule=new Map(activeRules.map(r=>[r,new Set()]));
   for(let s=0;s<slots.length;s++){
    const idx=assignment[s];
    if(idx!==null)uidsByRule.get(slots[s].rule).add(present[idx].uid);
   }
   for(const rule of activeRules){
    const uids=[...uidsByRule.get(rule)];
    perRuleSlices.get(rule).push({from,to,uids,covered:uids.length});
   }
  }

  for(const rule of rules){
   for(const slice of (perRuleSlices.get(rule)||[])){
    if(slice.from>=rule.endMin||slice.to<=rule.startMin)continue;
    const covered=slice.covered;
    rows.push({date,sector:rule.sector,skill:rule.skill||'',start:time(slice.from),end:time(slice.to),minimum:rule.minimum,covered,deficit:Math.max(0,rule.minimum-covered),uids:slice.uids});
   }
  }
 }
 return rows;
}
