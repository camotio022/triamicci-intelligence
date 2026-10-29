import {validQuantity} from './logic.js';
const units=['kg','g','L','ml','mL','un','porcao','pacote','duzia'];
export function receivingUnit(profile){
 return units.includes(profile?.receivingPresentation)?profile.receivingPresentation:
  units.includes(profile?.countUnit)?profile.countUnit:'kg';
}
export function receivingLineError(line,profile){
 if(Number(line.commercialQuantity)===0)return null;
 if(!units.includes(line.commercialUnit)||!validQuantity(Number(line.commercialQuantity),{unit:line.commercialUnit}))return 'Informe uma quantidade válida e uma unidade de medida para a entrega.';
 if(profile?.controlMode==='quantitative'){
  if(!profile.locations?.includes(line.location))return 'Selecione um destino permitido para este produto.';
  if(!validQuantity(Number(line.stockQuantity),{unit:profile.countUnit}))return `Informe a quantidade física conferida em ${profile.countUnit}.`;
 }else if(Number(line.stockQuantity||0)!==0)return 'Este produto não permite quantidade física. Revise a configuração.';
 return null;
}
