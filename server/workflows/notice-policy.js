import {restaurantDay} from '../schedules/restaurant-today.js';
export function validNoticeDate(value){
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
}
// A data vale até o fim do dia da unidade. Avisos antigos sem validade não expiram por suposição.
export function noticeExpired(item,today=restaurantDay()){
 return validNoticeDate(item?.expiresOn)&&item.expiresOn<today;
}
export const noticeHistorical=(item,today)=>item?.status==='archived'||noticeExpired(item,today);
