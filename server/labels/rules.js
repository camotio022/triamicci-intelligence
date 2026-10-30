// Datas de etiqueta são calendários locais (YYYY-MM-DD), sem converter unidades nem inventar validade.
const iso=/^\d{4}-\d{2}-\d{2}$/;
export function dateOk(date){if(typeof date!=='string'||!iso.test(date))return false;const x=new Date(date+'T12:00:00Z');return !Number.isNaN(x.getTime())&&x.toISOString().slice(0,10)===date}
export function addCalendarDays(date,days){if(!dateOk(date)||!Number.isInteger(days)||days<0||days>365)return null;const x=new Date(date+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+days);return x.toISOString().slice(0,10)}
export function cappedExpiry({startDate,sourceExpiryDate,policyDays,nowDate}) {
 if(!dateOk(startDate)||!dateOk(sourceExpiryDate)||!dateOk(nowDate))return null;
 if(startDate>nowDate||sourceExpiryDate<startDate||sourceExpiryDate<nowDate)return null;
 const allowed=addCalendarDays(startDate,policyDays);if(!allowed)return null;
 const date=sourceExpiryDate<allowed?sourceExpiryDate:allowed;
 return date>=nowDate?date:null;
}
export function canReplaceLabel({currentExpiry,originalExpiry,proposedExpiry,today}){
 if(![currentExpiry,originalExpiry,proposedExpiry,today].every(dateOk))return false;
 return currentExpiry>=today&&originalExpiry>=today&&proposedExpiry>=today&&
 proposedExpiry<=currentExpiry&&proposedExpiry<=originalExpiry;
}
