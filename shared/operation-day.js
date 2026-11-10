// Calendar values are restaurant days; timestamps remain UTC instants.
export const RESTAURANT_TZ='America/Sao_Paulo';
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:RESTAURANT_TZ,year:'numeric',month:'2-digit',day:'2-digit'});
export function restaurantDay(value=new Date()){
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))throw Error('INVALID_DATE');
 return dayFormatter.format(date);
}
