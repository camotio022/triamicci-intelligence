// Regras puras para planejar conversões de produtos preparados.
// Não faz leitura ou gravação de estoque; integração transacional fica no backend.
const productId=/^[a-f0-9]{40}$/;
const round=x=>Math.round(x*1000)/1000;
export function validateTransformationRecipe(recipe){
 if(!recipe||!productId.test(recipe.outputProductId||'')||
   !Number.isFinite(recipe.yieldQuantity)||recipe.yieldQuantity<=0||
   !Array.isArray(recipe.lines)||!recipe.lines.length)return {valid:false,reason:'INVALID_RECIPE'};
 if(recipe.lines.some(line=>!productId.test(line.productId||'')||
  (line.productId===recipe.outputProductId||line.substitutes?.includes(recipe.outputProductId))||!Number.isFinite(line.quantity)||line.quantity<=0))
  return {valid:false,reason:'INVALID_INGREDIENT'};
 const ids=recipe.lines.map(line=>line.productId);
 if(new Set(ids).size!==ids.length)return {valid:false,reason:'DUPLICATE_INGREDIENT'};
 return {valid:true,reason:null};
}
export function transformationPreview(recipe,quantity,unitsByProduct={}){
 const check=validateTransformationRecipe(recipe);
 if(!check.valid)return {valid:false,reason:check.reason};
 if(!Number.isFinite(quantity)||quantity<=0||quantity>10000||Math.abs(quantity*1000-Math.round(quantity*1000))>1e-7||(!recipe.outputUnit||['un','porcao','pacote','duzia'].includes(recipe.outputUnit))&&!Number.isInteger(quantity))
  return {valid:false,reason:'INVALID_OUTPUT_QUANTITY'};
 const items=[];
 for(const line of recipe.lines){
  const raw=line.quantity*quantity/recipe.yieldQuantity;
  const unit=unitsByProduct[line.productId];
  if(!['un','kg','g','L','mL','ml','porcao','pacote','duzia'].includes(unit))
   return {valid:false,reason:'UNCONFIRMED_UNIT'};
  // Nunca arredondar uma peça fracionária para cima sem ficha validada.
  if(['un','porcao','pacote','duzia'].includes(unit)&&!Number.isInteger(raw))
   return {valid:false,reason:'FRACTIONAL_PIECES'};
  const value=['un','porcao','pacote','duzia'].includes(unit)?raw:round(raw);
  if(value<=0)return {valid:false,reason:'INVALID_INGREDIENT_QUANTITY'};
  items.push({productId:line.productId,quantity:value,unit,location:line.location||'reserva'});
 }
 return {valid:true,sourceArea:'reserva',destinationArea:'reserva',
  output:{productId:recipe.outputProductId,quantity},inputs:items};
}
