export const RESTAURANT_TZ='America/Sao_Paulo';
export function restaurantDay(value=new Date()){
 const d=value instanceof Date?value:new Date(value);
 if(Number.isNaN(d.getTime()))throw new Error('INVALID_DATE');
 return new Intl.DateTimeFormat('en-CA',{timeZone:RESTAURANT_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export function dayKind(day,today=restaurantDay()){
 if(day===today)return 'today';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return 'invalid';
 return day<today?'past':'future';
}
export function rosterToday(schedule,today=restaurantDay()){
 const entries=(schedule?.entries||[]).filter(e=>e.date===today);
 const byUid=new Map();
 for(const e of entries){if(!e.uid)continue;const prior=byUid.get(e.uid);if(!prior||e.type==='leave'||e.type==='off'||e.type==='monthly_sunday')byUid.set(e.uid,e);}
 return [...byUid.values()].map(e=>({...e,operationalStatus:e.type==='work'?'scheduled_unconfirmed':e.type==='leave'?'absence_recorded':'day_off'}));
}

/** Jornada prevista calculada sem gerar ponto real ou presumir presença física. */
export function liveShiftState({day,clock,employee={},attendance=null}){
 const weekday=['dom','seg','ter','qua','qui','sex','sab'][new Date(day+'T12:00:00Z').getUTCDay()];
 const slot=Array.isArray(employee.availability)?employee.availability.find(x=>x.day===weekday):null;
 const valid=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
 const start=valid(slot?.start)?slot.start:null,end=valid(slot?.end)?slot.end:null;
 const minute=x=>Number(x.slice(0,2))*60+Number(x.slice(3));
 const current=valid(clock)?minute(clock):null;
 const from=start?minute(start):null,to=end?minute(end):null;
 const ended=from!==null&&to!==null&&current!==null&&(to>from?current>=to:current>=to&&current<from);
 const due=from!==null&&current!==null&&(to>from?current>=from&&current<to:current>=from||current<to);
 const actual=attendance?.status||null;
 const verified=Boolean(attendance?.lastAction==='correct'&&actual==='working');
 const source=verified?'management':actual?'employee':'system';
 const label=actual==='finished'?'Saída registrada':actual==='absent'?'Ausência confirmada pela gestão':
  actual==='on_break'?'Intervalo declarado':actual==='working'?'Confirmado pelo funcionário':
  ended?'Jornada prevista encerrada':due?'Início previsto pelo sistema':start?'Entrada prevista às '+start:'Turno previsto · horário não informado';
 const active=actual==='working'||actual==='on_break';
 const badge=actual==='finished'?'Saída registrada':actual==='absent'?'Ausência confirmada':actual==='on_break'?'Intervalo declarado':verified?'Presença validada':actual==='working'?'Entrada declarada':'Previsto';
 return {start,end,source,label,badge,active,attendanceStatus:actual,declared:Boolean(actual&&actual!=='absent'),verified,due,ended,upcoming:!actual&&from!==null&&current!==null&&!due&&!ended};
}
