import {checkDoubleShift,minutes,rateRoleFor} from './engine.js';
import {coverageTimeline} from '../schedules/coverage-timeline.js';
import {fiveTwoSundays} from '../schedules/five-two.js';

const days = ['dom','seg','ter','qua','qui','sex','sab'];
const weekdayOf = date => new Date(date+'T12:00:00Z').getUTCDay();
const profile = person => person.professional || person;
const name = person => person.name || 'Colaborador';
const front = new Set(['frente','caixa','apoio','gestao']);
const inSector = (person,sector) => sector === 'frente' ? front.has(profile(person).sector) : profile(person).sector === sector;
const title = person => rateRoleFor(person);
const management = person => ['manager','submanager'].includes(title(person));
const kitchenLead = person => ['cook','head_cook'].includes(title(person));
const certified = (person,skill) => (profile(person).certifications || []).includes(skill);
const available = (person,day) => (profile(person).availability || []).find(slot => slot.day === day);
const timed = slot => slot && minutes(slot.start) !== null && minutes(slot.end) !== null && slot.start !== slot.end;
const covering = (slot,window) => timed(slot)&&window&&
 minutes(slot.start)<=minutes(window.start)&&minutes(slot.end)>=minutes(window.end);
const offTypes = new Set(['off','monthly_sunday']);
function assuredMontage(people,rules){
 const other=rules.filter(rule=>rule.skill!=='montagem');
 if(!other.length)return people.filter(person=>certified(person,'montagem')).length;
 const points=[...new Set(other.flatMap(rule=>[minutes(rule.start),minutes(rule.end)]).filter(value=>value!==null))].sort((a,b)=>a-b);
 let lowest=people.filter(person=>certified(person,'montagem')).length;
 for(const point of points){
  const active=other.filter(rule=>minutes(rule.start)<=point&&point<minutes(rule.end));
  const slots=[...new Map(active.sort((a,b)=>a.minimum-b.minimum).map(rule=>[rule.skill,rule.minimum]))]
   .flatMap(([skill,minimum])=>Array.from({length:Math.min(minimum,people.length+1)},()=>skill));
  const assignments=new Map();
  const position=(skill,index,seen)=>{
   for(const person of people){
    if(seen.has(person.uid)||!certified(person,skill))continue;
    seen.add(person.uid);
    const previous=assignments.get(person.uid);
    if(previous!==undefined&&!position(slots[previous],previous,seen))continue;
    assignments.set(person.uid,index);
    return true;
   }
   return false;
  };
  const otherCovered=slots.every((skill,index)=>position(skill,index,new Set()));
  if(!otherCovered)return 0;
  let mount=0;
  while(mount<lowest){
   slots.push('montagem');
   if(!position('montagem',slots.length-1,new Set()))break;
   mount++;
  }
  lowest=Math.min(lowest,mount);
 }
 return lowest;
}

function normalizePresence(slot){
 if(!timed(slot))return null;
 const start=minutes(slot.start), end=minutes(slot.end);
 if(start===null||end===null||start===end)return null;
 return {start,end:end<=start?end+1440:end};
}

function simultaneousHeadcountDeficits({date,sector,shift,minimum,confirmed,countsPerson}){
 if(minimum===null||minimum<=0)return [];
 const spans=confirmed.filter(countsPerson).map(person=>normalizePresence(person._hours)).filter(Boolean);
 if(!spans.length)return [];
 const points=[...new Set(spans.flatMap(s=>[s.start,s.end]))].sort((a,b)=>a-b);
 const deficits=[];
 for(let i=0;i<points.length-1;i++){
  const start=points[i],end=points[i+1];
  if(end<=start)continue;
  const covered=spans.filter(s=>s.start<=start&&s.end>=end).length;
  const deficit=Math.max(0,minimum-covered);
  if(!deficit)continue;
  const fmt=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  deficits.push({date,sector,shift,skill:'',start:fmt(start%1440),end:fmt(end%1440),minimum,covered,deficit,uids:[],kind:'headcount'});
 }
 return deficits;
}

