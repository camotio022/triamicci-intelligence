// Conciliação pura: nunca converte embalagens abertas com conteúdo indeterminado.
import {convertPackage,convertPhysical,unitInfo} from './unit-engine.js';
export function reconcilePackageCount({closed,opened=0,presentation,rule,profileVersion,stockUnit,openedMeasurements=[]}={}){
 if(!Number.isInteger(closed)||closed<0||!Number.isInteger(opened)||opened<0||!unitInfo(stockUnit))return {ok:false,status:'INVALID_INPUT'};
 if(!Array.isArray(openedMeasurements)||openedMeasurements.length>opened)return {ok:false,status:'INVALID_MEASUREMENTS'};
 if(openedMeasurements.some(m=>!m||typeof m.quantity!=='number'||!Number.isFinite(m.quantity)||m.quantity<0||!unitInfo(m.unit)))return {ok:false,status:'INVALID_MEASUREMENTS'};
 if(openedMeasurements.length!==opened)return {ok:false,status:'NEEDS_MEASUREMENT',closed,opened,unknownOpened:opened-openedMeasurements.length};
 if(opened>0&&openedMeasurements.some(m=>m.quantity===0))return {ok:false,status:'ZERO_REMAINDER_REQUIRES_CLOSURE'};
 if(!rule||rule.presentation!==presentation||rule.validated!==true||rule.fixed!==true)return {ok:false,status:'NEEDS_VERIFIED_CONVERSION'};
 const closedResult=closed>0?convertPackage({quantity:closed,presentation,packageRule:{...rule,version:String(profileVersion)},to:stockUnit}):{ok:true,quantity:0};
 if(!closedResult.ok)return {ok:false,status:'NEEDS_VERIFIED_CONVERSION'};
 let total=closedResult.quantity;
 for(const m of openedMeasurements){
  const converted=convertPhysical({quantity:m.quantity,from:m.unit,to:stockUnit});
  if(!converted.ok)return {ok:false,status:'INCOMPATIBLE_REMAINDER'};
  total+=converted.quantity;
 }
 return {ok:true,status:'READY_FOR_REVIEW',quantity:Number(total.toFixed(3)),unit:stockUnit,profileVersion,requiresReview:true};
}
