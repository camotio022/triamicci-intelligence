export function unitDay(at=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at).map(x=>[x.type,x.value]));
 return `${p.year}-${p.month}-${p.day}`;
}
export function publicationWindow(period,today=unitDay()){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('INVALID_PERIOD');
 const start=new Date(period+'-01T12:00:00Z');start.setUTCDate(start.getUTCDate()-20);
 const opensOn=start.toISOString().slice(0,10);
 return {opensOn,open:today>=opensOn&&period>=today.slice(0,7)};
}
