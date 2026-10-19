// Validação pura: datas são YYYY-MM-DD no calendário local da unidade.
// A cobertura e os descansos são regras de pré-publicação, não aprovação automática.
const iso=/^\d{4}-\d{2}-\d{2}$/;
export function validDate(date){if(typeof date!=='string'||!iso.test(date))return false;const d=new Date(date+'T12:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===date;}
export function weekKey(date){const d=new Date(date+'T12:00:00Z');const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);return d.toISOString().slice(0,10);}
export function monthDates(period){
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))return [];
 const [y,m]=period.split('-').map(Number);
 return Array.from({length:new Date(Date.UTC(y,m,0)).getUTCDate()},(_,i)=>period+'-'+String(i+1).padStart(2,'0'));
}
export function validateRosterSchedule({entries,members,minKitchen=4,period=null,complete=false,enforceCoverage=true}){
 const errors=[];if(!Array.isArray(entries)||entries.length>1000)return ['Quantidade inválida de lançamentos.'];
 const known=new Map((members||[]).map(m=>[m.uid,m]));
 if(!Number.isInteger(minKitchen)||minKitchen<1||minKitchen>30)return ['Cobertura mínima inválida.'];
 const dates=new Map(),assigned=new Set();
 for(const entry of entries){
  if(!entry||!validDate(entry.date)||!known.has(entry.uid)||!['work','off','leave','monthly_sunday'].includes(entry.type)){errors.push('Registro de escala inválido.');continue}
  const id=entry.uid+'|'+entry.date;if(assigned.has(id))errors.push('Duplicidade na escala: '+id);assigned.add(id);
  const dayOfWeek=new Date(entry.date+'T12:00:00Z').getUTCDay();
  if(entry.type==='off'&&(dayOfWeek===0||dayOfWeek===5||dayOfWeek===6))errors.push('Folga fixa fora de segunda a quinta: '+id);
  if(entry.type==='monthly_sunday'&&dayOfWeek!==0)errors.push('Folga mensal especial deve ser domingo: '+id);
  const day=dates.get(entry.date)||[];day.push(entry);dates.set(entry.date,day);
 }
 if(complete){
  const datesExpected=monthDates(period);
  if(!datesExpected.length)errors.push('Mês inválido.');
  const membersActive=(members||[]).filter(m=>m.status!=='inactive');
  for(const m of membersActive){
   for(const date of datesExpected){if(!assigned.has(m.uid+'|'+date))errors.push('Escala incompleta para '+m.uid+' em '+date)}
   const count=entries.filter(e=>e.uid===m.uid&&e.type==='monthly_sunday'&&e.date.startsWith(period)).length;
   if(count!==1)errors.push('Folga de domingo mensal não cadastrada corretamente para '+m.uid);
  }
  if(errors.length>40)return errors.slice(0,40).concat('Há outros dias pendentes.');
 }
 const weeks=new Map();
 for(const entry of entries){
  if(!entry||!validDate(entry.date)||!known.has(entry.uid))continue;
  const key=entry.uid+'|'+weekKey(entry.date),arr=weeks.get(key)||[];arr.push(entry);weeks.set(key,arr);
 }
 for(const [key,week] of weeks){if(week.length===7&&week.filter(e=>e.type==='off').length!==1)errors.push('Semana 6x1 sem uma folga semanal: '+key)}
 for(const [date,day] of dates){
  const sun=new Date(date+'T12:00:00Z').getUTCDay()===0;
  const workers=day.filter(e=>e.type==='work').map(e=>known.get(e.uid)).filter(Boolean);
  const cooksOff=day.filter(e=>['off','monthly_sunday'].includes(e.type)&&known.get(e.uid)?.role==='cook');
  if(enforceCoverage&&cooksOff.length>1)errors.push('Dois cozinheiros de folga em '+date);
  const kitchen=workers.filter(m=>m.professional?.sector==='cozinha');
  if(enforceCoverage&&complete&&day.length===known.size&&kitchen.length<minKitchen)errors.push('Cobertura de cozinha abaixo do mínimo em '+date);
  if(enforceCoverage&&complete&&sun&&day.length===known.size&&!kitchen.some(m=>m.role==='auxiliar'&&m.professional?.certifications?.includes('montagem')))errors.push('Domingo sem montagem confirmada em '+date);
 }
 return errors;
}