export function evaluateOperationalDay({date, entries, people, requirements = [], policy = {}}){
 const weekday = weekdayOf(date);
 const holiday = (policy.holidays || []).includes(date);
 const day = days[holiday ? 0 : weekday];
 const busyDay = holiday || weekday === 0 || weekday === 6 || (policy.peakPeriods || []).some(({start,end})=>date>=start&&date<=end);
 const strongPeak = (policy.strongPeaks || []).includes(date);
 const assignments = new Map(entries.filter(x=>x.date===date).map(x=>[x.uid,x.type]));
 const typeOf = person => {
  const staff=assignments.get(person.uid), account=assignments.get(person.accountUid);
  return staff==='leave'||account==='leave'?'leave':staff??account;
 };
 const active = people.filter(person=>person.status==='active');
 const working = active.filter(person=>typeOf(person)==='work');
 const scheduled = new Set(working.map(person=>person.uid));
 const weekdayRules = requirements.filter(rule=>rule.weekday===(holiday?0:weekday));
 const shifts = ['manha','noite'].flatMap(shift=>['cozinha','frente'].map(sector=>{
  const cohort = active.filter(person=>inSector(person,sector)&&profile(person).shift===shift);
  const roster = cohort.filter(person=>scheduled.has(person.uid));
  const uniqueHours = group => [...new Map(group.map(person=>available(person,day)).filter(timed).map(slot=>[slot.start+'-'+slot.end,slot])).values()];
  const confirmed = roster.filter(person=>timed(available(person,day))).map(person=>({...person,_hours:available(person,day)}));
  const slots = uniqueHours(confirmed.length?confirmed:cohort);
  // A common envelope is safe for analysis only when the shifts are daytime and overlap.
  // Mixed schedules remain subject to interval validation, not an inferred full-shift assignment.
  const daytime=slots.every(slot=>minutes(slot.end)>minutes(slot.start));
  const overlap=slots.length&&Math.max(...slots.map(slot=>minutes(slot.start)))<Math.min(...slots.map(slot=>minutes(slot.end)));
  const window=slots.length===1?{start:slots[0].start,end:slots[0].end}:daytime&&overlap?{
   start:slots.reduce((a,b)=>a.start<b.start?a:b).start,
   end:slots.reduce((a,b)=>a.end>b.end?a:b).end
  }:slots.length?{
   start:slots.reduce((a,b)=>a.start<b.start?a:b).start,
   end:slots.reduce((a,b)=>a.end>b.end?a:b).end
  }:null;
  const coverageWindow = slots.length===1?{start:slots[0].start,end:slots[0].end}:null;
  const managers = confirmed.filter(management);
  const minimum = sector==='cozinha' ? busyDay||strongPeak?4:2 : busyDay?3:policy.frontWeekdayMinimum??null;
  const countsPerson = person => !(sector==='frente'&&policy.countManagement===false&&management(person));
  const count = confirmed.filter(countsPerson).length;
  const missingHours = roster.length-confirmed.length;
  const policyUnknown = sector==='frente'&&(minimum===null||policy.countManagement==null&&managers.length>0);
  const uncertain = missingHours>0 || policyUnknown;
  const skill = sector==='cozinha'&&strongPeak ? 'montagem' : '';
  const explicit = window?weekdayRules.filter(rule=>rule.skill&&rule.sector===sector&&minutes(rule.start)<minutes(window.end)&&minutes(rule.end)>minutes(window.start)):[];
  const skillCount = skill ? assuredMontage(confirmed,explicit) : null;
  const simultaneousHeadcount = (slots.length>1 || confirmed.some(p=>normalizePresence(p._hours)&&window&& (minutes(p._hours.start)>minutes(window.start)||minutes(p._hours.end)<minutes(window.end)))) && !uncertain
   ? simultaneousHeadcountDeficits({date,sector,shift,minimum,confirmed,countsPerson}) : [];
  const simultaneousHeadcountGap = simultaneousHeadcount.reduce((max,item)=>Math.max(max,item.deficit),0);
  const headcountGap = minimum===null ? 0 : Math.max(Math.max(0,minimum-count), simultaneousHeadcountGap);
  const skillGap = skill ? Math.max(0,3-skillCount) : 0;
  const roleGap = (sector==='cozinha'?!confirmed.some(kitchenLead):!managers.length) ? 1 : 0;
  const reasons = [];
  if(sector==='frente'&&strongPeak&&count>=3)reasons.push('O mínimo pode ser suficiente se o apoio conseguir alternar entre iFood e vitrine. Se os dois precisarem de atendimento enquanto sai o chope, confira quem consegue assumir o balcão sem tirar a pessoa do caixa.');
  if(sector==='cozinha'&&!busyDay&&count===2)reasons.push('Duas pessoas podem dar conta num dia tranquilo. Uma terceira dá margem se a produção ou os pedidos aumentarem.');
  if(simultaneousHeadcountGap>0)reasons.push('Com os horários confirmados, há momentos com menos pessoas do que o mínimo esperado.');
  if(skillGap){
   const qualified=confirmed.filter(person=>certified(person,skill)).map(name);
   reasons.push((qualified.length?qualified.join(', ')+' têm montagem confirmada. ':'Ainda não há montagem confirmada na equipe. ')+
    'Considerando os outros postos cadastrados, '+skillCount+' conseguem ficar na montagem ao mesmo tempo. No pico, a bancada pode precisar de três sem tirar alguém da chapa ou da louça.');
  }
  if(missingHours>0)reasons.push('Confira os horários não informados antes de concluir a cobertura.');
  if(policyUnknown)reasons.push('Confira as regras pendentes da Frente antes de concluir a cobertura.');
  const shortage = Math.max(headcountGap,skillGap,roleGap);
  const candidates = active.filter(person=>inSector(person,sector)&&!roster.includes(person)&&
   (scheduled.has(person.uid)||offTypes.has(typeOf(person)))&&(!skillGap||certified(person,skill)|| (sector==='cozinha'?kitchenLead(person):management(person))))
   .map(person=>({uid:person.uid,name:name(person),scheduled:scheduled.has(person.uid),hours:available(person,day)||null,jobTitle:profile(person).jobTitle||'',rateRole:rateRoleFor(person),
    sector:profile(person).sector,certifications:profile(person).certifications||[],hasAccount:Boolean(person.accountUid),skillConfirmed:!skill||certified(person,skill),countsForMinimum:!(sector==='frente'&&policy.countManagement!==true&&management(person)),matchesRole:sector==='cozinha'?kitchenLead(person):management(person)}));
  return {shift,sector,window,coverageWindow,minimum,count,uncertain,reasons,skill,skillCount,headcountGap,skillGap,roleGap,shortage,missingHours,simultaneousHeadcount,
   people:roster.map(person=>({uid:person.uid,name:name(person),jobTitle:profile(person).jobTitle||'',hours:available(person,day)||null})),candidates};
 }));
 const adjustedPeople=holiday ? active.map(person=>({...person,professional:{...profile(person),availability:(profile(person).availability||[]).filter(slot=>slot.day==='dom').map(slot=>({...slot,day:days[weekday]}))}})) : active;
 const adjustedEntries=working.map(person=>({uid:person.uid,date,type:'work'}));
 const requirementIntervals=coverageTimeline({date,people:adjustedPeople,entries:adjustedEntries,requirements:weekdayRules.map(rule=>({...rule,weekday}))});
 const intervals=[...requirementIntervals,...shifts.flatMap(row=>(row.simultaneousHeadcount||[]).map(item=>({date,sector:row.sector,skill:'',start:item.start,end:item.end,minimum:item.minimum,covered:item.covered,deficit:item.deficit,uids:[],kind:'headcount'})))];
 const recurring = (policy.recurring || []).flatMap(rule=>{
  const absent=active.find(person=>person.uid===rule.absentId), cover=active.find(person=>person.uid===rule.coverId);
  if(!absent||!offTypes.has(typeOf(absent)))return [];
  return [{uid:rule.coverId,forUid:rule.absentId,paid:rule.paid??null,available:Boolean(cover&&typeOf(cover)==='work'&&inSector(cover,front.has(profile(absent).sector)?'frente':profile(absent).sector)&&covering(available(cover,day),shifts.find(row=>row.shift===profile(absent).shift&&row.sector===(front.has(profile(absent).sector)?'frente':profile(absent).sector))?.coverageWindow)),name:cover?name(cover):'Pessoa indisponível',sector:front.has(profile(absent).sector)?'frente':profile(absent).sector,shift:profile(absent).shift}];
 });
 const managers=active.filter(management);
 const manager=managers.filter(person=>title(person)==='manager'), deputy=managers.filter(person=>title(person)==='submanager');
 if(manager.length===1&&deputy.length===1){
  for(const [absent,cover] of [[manager[0],deputy[0]],[deputy[0],manager[0]]]){
   if(!offTypes.has(typeOf(absent))||recurring.some(item=>item.forUid===absent.uid))continue;
   recurring.push({uid:cover.uid,forUid:absent.uid,paid:policy.managementPaid??null,
    available:typeOf(cover)==='work'&&covering(available(cover,day),shifts.find(row=>row.shift===profile(absent).shift&&row.sector==='frente')?.coverageWindow),name:name(cover),sector:'frente',shift:profile(absent).shift});
  }
 }
 for(const replacement of recurring.filter(item=>item.available)){
  const row=shifts.find(item=>item.sector===replacement.sector&&item.shift===replacement.shift);
  const cover=active.find(person=>person.uid===replacement.uid);
  const coversOtherShift=shifts.some(item=>item!==row&&row?.coverageWindow&&item.people.some(person=>person.uid===replacement.uid&&timed(person.hours)&&
   minutes(person.hours.start)<minutes(row.coverageWindow.end)&&minutes(row.coverageWindow.start)<minutes(person.hours.end)));
  if(coversOtherShift)replacement.available=false;
  else if(row&&!row.people.some(person=>person.uid===cover.uid)){
   row.people.push({uid:cover.uid,name:name(cover),jobTitle:profile(cover).jobTitle||'',hours:available(cover,day)});
   const counts=!(row.sector==='frente'&&policy.countManagement===false&&management(cover));
   if(counts)row.count++;
   if(row.sector==='cozinha'?kitchenLead(cover):management(cover))row.roleGap=0;
   row.headcountGap=row.minimum===null?0:Math.max(0,row.minimum-row.count);
   row.shortage=Math.max(row.headcountGap,row.skillGap,row.roleGap);
   row.candidates=row.candidates.filter(candidate=>candidate.uid!==cover.uid);

  }
 }
 for(const row of shifts){
  if(row.roleGap)row.reasons.unshift(row.sector==='cozinha'?'Falta um cozinheiro com horário confirmado neste turno.':'Falta um gerente ou subgerente com horário confirmado neste turno.');
  if(row.headcountGap)row.reasons.unshift('Há '+row.count+' de '+row.minimum+' pessoas com horário confirmado.');
  for(const candidate of row.candidates)candidate.fitsRole=!row.roleGap||candidate.matchesRole;
  const fixedIds=new Set(recurring.filter(item=>item.sector===row.sector&&item.shift===row.shift).map(item=>item.uid));
  row.candidates.sort((a,b)=>
   Number(b.fitsRole)-Number(a.fitsRole)||
   Number(Boolean(wholeTurnAssignment(row,b)))-Number(Boolean(wholeTurnAssignment(row,a)))||
   Number(fixedIds.has(b.uid))-Number(fixedIds.has(a.uid))||
   Number(b.scheduled)-Number(a.scheduled)||a.name.localeCompare(b.name,'pt-BR'));
 }
 const recurringKeys=new Set(recurring.filter(r=>r.available&&r.paid).map(r=>r.uid+'|'+r.shift));
 const recurringPendingFees=new Set(recurring.filter(r=>!r.available&&r.paid===true&&!recurringKeys.has(r.uid+'|'+r.shift)).map(r=>r.uid+'|'+r.shift)).size;
 const pendingKeys=new Set(recurring.filter(r=>!r.available&&r.paid===true).map(r=>r.uid+'|'+r.shift));
 const recurringUnknownFees=new Set(recurring.filter(r=>r.paid==null&&!recurringKeys.has(r.uid+'|'+r.shift)&&!pendingKeys.has(r.uid+'|'+r.shift)).map(r=>r.uid+'|'+r.shift)).size;
 return {date, holiday,busyDay,strongPeak,shifts,intervals,recurring,recurringFees:recurringKeys.size,recurringPendingFees,recurringUnknownFees,
 extra:shifts.reduce((total,row)=>total+(!row.uncertain?row.shortage:0),0),
 attention:shifts.some(row=>row.shortage||row.uncertain)||requirementIntervals.some(row=>row.deficit)||(shifts.some(row=>!row.uncertain&&row.simultaneousHeadcount?.length))||recurring.some(row=>!row.available)};
}

