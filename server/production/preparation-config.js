import {convertPhysical} from '../operations/unit-engine.js';
import {countUnit,validQuantity} from '../operations/logic.js';
export const preparationTypes=[
 {id:'portion',label:'Dividir em porções',description:'Mesmo insumo, separado em porções de peso definido.'},
 {id:'transform',label:'Transformar e contar no final',description:'O rendimento real é informado depois do preparo.'},
 {id:'recipe',label:'Seguir uma receita',description:'Ingredientes definidos para produzir um lote.'}
];
const pid=/^[a-f0-9]{40}$/;
export const physicalUnit=p=>p?.physicalUnit|| (p?countUnit(p):undefined);
export function validatePreparation(c){
 if(!c||!preparationTypes.some(t=>t.id===c.type)||typeof c.name!=='string'||c.name.trim().length<3||c.name.length>100)return 'Informe o nome e o processo da preparação.';
 if(!pid.test(c.outputProductId||''))return 'Selecione o produto preparado do catálogo.';
 if(typeof c.method!=='string'||c.method.length>2000)return 'Revise o modo de preparo.';
 if(!['un','porcao','balde','kg','L'].includes(c.resultUnit))return 'Revise a unidade de saída.';
 if(!validQuantity(c.batchYield)||c.batchYield>10000)return 'Informe um rendimento válido.';
 if(c.type!=='recipe'&&c.batchYield!==1)return 'O padrão de porcionamento deve representar uma porção.';
 if(c.type!=='recipe'&&!['porcao','un'].includes(c.resultUnit))return 'Selecione unidades ou porções para o resultado.';
 if(c.type!=='recipe'&&(!pid.test(c.sourceProductId||'')||!validQuantity(c.portionWeight)||!['g','kg'].includes(c.weightUnit)))return 'Selecione o insumo e o peso da porção pronta.';
 if(c.type==='transform'&&c.sourceProductId===c.outputProductId)return 'A origem e o produto preparado devem ser diferentes.';
 if(!Array.isArray(c.ingredients)||c.ingredients.length>12||c.ingredients.some(i=>!i||typeof i.name!=='string'||!i.name.trim()||i.name.length>100||typeof i.amount!=='string'||!i.amount.trim()||i.amount.length>80||typeof i.tracked!=='boolean'||!['g','kg','L','ml','un','orientacao'].includes(i.unit)||i.tracked&&(!pid.test(i.productId||'')||!validQuantity(Number(i.amount))||i.unit==='orientacao')))return 'Revise os ingredientes e as quantidades.';
 if(c.type==='recipe'&&!c.ingredients.length)return 'Adicione os ingredientes da receita.';
 if(!['g','kg'].includes(c.weightUnit))return 'Revise a unidade de peso.';
 if(c.outputPerBatch!==null&&(!validQuantity(c.outputPerBatch)||c.outputPerBatch>10000))return 'Revise a entrada no estoque por receita.';
 if(!['reserva','giro'].includes(c.location))return 'Selecione o local de origem.';
 return null;
}
export function preparationPlan(c,products){
 const errors=[],lines=[];const find=id=>products.find(p=>p.id===id);const out=find(c.outputProductId),outputUnit=physicalUnit(out);
 const sameProduct=c.type==='portion'&&c.sourceProductId===c.outputProductId;
 const invalid=validatePreparation(c);if(invalid)return {ready:false,errors:[invalid],lines:[],outputUnit};
 if(!out||out.status!=='active')errors.push('O produto preparado precisa estar ativo.');
 if(c.type==='transform')errors.push('Definir a baixa da matéria-prima na separação antes de ativar. O peso final não será usado para presumir consumo.');
 let yieldQuantity=c.batchYield;
 if(c.type==='portion'){
  const p=find(c.sourceProductId),unit=physicalUnit(p),converted=convertPhysical({quantity:c.portionWeight,from:c.weightUnit,to:unit});
  if(!p||p.status!=='active')errors.push('O insumo de origem precisa estar ativo.');
  if(!converted.ok)errors.push('O peso da porção não pode ser convertido para a unidade física do insumo.');
  else lines.push({productId:p.id,quantity:converted.quantity,location:c.location,substitutes:[]});
  if(!sameProduct&&(!['un','porcao'].includes(outputUnit)||!['un','porcao'].includes(c.resultUnit)))errors.push('O produto preparado precisa ser contado em unidades ou porções para este porcionamento. Revise a unidade no catálogo.');
  yieldQuantity=1;
 }
 if(c.type==='recipe'){
  if(c.resultUnit!==outputUnit){
   if(c.outputPerBatch===null)errors.push(`Informe quanto uma receita pronta acrescenta ao estoque em ${outputUnit||'unidade física'}.`);
   else yieldQuantity=c.outputPerBatch;
  }
  for(const i of c.ingredients.filter(i=>i.tracked)){
   const p=find(i.productId),unit=physicalUnit(p);let quantity=Number(i.amount);
   if(!p||p.status!=='active'){errors.push('Um ingrediente controlado está inativo ou indisponível.');continue;}
   if(i.unit!==unit){const conv=convertPhysical({quantity,from:i.unit==='ml'?'mL':i.unit,to:unit==='ml'?'mL':unit});if(!conv.ok){errors.push(`Unidade incompatível para ${i.name}.`);continue;}quantity=conv.quantity;}
   if(!validQuantity(quantity,{unit}))errors.push(`Quantidade incompatível para ${i.name}.`);
   lines.push({productId:p.id,quantity,location:c.location,substitutes:[]});
  }
  if(!lines.length)errors.push('Defina ao menos um ingrediente com baixa no estoque antes de ativar.');
 }
 if(!sameProduct&&lines.some(i=>i.productId===c.outputProductId))errors.push('O produto preparado não pode consumir a si próprio.');
 if(new Set(lines.map(i=>i.productId)).size!==lines.length)errors.push('Consolide os ingredientes repetidos em uma única linha.');
 if(!sameProduct&&!validQuantity(yieldQuantity,{unit:outputUnit}))errors.push('Rendimento incompatível com a unidade física do produto preparado.');
 return {ready:errors.length===0,errors,lines:sameProduct?[]:lines,outputUnit:sameProduct?'porcao':outputUnit,yieldQuantity,sameProduct,portionSize:sameProduct?lines[0]?.quantity:null,stockUnit:sameProduct?physicalUnit(find(c.sourceProductId)):null};
}
