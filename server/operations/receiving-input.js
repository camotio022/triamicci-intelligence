import {receivingConflict} from './receiving-policy.js';
import {validQuantity} from './logic.js';
const units=['kg','g','L','ml','mL','un','porcao','pacote','duzia'];
export function receivingUnit(profile,product){
 if(units.includes(product?.receivingUnitOverride))return product.receivingUnitOverride;
 return units.includes(profile?.receivingPresentation)?profile.receivingPresentation:
  units.includes(profile?.countUnit)?profile.countUnit:'kg';
}
export function receivingLineError(line,profile,product){
 if(Number(line.commercialQuantity)===0)return null;
 if(!units.includes(line.commercialUnit)||!validQuantity(Number(line.commercialQuantity),{unit:line.commercialUnit}))return 'Informe uma quantidade válida e uma unidade de medida para a entrega.';
 if(profile?.controlMode==='quantitative'){
  if(!profile.locations?.includes(line.location))return 'Selecione um destino permitido para este produto.';
  if(!validQuantity(Number(line.stockQuantity),{unit:profile.countUnit}))return `Informe a quantidade física conferida em ${profile.countUnit}.`;
 }else if(Number(line.stockQuantity||0)!==0)return 'Este produto não permite quantidade física. Revise a configuração.';
 if(product&&profile){
  const conflict=receivingConflict(product,profile,{...line,commercialQuantity:Number(line.commercialQuantity),stockQuantity:Number(line.stockQuantity)});
  if(conflict==='RECEIVING_UNIT')return 'A unidade recebida deve corresponder à configuração do produto.';
  if(conflict==='RECEIVING_QUANTITY')return 'Na mesma unidade, a quantidade recebida deve ser igual à quantidade física conferida.';
 }
 return null;
}
