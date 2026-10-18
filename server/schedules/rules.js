// Validação pura: datas são YYYY-MM-DD no calendário local da unidade.
// A cobertura e os descansos são regras de pré-publicação, não aprovação automática.
const iso=/^\d{4}-\d{2}-\d{2}$/;
export function validDate(date){if(typeof date!=='string'||!iso.test(date))return false;const d=new Date(date+'T12:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===date;}
export function weekKey(date){const d=new Date(date+'T12:00:00Z');const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);return d.toISOString().slice(0,10);}
export function validateRosterSchedule({entries,members,minKitchen=4}){
 const errors=[];if(!Array.isArray(entries)||entries.length>1000)return ['Quantidade inválida de lançamentos.'];
 const known=new Map((members||[]).map(m=>[m.uid,m]));
 const dates=new Map(),assigned=new Set();
 for(const entry of entries){
  if(!entry||!validDate(entry.date)||!known.has(entry.uid)||!['work','off','leave'].includes(entry.type)){errors.push('Registro de escala inválido.');continue}
  const id=entry.uid+'|'+entry.date;if(assigned.has(id))errors.push('Duplicidade na escala: '+id);assigned.add(id);
  const day=dates.get(entry.date)||[];day.push(entry);dates.set(entry.date,day);
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
  const cooksOff=day.filter(e=>e.type==='off'&&known.get(e.uid)?.role==='cook');
  if(cooksOff.length>1)errors.push('Dois cozinheiros de folga em '+date);
  const kitchen=workers.filter(m=>m.professional?.sector==='cozinha');
  if(day.length===known.size&&kitchen.length<minKitchen)errors.push('Cobertura de cozinha abaixo do mínimo em '+date);
  if(sun&&day.length===known.size&&!kitchen.some(m=>m.professional?.certifications?.includes('montagem')))errors.push('Domingo sem montagem confirmada em '+date);
 }
 return errors;
}
