import {RECEIVING_UNITS} from './receiving-model.js';
import {validQuantity} from './logic.js';
const units=RECEIVING_UNITS;
const normalized=unit=>unit==='mL'?'ml':unit;
export function receivingConflict(product,profile,line){
 const expected=profile.receivingModel?.receivingUnit||product.receivingUnitOverride||(units.includes(profile.receivingPresentation)?profile.receivingPresentation:product.unit);
 if(!units.includes(expected)||normalized(line.commercialUnit)!==normalized(expected))return 'RECEIVING_UNIT';
 if(profile.controlMode==='quantitative'){
  if(!validQuantity(line.stockQuantity,{unit:profile.countUnit}))return 'QUANTITY';
  if(normalized(line.commercialUnit)===normalized(profile.countUnit)&&Math.round(line.commercialQuantity*1000)!==Math.round(line.stockQuantity*1000))return 'RECEIVING_QUANTITY';
 }
 return null;
}
