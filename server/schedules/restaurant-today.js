export const RESTAURANT_TZ='America/Sao_Paulo';
export function restaurantDay(value=new Date()){
 const d=value instanceof Date?value:new Date(value);
 if(Number.isNaN(d.getTime()))throw new Error('INVALID_DATE');
 return new Intl.DateTimeFormat('en-CA',{timeZone:RESTAURANT_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export function dayKind(day,today=restaurantDay()){
 if(day===today)return 'today';
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(day))return 'invalid';
 return day<today?'past':'future';
}
export function rosterToday(schedule,today=restaurantDay()){
 const entries=(schedule?.entries||[]).filter(e=>e.date===today);
 const byUid=new Map();
 for(const e of entries){if(!e.uid)continue;const prior=byUid.get(e.uid);if(!prior||e.type==='leave'||e.type==='off'||e.type==='monthly_sunday')byUid.set(e.uid,e);}
 return [...byUid.values()].map(e=>({...e,operationalStatus:e.type==='work'?'scheduled_unconfirmed':e.type==='leave'?'absence_recorded':'day_off'}));
}
