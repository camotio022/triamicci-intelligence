// Regras puras de apresentação de recebimento, conversão fixa e previsão de rendimento.
// Nenhum cálculo desta unidade altera saldos: só a conferência aprovada o faz.
import {RECEIVING_UNITS,STOCK_UNITS,normalizeUnit} from './unit-engine.js';
export {RECEIVING_UNITS,STOCK_UNITS};
const quantityUnits=new Set(['un','porcao','pacote','duzia','caixa','fardo']);
const exactFactors={kg:1000,g:1,L:1000,mL:1};
const dimension=u=>['kg','g'].includes(u)?'weight':['L','ml','mL'].includes(u)?'volume':quantityUnits.has(u)?'count':null;
export function inUnit(amount,from,to){
 if(!Number.isFinite(amount)||amount<0)return null;
 if(normalizeUnit(from)===normalizeUnit(to))return amount;
 if(dimension(from)!==dimension(to)||!['weight','volume'].includes(dimension(from)))return null;
 return amount*exactFactors[normalizeUnit(from)]/exactFactors[normalizeUnit(to)];
}
export function validUnitModel(model,stockUnit){
 if(!model)return true;
 if(!RECEIVING_UNITS.includes(model.receivingUnit||stockUnit))return false;
 const conversion=model.conversion;
 if(conversion!==null&&conversion!==undefined&&(
  conversion.fixed!==true||!RECEIVING_UNITS.includes(conversion.fromUnit)||
  !STOCK_UNITS.includes(conversion.toUnit)||conversion.toUnit!==stockUnit||
  conversion.fromUnit!==(model.receivingUnit||stockUnit)||
  !Number.isFinite(conversion.factor)||conversion.factor<=0||conversion.factor>100000))return false;
 const yields=model.yields||[];
 return Array.isArray(yields)&&yields.length<=8&&yields.every(y=>
  typeof y.label==='string'&&y.label.trim().length>=2&&y.label.length<=80&&
  STOCK_UNITS.includes(y.sourceUnit)&&STOCK_UNITS.includes(y.resultUnit)&&
  Number.isFinite(y.sourceQuantity)&&y.sourceQuantity>0&&y.sourceQuantity<=100000&&
  Number.isFinite(y.resultQuantity)&&y.resultQuantity>0&&y.resultQuantity<=100000
 );
}
export function previewStock(amount,unit,model,stockUnit){
 if(!Number.isFinite(amount)||amount<0)return null;
 const exact=inUnit(amount,unit,stockUnit);
 if(exact!==null)return {quantity:Math.round(exact*1000)/1000,unit:stockUnit,kind:'exact'};
 const conversion=model?.conversion;
 if(conversion?.fixed===true&&conversion.fromUnit===unit&&conversion.toUnit===stockUnit){
  const value=amount*conversion.factor;
  return {quantity:Math.round(value*1000)/1000,unit:stockUnit,kind:'configured'};
 }
 return null;
}
export function previewYields(amount,unit,model){
 return (model?.yields||[]).map(y=>{
  let source=inUnit(amount,unit,y.sourceUnit);
  if(source===null&&model?.conversion?.fixed===true&&model.conversion.fromUnit===unit){
   source=inUnit(amount*model.conversion.factor,model.conversion.toUnit,y.sourceUnit);
  }
  if(source===null)return null;
  const value=source/y.sourceQuantity*y.resultQuantity;
  return {label:y.label,quantity:quantityUnits.has(y.resultUnit)?Math.floor(value+1e-9):Math.floor(value*1000)/1000,unit:y.resultUnit,kind:'estimate'};
 }).filter(Boolean);
}
