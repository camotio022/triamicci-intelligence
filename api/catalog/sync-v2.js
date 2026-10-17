import {readFileSync} from 'node:fs';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';

// Migração aditiva: não altera nomes, unidades legadas, estoque ou status de aprovação.
const proposal=JSON.parse(readFileSync(new URL('../../data/triamicci-product-catalog-v2.proposal.json',import.meta.url),'utf8'));
const fields=['source','receivingUnit','operationalUnit','countLocations','countingMethod','weightPerUnitKg'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId||m.role!=='admin')return send(res,403,'Apenas administrador pode migrar.');
  const action=req.body?.action;
  if(!['preview','apply'].includes(action))return send(res,400,'Ação inválida.');
  const db=getDb(),catalog=db.collection('productCatalog');
  const actorRef=db.doc('memberships/'+actor.uid);
  const proposed=proposal.products;
  const snapshots=await Promise.all(proposed.map(p=>catalog.doc(p.id).get()));
  const plan=proposed.map((p,i)=>{
   const old=snapshots[i].data();
   if(!old)return {id:p.id,status:'missing',reason:'Produto ainda não existe no catálogo central'};
   if(old.name!==p.name||old.stockUnit!==p.stockUnit||old.trackExpiry!==p.trackExpiry||
      old.category!==p.category)return {id:p.id,status:'conflict',reason:'Cadastro central divergente; revisão manual obrigatória'};
   if(p.reviewRequired===true||p.ingredientsPending===true)return {id:p.id,status:'pending',reason:'Revisão ou ficha técnica pendente'};
   const updates=Object.fromEntries(fields.filter(f=>Object.hasOwn(p,f)).map(f=>[f,p[f]]));
   return {id:p.id,status:fields.every(f=>!Object.hasOwn(updates,f)||same(old[f],updates[f]))?'unchanged':'ready',updates};
  });
  const summary=plan.map(x=>({id:x.id,status:x.status,reason:x.reason||null}));
  if(action==='preview')return send(res,200,'Prévia sem alterações.',{plan:summary,schemaVersion:2});
  if(req.body?.confirm!=='APLICAR_CATALOGO_V2')return send(res,400,'Confirmação explícita necessária.');
  const ready=plan.filter(x=>x.status==='ready');
  if(ready.length===0)return send(res,200,'Nenhuma atualização aditiva necessária.',{plan:summary,applied:0});
  const now=new Date();let applied=0;
  await db.runTransaction(async tx=>{
   const [member,...docs]=await Promise.all([tx.get(actorRef),...ready.map(x=>tx.get(catalog.doc(x.id)))]);
   const current=member.data();
   if(!current||current.status!=='active'||current.role!=='admin'||current.unitId!==m.unitId)throw Error('FORBIDDEN');
   for(let i=0;i<ready.length;i++){
    const target=ready[i],p=proposed.find(x=>x.id===target.id),doc=docs[i],old=doc.data();
    if(!old||old.name!==p.name||old.stockUnit!==p.stockUnit||old.trackExpiry!==p.trackExpiry||
      old.category!==p.category)throw Error('CONFLICT');
    if(old.active===true&&old.schemaVersion===2&&!same(target.updates,Object.fromEntries(fields.filter(f=>Object.hasOwn(p,f)).map(f=>[f,old[f]]))))
      throw Error('CONFLICT');
    tx.update(catalog.doc(target.id),{...target.updates,schemaVersion:2,updatedAt:now,updatedBy:actor.uid});
    tx.create(db.collection('auditLogs').doc(),{event:'catalog.v2_metadata_applied',
      unitId:m.unitId,catalogId:target.id,actorUid:actor.uid,at:now,
      before:Object.fromEntries(Object.keys(target.updates).map(k=>[k,old[k]??null])),
      after:target.updates});
    applied++;
   }
  });
  return send(res,200,'Metadados v2 aplicados sem alterar saldos.',{applied,plan:summary});
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
  if(e.message==='CONFLICT')return send(res,409,'O catálogo mudou durante a revisão. Gere uma nova prévia.');
  console.error('Catalog migration:',e.message);return send(res,500,'Falha na revisão do catálogo v2.');
 }
}
