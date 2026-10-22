import {monthDates} from './rules.js';
export const WEEKDAY_LABELS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
export function weekdayOf(date){return new Date(date+'T12:00:00Z').getUTCDay()}
export function weekdayOccurrences(period,weekday){return monthDates(period).filter(date=>weekdayOf(date)===weekday)}
export function generateMonthlyRoster({period,members,fixedOffDays={},sundayOffDays={},approvedLeaves=[],autoSunday=false}){
 const dates=monthDates(period);
 if(!dates.length)throw Error('Mês inválido.');
 const employees=members.filter(m=>m.status==='active');
 if(employees.length*dates.length>1000)throw Error('Escala excede o limite de 1000 registros.');
 for(const m of employees){
  const day=fixedOffDays[m.uid];
  if(!Number.isInteger(day)||day<1||day>4)throw Error('Cadastre uma folga habitual de segunda a quinta para '+(m.name||m.uid));
  const sundays=dates.filter(d=>weekdayOf(d)===0);const requested=approvedLeaves.find(r=>r.status==='approved'&&(r.uid===m.uid||r.uid===m.accountUid)&&r.date.startsWith(period)&&weekdayOf(r.date)===0)?.date;
  const sunday=sundayOffDays[m.uid]||(autoSunday?(requested||sundays[(employees.indexOf(m)+Number(period.slice(5)))%sundays.length]):null);if(sunday&&!sundayOffDays[m.uid])sundayOffDays={...sundayOffDays,[m.uid]:sunday};
  if(!sunday||!dates.includes(sunday)||weekdayOf(sunday)!==0)throw Error('Selecione um domingo mensal válido para '+(m.name||m.uid));
 }
 return employees.flatMap(m=>dates.map(date=>({uid:m.uid,date,type:date===sundayOffDays[m.uid]?'monthly_sunday':approvedLeaves.some(r=>r.status==='approved'&&(r.uid===m.uid||r.uid===m.accountUid)&&r.date===date)?'leave':weekdayOf(date)===fixedOffDays[m.uid]?'off':'work'})))
  .sort((a,b)=>a.date.localeCompare(b.date)||a.uid.localeCompare(b.uid));
}
