// Regras puras para planejar conversões de produtos preparados.
// Não faz leitura ou gravação de estoque; integração transacional fica no backend.
const productId=/^[a-f0-9]{40}$/;
const round=x=>Math.round(x*1000)/1000;
export function validateTransformationRecipe(recipe){
 if(!recipe||!productId.test(recipe.outputProductId||'')||
   !Number.isInteger(recipe.yieldQuantity)||recipe.yieldQuantity<1||
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
 if(!Number.isInteger(quantity)||quantity<1||quantity>10000)
  return {valid:false,reason:'INVALID_OUTPUT_QUANTITY'};
 const items=[];
 for(const line of recipe.lines){
  const raw=line.quantity*quantity/recipe.yieldQuantity;
  const unit=unitsByProduct[line.productId];
  if(!['un','kg','g','L','mL'].includes(unit))
   return {valid:false,reason:'UNCONFIRMED_UNIT'};
  // Nunca arredondar uma peça fracionária para cima sem ficha validada.
  if(unit==='un'&&!Number.isInteger(raw))
   return {valid:false,reason:'FRACTIONAL_PIECES'};
  const value=unit==='un'?raw:round(raw);
  if(value<=0)return {valid:false,reason:'INVALID_INGREDIENT_QUANTITY'};
  items.push({productId:line.productId,quantity:value,unit});
 }
 return {valid:true,sourceArea:'reserva',destinationArea:'reserva',
  output:{productId:recipe.outputProductId,quantity},inputs:items};
}
