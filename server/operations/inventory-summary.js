import {calculateDailyInventory} from './daily-inventory.js';
const iso=v=>v?.toDate?.()?.toISOString?.()||(typeof v==='string'?v:null);
export function intervalFromBalance(balance){
 if(!balance?.countId||!iso(balance.at)||![balance.countedReserve,balance.countedRotation,balance.entriesSinceCount,balance.exitsSinceCount].every(x=>Number.isFinite(x)&&x>=0))return null;
 return {previousCountId:balance.countId,previousAt:iso(balance.at),previousReserve:balance.countedReserve,previousRotation:balance.countedRotation,unit:balance.unit,entries:balance.entriesSinceCount,outflows:balance.exitsSinceCount};
}
export function reportFromSnapshot(count,id,name){
 const data=count.data(),interval=data.inventorySummary;if(!interval)return null;
 const at=iso(data.at);
 const report=calculateDailyInventory({unit:data.unit,current:{at,unit:data.unit,reserve:data.reserve,rotation:data.rotation},previous:{at:interval.previousAt,unit:interval.unit,reserve:interval.previousReserve,rotation:interval.previousRotation},entries:[{at,unit:interval.unit,quantity:interval.entries}],outflows:[{at,unit:interval.unit,quantity:interval.outflows}]});
 return {...report,latestEntry:null,productId:id,productName:name,currentAt:at,previousAt:interval.previousAt,currentCountId:count.id,previousCountId:interval.previousCountId,source:'transactional_summary'};
}
