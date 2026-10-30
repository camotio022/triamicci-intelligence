// Defesa em profundidade: os campos financeiros não podem sair do servidor para perfis operacionais.
const privatePattern=/(cost|price|value|profit|margin|salary|wage|payment|revenue|budget|financial|unitprice|unitcost|markup|faturamento|lucro|preco|custo)/i;
export function redactFinancial(value){
 if(Array.isArray(value))return value.map(redactFinancial);
 if(!value||typeof value!=='object'||value instanceof Date||typeof value.toDate==='function')return value;
 const out={};
 for(const [key,entry] of Object.entries(value))if(!privatePattern.test(key))out[key]=redactFinancial(entry);
 return out;
}
