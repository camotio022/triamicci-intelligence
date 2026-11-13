// Conversão de contagem física, sem gravar ou criar saldo auxiliar.
// Porções prontas e peso avulso representam partes disjuntas do MESMO estoque.
const decimal=value=>{if(value===''||value===null||value===undefined)return null;const s=String(value).trim().replace(',','.');if(!/^(?:\d+)(?:\.\d{1,3})?$/.test(s))return null;return Number(s)};
export function countFromPortions({portions,loose,portionSize,unit}){
 if(!['kg','g'].includes(unit)||!Number.isFinite(portionSize)||portionSize<=0)return null;
 const n=decimal(portions),other=decimal(loose);
 if(n===null||other===null||!Number.isSafeInteger(n)||!Number.isFinite(other)||n>1000000)return null;
 const total=n*portionSize+other;
 if(!Number.isFinite(total)||total<0||total>100000000)return null;
 const rounded=Math.round(total*1000)/1000;
 return Math.abs(rounded-total)<1e-7?rounded:null;
}
