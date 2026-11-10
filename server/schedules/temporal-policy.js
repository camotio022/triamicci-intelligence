import {restaurantDay} from '../../shared/operation-day.js';
export const unitDay=restaurantDay;
export function publicationWindow(period,today=unitDay()){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('INVALID_PERIOD');
 const start=new Date(period+'-01T12:00:00Z');start.setUTCDate(start.getUTCDate()-20);
 const opensOn=start.toISOString().slice(0,10);
 return {opensOn,open:today>=opensOn&&period>=today.slice(0,7)};
}
