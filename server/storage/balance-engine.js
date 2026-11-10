import {STOCK_UNITS,convertPhysical} from '../operations/unit-engine.js';
const round=x=>Math.round(x*1000)/1000;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1e8;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(x);
const sum=x=>round(Object.values(x).reduce((n,v)=>n+v,0));
const bump=(balance,ids)=>{const versions={...(balance.locationVersions||{})};for(const id of ids)versions[id]=(versions[id]||0)+1;return versions;};
const amountToStock=(quantity,from,to)=>from===to&&positive(quantity)&&quantity>0?{ok:true,quantity}:convertPhysical({quantity,from,to});
export function validateUnifiedBalance(b){
 if(!b||!STOCK_UNITS.includes(b.unit)||!b.byStorage||typeof b.byStorage!=='object'||Array.isArray(b.byStorage))return false;
 if(Object.entries(b.byStorage).some(([key,value])=>!id(key)||!positive(value)))return false;
 if(!positive(b.total)||round(b.total)!==sum(b.byStorage))return false;
 return true;
}
export function newUnifiedBalance(unit){if(!STOCK_UNITS.includes(unit))throw Error('UNIT');return {unit,total:0,byStorage:{},locationVersions:{}};}
export function applyStorageCount(current,{storageId,quantity,unit}){
 if(!validateUnifiedBalance(current)||!id(storageId)||!positive(quantity)||unit!==current.unit)return {ok:false,reason:'INVALID_COUNT'};
 const old=current.byStorage[storageId]||0;
 const next={...current,byStorage:{...current.byStorage,[storageId]:round(quantity)}};
 next.total=sum(next.byStorage);next.locationVersions=bump(current,[storageId]);
 return {ok:true,balance:next,difference:round(quantity-old),kind:'COUNT'};
}
export function applyStorageTransfer(current,{from,to,quantity,unit}){
 if(!validateUnifiedBalance(current)||!id(from)||!id(to)||from===to||!positive(quantity)||quantity<=0||unit!==current.unit)return {ok:false,reason:'INVALID_TRANSFER'};
 if((current.byStorage[from]||0)<quantity)return {ok:false,reason:'INSUFFICIENT'};
 const next={...current,byStorage:{...current.byStorage,[from]:round(current.byStorage[from]-quantity),[to]:round((current.byStorage[to]||0)+quantity)}};
 if(!validateUnifiedBalance({...next,total:current.total}))return {ok:false,reason:'INVARIANT'};
 return {ok:true,balance:{...next,total:current.total,locationVersions:bump(current,[from,to])},kind:'TRANSFER'};
}
export function applyStorageEntry(current,{storageId,quantity,unit,origin}){
 if(!['supplier','production'].includes(origin)||!validateUnifiedBalance(current)||!id(storageId)||!positive(quantity)||quantity<=0)return {ok:false,reason:'INVALID_ENTRY'};
 const converted=amountToStock(quantity,unit,current.unit);
 if(!converted.ok)return {ok:false,reason:'UNIT_CONVERSION_REQUIRED'};
 const value=converted.quantity,byStorage={...current.byStorage,[storageId]:round((current.byStorage[storageId]||0)+value)};
 const next={...current,byStorage,total:sum(byStorage)};
 return {ok:true,balance:{...next,locationVersions:bump(current,[storageId])},kind:'ENTRY',origin,quantity:value};
}
export function applyStorageConsumption(current,{storageId,quantity,unit}){
 if(!validateUnifiedBalance(current)||!id(storageId)||!positive(quantity)||quantity<=0)return {ok:false,reason:'INVALID_CONSUMPTION'};
 const converted=amountToStock(quantity,unit,current.unit);
 if(!converted.ok)return {ok:false,reason:'UNIT_CONVERSION_REQUIRED'};
 if((current.byStorage[storageId]||0)<converted.quantity)return {ok:false,reason:'INSUFFICIENT'};
 const byStorage={...current.byStorage,[storageId]:round(current.byStorage[storageId]-converted.quantity)};
 return {ok:true,balance:{...current,byStorage,total:sum(byStorage),locationVersions:bump(current,[storageId])},kind:'CONSUMPTION'};
}
export function receiptStage({receiptId,productId,quantity,unit,alreadyAllocated=0}){
 if(!id(receiptId)||!id(productId)||!positive(quantity)||!positive(alreadyAllocated)||alreadyAllocated>quantity||!STOCK_UNITS.includes(unit))return {ok:false,reason:'INVALID_RECEIPT'};
 return {ok:true,receiptId,productId,unit,quantity,remaining:round(quantity-alreadyAllocated),status:'pending_manager_approval',affectsOfficialBalance:false};
}
