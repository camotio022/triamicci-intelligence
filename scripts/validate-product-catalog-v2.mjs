// Validação local do catálogo v2 proposto. Não conecta ao Firebase e não altera saldos.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../data/triamicci-product-catalog-v2.proposal.json',import.meta.url));
const c=JSON.parse(readFileSync(path,'utf8'));
const errors=[];
const ids=new Set();
const validUnits=new Set(['kg','g','L','mL','ml','un']);
for(const p of c.products||[]){
 if(!/^[a-z0-9-]+$/.test(p.id||''))errors.push('ID inválido: '+p.id);
 if(ids.has(p.id))errors.push('ID duplicado: '+p.id);
 ids.add(p.id);
 if(!validUnits.has(p.stockUnit))errors.push('Unidade base inválida: '+p.id);
 if(p.receivingUnit!=null&&!validUnits.has(p.receivingUnit))errors.push('Unidade de recebimento inválida: '+p.id);
 if(p.operationalUnit!=null&&!validUnits.has(p.operationalUnit))errors.push('Unidade operacional inválida: '+p.id);
 if(p.source!=null&&!['supplier','internal'].includes(p.source))errors.push('Origem inválida: '+p.id);
 if(p.operationalUnit==='un' && p.receivingUnit==='kg' && p.conversionFactor!=null)
  errors.push('Conversão peso-peças automática proibida nesta etapa: '+p.id);
 for(const location of p.countLocations||[])if(!['reserva','giro'].includes(location))errors.push('Local inválido: '+p.id);
}
for(const rule of c.productionRules||[]){
 for(const id of [rule.resultProductId,rule.preferredInputId,...rule.alternativeInputIds])
  if(!ids.has(id))errors.push('Referência inexistente em '+rule.id+': '+id);
 if(rule.alternativeInputIds.includes(rule.preferredInputId))errors.push('Alternativa repetida: '+rule.id);
 if(rule.autoDeduct!==false||rule.manualConfirmationRequired!==true)
  errors.push('Regra insegura: '+rule.id);
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log('Catálogo v2 validado: '+c.products.length+' produtos; '+c.productionRules.length+' regras; SEM escrita no Firestore.');
