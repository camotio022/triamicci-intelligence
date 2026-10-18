// Regras puras da produção: valida o ingrediente usado em cada linha da ficha técnica.
export function validProductionSelection(lines,items){
 if(!Array.isArray(lines)||!Array.isArray(items)||lines.length<1||
    items.length!==lines.length||new Set(items.map(i=>i.productId)).size!==items.length)return false;
 return lines.every((line,i)=>{
  const item=items[i],allowed=[line.productId,...(line.substitutes||[])];
  return allowed.includes(item?.productId)&&
   typeof item.quantity==='number'&&Number.isFinite(item.quantity)&&item.quantity>0&&item.quantity<=100000;
 });
}
export function suggestedQuantity(quantity,portions,yieldQuantity,{individual=false}={}){
 if(![quantity,portions,yieldQuantity].every(x=>Number.isFinite(x)&&x>0))return null;
 const n=quantity*portions/yieldQuantity;
 return individual?Math.ceil(n):Math.round(n*1000)/1000;
}
