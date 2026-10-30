// Transformação pura da escala publicada em visualização semanal e domingos.
const label=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
export const dayOf=date=>new Date(date+'T12:00:00Z').getUTCDay();
export function weeksForMonth(period){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period||''))return [];
 const [y,m]=period.split('-').map(Number),n=new Date(Date.UTC(y,m,0)).getUTCDate();
 const groups=new Map();
 for(let d=1;d<=n;d++){
  const date=period+'-'+String(d).padStart(2,'0'),day=dayOf(date);
  const start=new Date(date+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-(day+6)%7);
  const key=start.toISOString().slice(0,10);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(date);
 }
 const weeks=[...groups.values()];
 // Mês que começa no domingo ou sábado: evitar tela inicial quase vazia.
 // Agregamos a semana parcial à primeira semana completa apenas para exibição.
 if(weeks.length>1&&weeks[0].length<=2)weeks.splice(0,2,[...weeks[0],...weeks[1]]);
 return weeks;
}
export function paperRoster(schedule,week){
 const entries=Array.isArray(schedule?.entries)?schedule.entries:[];
 const selected=new Set(week||[]);
 const offByDay=[1,2,3,4].map(day=>({day,label:label[day],people:entries.filter(e=>selected.has(e.date)&&dayOf(e.date)===day&&e.type==='off').map(e=>({uid:e.uid,name:e.name||'Colaborador',date:e.date})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))}));
 const sundays=[...new Set(entries.filter(e=>dayOf(e.date)===0).map(e=>e.date))].sort().map(date=>({date,people:entries.filter(e=>e.date===date&&['monthly_sunday','off'].includes(e.type)).map(e=>({uid:e.uid,name:e.name||'Colaborador'})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))}));
 const exceptions=entries.filter(e=>selected.has(e.date)&&((e.type==='leave')||(e.type==='off'&&![1,2,3,4].includes(dayOf(e.date))))).map(e=>({date:e.date,uid:e.uid,name:e.name||'Colaborador',type:e.type}));
 return {offByDay,sundays,exceptions,entriesInWeek:entries.filter(e=>selected.has(e.date))};
}
