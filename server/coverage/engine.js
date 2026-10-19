// Pacote 07: estimativas operacionais, nunca folha de pagamento nem autorização de jornada.
export const DEFAULT_RATES=Object.freeze({manager:150,submanager:120,head_cook:150,cook:120,other:100,external:100});
export function rateRoleFor(person){
 const title=String(person?.jobTitle||person?.professional?.jobTitle||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/gerente/.test(title)&&!/sub/.test(title))return 'manager';
 if(/subgerente/.test(title))return 'submanager';
 if(/cozinheiro/.test(title)&&/(chefe|lider)/.test(title))return 'head_cook';
 if(/cozinheiro/.test(title))return 'cook';
 return 'other';
}
export function paymentFor(candidate,rates=DEFAULT_RATES){
  if(candidate?.external)return Number(rates.external);
  const role=candidate?.paymentRole||candidate?.role;
  return Number(rates[role]??rates.other);
}
export function minutes(time){
  if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
  const [h,m]=time.split(':').map(Number);return h*60+m;
}
export function checkDoubleShift({first,second,minRestMinutes=660,maxDailyMinutes=600}){
  const a=first&&[minutes(first.start),minutes(first.end)],b=second&&[minutes(second.start),minutes(second.end)];
  if(!a||!b||[...a,...b].some(x=>x===null))return {state:'blocked',reasons:['Horários inválidos; corrija antes de propor uma dobra']};
  // Shift ordering and overnight cases require a full dated schedule and must not be inferred.
  if(a[1]<=a[0]||b[1]<=b[0])return {state:'blocked',reasons:['Turno noturno ou horário inválido exige planejamento com datas completas']};
  const total=(a[1]-a[0])+(b[1]-b[0]);
  const overlap=a[0]<b[1]&&b[0]<a[1];
  const gap=b[0]-a[1];
  const reasons=[];
  if(overlap)reasons.push('Turnos se sobrepõem');
  if(gap<0)reasons.push('Segundo turno começa antes do fim do primeiro');
  if(total>maxDailyMinutes)reasons.push('Jornada combinada excede o limite conservador de análise');
  // minRestMinutes must be checked against previous and following days, not between shifts within same day.
  reasons.push('Conferir descanso entre jornadas, intervalos, acordo coletivo e cálculo de folha');
  return {state:overlap||gap<0||total>maxDailyMinutes?'blocked':'review',minutesWorked:total,reasons,legalValidated:false};
}
export function coversWindow(person,date,windowStart,windowEnd){
 const start=minutes(windowStart),end=minutes(windowEnd);
 if(start===null||end===null||end<=start)return false;
 const day=['dom','seg','ter','qua','qui','sex','sab'][new Date(date+'T12:00:00Z').getUTCDay()];
 const slot=(person.professional?.availability||person.availability||[]).find(x=>x.day===day);
 if(!slot)return false;
 const a=minutes(slot.start),b=minutes(slot.end),restStart=minutes(slot.breakStart),restEnd=minutes(slot.breakEnd);
 if(a===null||b===null||start<a||end>b)return false;
 if(restStart!==null&&restEnd!==null&&start<restEnd&&end>restStart)return false;
 return true;
}
export function evaluateCoverage({people=[],entries=[],date,sector='cozinha',requiredSkill='',required=1,windowStart='',windowEnd=''}){
 const active=people.filter(p=>p.status==='active');
 const scheduled=new Set(entries.filter(e=>e.date===date&&e.type==='work').map(e=>e.uid));
 const windowed=Boolean(windowStart||windowEnd);
 const workers=active.filter(p=>scheduled.has(p.uid)&&p.professional?.sector===sector&&(!requiredSkill||p.professional?.certifications?.includes(requiredSkill))&&(!windowed||coversWindow(p,date,windowStart,windowEnd)));
 const pendingTiming=active.filter(p=>scheduled.has(p.uid)&&p.professional?.sector===sector&&windowed&&!coversWindow(p,date,windowStart,windowEnd)).length;
 const shortage=Math.max(0,Math.max(0,required)-workers.length);
 const candidates=active.filter(p=>!scheduled.has(p.uid)&&p.professional?.sector===sector)
 .map(p=>({uid:p.uid,name:p.name||'Colaborador',skillConfirmed:!requiredSkill||!!p.professional?.certifications?.includes(requiredSkill),
   estimatedPracticePayment:paymentFor({paymentRole:rateRoleFor(p)}),eligibility:'review',reason:'Fora da escala: validar jornada, consentimento e disponibilidade'}))
 .sort((a,b)=>Number(b.skillConfirmed)-Number(a.skillConfirmed)||a.estimatedPracticePayment-b.estimatedPracticePayment);
 return {date,sector,requiredSkill,required,windowStart,windowEnd,covered:workers.length,unverifiedOrUnavailable:pendingTiming,shortage,candidates,legalValidated:false};
}
