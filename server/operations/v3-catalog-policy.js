const MODES=['quantitative','availability','on_demand'];
const LOCATIONS=['reserva','giro'];
const UNITS=['kg','g','L','mL','un','duzia','porcao','pacote'];
const safeText=s=>typeof s==='string'&&s.trim().length>0;
export function validateOperationalProfile(p){
 const errors=[];
 if(!p||typeof p!=='object')return {ok:false,errors:['PROFILE_REQUIRED']};
 if(!safeText(p.displayName)||p.displayName.trim().length>100)errors.push('NAME_REQUIRED');
 if(!MODES.includes(p.controlMode))errors.push('CONTROL_MODE_INVALID');
 if(!['supplier','internal','both'].includes(p.origin))errors.push('ORIGIN_INVALID');
 if(!Array.isArray(p.locations)||!p.locations.length||p.locations.some(x=>!LOCATIONS.includes(x))||new Set(p.locations).size!==p.locations.length)errors.push('LOCATIONS_INVALID');
 if(p.controlMode==='quantitative'&&!UNITS.includes(p.countUnit))errors.push('COUNT_UNIT_REQUIRED');
 if(p.countUnit&&!UNITS.includes(p.countUnit))errors.push('COUNT_UNIT_INVALID');
 if(p.receivingPresentation&&!safeText(p.receivingPresentation))errors.push('RECEIVING_PRESENTATION_INVALID');
 if(p.unitConversion&&p.unitConversion.fixed!==true)errors.push('NO_ASSUMED_CONVERSION');
 return {ok:errors.length===0,errors};
}
export function stockVisibility({mode,signal='unknown',reserve=null,giro=null,reserveAt=null,giroAt=null,reserveSessionId=null,giroSessionId=null,estimated=false}){
 if(mode!=='quantitative')return {status:signal,quantity:null,unit:null,confidence:'OBSERVATION'};
 if(!reserve||!giro||reserve.unit!==giro.unit)return {status:'unverified',quantity:null,confidence:'INCOMPLETE'};
 if(!Number.isFinite(reserve.quantity)||!Number.isFinite(giro.quantity)||reserve.quantity<0||giro.quantity<0)return {status:'unverified',quantity:null,confidence:'INVALID'};
 if(!reserveAt||!giroAt)return {status:'unverified',quantity:null,confidence:'MISSING_TIMESTAMP'};
 const sync=Boolean(reserveSessionId&&giroSessionId&&reserveSessionId===giroSessionId);
 return {status:sync?'counted':'mixed_snapshots',quantity:sync?reserve.quantity+giro.quantity:null,unit:reserve.unit,confidence:estimated?'ESTIMATED':sync?'OBSERVED':'OUTDATED'};
}
export function countGroupedPackages({complete=0,perGroup=0,loose=0}){
 if(!Number.isInteger(complete)||complete<0||!Number.isInteger(perGroup)||perGroup<=0||!Number.isInteger(loose)||loose<0)return {ok:false,reason:'INVALID_GROUP'};
 return {ok:true,quantity:complete*perGroup+loose,unit:'porcao'};
}
export function transitionOrder(order,next){
 const allowed={requested:['confirmed','cancelled','overdue'],confirmed:['partially_received','received','cancelled','overdue'],overdue:['confirmed','partially_received','received','cancelled'],partially_received:['partially_received','received','cancelled'],received:[],cancelled:[]};
 if(!order||!allowed[order.status]?.includes(next))return {ok:false,reason:'INVALID_TRANSITION'};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(order.etaDate||'')||Number.isNaN(Date.parse(order.etaDate+'T12:00:00Z')))return {ok:false,reason:'ETA_REQUIRED'};
 return {ok:true,status:next};
}
export function reportShortage({productId,location,reporterUid,note=''}) {
 if(!safeText(productId)||!safeText(reporterUid)||!LOCATIONS.includes(location)||typeof note!=='string'||note.length>240)return {ok:false,reason:'INVALID_REPORT'};
 return {ok:true,productId,location,reporterUid,note:note.trim(),changesBalance:false};
}