const risk = result => result.shifts.map(row=>row.shortage)
 .concat(result.intervals.reduce((n,row)=>Math.max(n,row.deficit),0),result.recurring.filter(r=>!r.available).length);

export function suggestSundayMove({period,entries,people,requirements,policy,roster}){
 const sundays=fiveTwoSundays(period);
 const evaluate = (date, list) => evaluateOperationalDay({date,entries:list,people,requirements,policy});
 const before = new Map(sundays.map(date=>[date,evaluate(date,entries)]));
 let best=null;
 for(const person of people){
  const from=roster.sundays[person.uid];
  if(!from || entries.find(e=>e.date===from&&e.uid===person.uid)?.type!=='monthly_sunday' || !before.has(from) || (roster.lockedSundays || []).includes(person.uid))continue;
  for(const to of sundays){
   if(to===from || entries.find(e=>e.date===to&&e.uid===person.uid)?.type!=='work')continue;
   const altered=entries.map(e=>e.uid!==person.uid?e:e.date===from?{...e,type:'work'}:e.date===to?{...e,type:'monthly_sunday'}:e);
   const a=evaluate(from,altered), b=evaluate(to,altered);
   if(risk(b).some((value,i)=>value>risk(before.get(to))[i]))continue;
   if(b.shifts.some(row=>row.uncertain)&&b.shifts.some((row,i)=>row.count<before.get(to).shifts[i].count&&row.uncertain))continue;
   const improvement=before.get(from).extra+before.get(to).extra-a.extra-b.extra;
   if(a.recurringFees+b.recurringFees>before.get(from).recurringFees+before.get(to).recurringFees)continue;
   if(improvement<=0 || best&&best.improvement>=improvement)continue;
   best={uid:person.uid,name:name(person),from,to,improvement,before:[before.get(from),before.get(to)],after:[a,b]};
  }
 }
 return best;
}

