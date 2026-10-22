// Regras puras compartilhadas pelo endpoint e pelos testes.
export const individualCatalogIds=new Set(['alcatra-bife','alcatra-cubos','frango-file-120g']);
export function countUnit(product,catalog){
 if(['kg','g','L','ml','mL','un','porcao','pacote','duzia'].includes(product.operationalUnitOverride))return product.operationalUnitOverride;
 if(['kg','g','L','ml','mL','un','porcao','pacote','duzia'].includes(catalog?.operationalUnit))return catalog.operationalUnit;
 if(['kg','g','L','ml','mL','un','porcao','pacote','duzia'].includes(product.operationalUnit))return product.operationalUnit;
 return individualCatalogIds.has(product.catalogId)?'un':product.unit;
}
export function validQuantity(x,{allowZero=false,unit='kg'}={}){
 if(typeof x!=='number'||!Number.isFinite(x)||x<0||(!allowZero&&x===0)||x>100000)return false;
 if(['un','porcao','pacote','duzia'].includes(unit))return Number.isInteger(x);
 return Math.abs(Math.round(x*1000)-x*1000)<1e-7;
}
export function reconcile({previousTotal,currentTotal,entries,allUnitsCompatible,historyComplete}){
 if(!allUnitsCompatible||!historyComplete||previousTotal===null||
  ![previousTotal,currentTotal,entries].every(x=>typeof x==='number'&&Number.isFinite(x)))return null;
 return Math.round((previousTotal+entries-currentTotal)*1000)/1000;
}

export function commercialDelivery({orderedQuantity,physicalQuantity,deliveredWeightKg,receivingUnit,operationalUnit}){
 const expected=validQuantity(orderedQuantity,{unit:receivingUnit});
 if(!expected)return null;
 const actual=receivingUnit===operationalUnit?physicalQuantity:
   receivingUnit==='kg'&&operationalUnit==='un'?deliveredWeightKg:null;
 if(!validQuantity(actual,{unit:receivingUnit}))return null;
 return {orderedQuantity,deliveredQuantity:actual,receivingUnit,
  difference:Math.round((actual-orderedQuantity)*1000)/1000};
}
