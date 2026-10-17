// Regras puras compartilhadas pelo endpoint e pelos testes.
export const individualCatalogIds=new Set(['alcatra-bife','alcatra-cubos','frango-file-120g']);
export function countUnit(product){
 return individualCatalogIds.has(product.catalogId)?'un':product.unit;
}
export function validQuantity(x,{allowZero=false,unit='kg'}={}){
 if(typeof x!=='number'||!Number.isFinite(x)||x<0||(!allowZero&&x===0)||x>100000)return false;
 if(unit==='un')return Number.isInteger(x);
 return Math.abs(Math.round(x*1000)-x*1000)<1e-7;
}
export function reconcile({previousTotal,currentTotal,entries,allUnitsCompatible,historyComplete}){
 if(!allUnitsCompatible||!historyComplete||previousTotal===null||
  ![previousTotal,currentTotal,entries].every(x=>typeof x==='number'&&Number.isFinite(x)))return null;
 return Math.round((previousTotal+entries-currentTotal)*1000)/1000;
}