export function wholeTurnAssignment(row,candidate){
 const window=row?.coverageWindow===undefined?row?.window:row.coverageWindow;
 if(!window||!candidate)return null;
 const {start,end}=window;
 const a=minutes(start), b=minutes(end);
 // Dates across midnight require the full dated-jornada review.
 if(b<=a)return null;
 if(!candidate.scheduled)return {first:null,second:{start,end}};
 if(!timed(candidate.hours))return null;
 const first={start:candidate.hours.start,end:candidate.hours.end};
 const begin=minutes(first.start),stop=minutes(first.end);
 if(stop<=begin)return null;
 if(stop>=a&&stop<b&&begin<=a)return {first,second:{start:first.end,end}};
 if(begin===b)return {first,second:{start,end}};
 return null;
}

export function reviewCoverageAssignment({first,second}){
 return first.start<second.start?checkDoubleShift({first,second}):checkDoubleShift({first:second,second:first});
}

export function validOperationalPolicy(policy){
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const dates=list=>Array.isArray(list)&&list.length<=90&&list.every(date);
 return policy&&dates(policy.holidays)&&dates(policy.strongPeaks)&&Array.isArray(policy.peakPeriods)&&policy.peakPeriods.length<=12&&
  policy.peakPeriods.every(item=>item&&date(item.start)&&date(item.end)&&item.start<=item.end)&&
  [null,true,false].includes(policy.countManagement)&&[null,true,false].includes(policy.managementPaid)&&
  (policy.frontWeekdayMinimum===null||Number.isInteger(policy.frontWeekdayMinimum)&&policy.frontWeekdayMinimum>=1&&policy.frontWeekdayMinimum<=30)&&
  Array.isArray(policy.recurring)&&policy.recurring.length<=60&&policy.recurring.every(item=>item&&
   [item.absentId,item.coverId].every(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id))&&item.absentId!==item.coverId&&[null,true,false].includes(item.paid));
}

export function forecastPaymentDate(date,payroll) {
 if(!Number.isInteger(payroll?.daysAfter)||payroll.daysAfter<0||payroll.daysAfter>90)return null;
 const day=new Date(date+'T12:00:00Z');
 day.setUTCDate(day.getUTCDate()+payroll.daysAfter);
 return day.toISOString().slice(0,10);
}
