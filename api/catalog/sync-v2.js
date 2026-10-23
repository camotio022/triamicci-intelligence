import {readFileSync} from 'node:fs';
import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';

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
  if(action!=='preview')return send(res,409,'A aplicação do catálogo experimental está bloqueada até a homologação operacional. Use apenas a prévia.');
  const db=getDb(),catalog=db.collection('productCatalog');
  const proposed=proposal.products;
  const snapshots=await Promise.all(proposed.map(p=>catalog.doc(p.id).get()));
  const plan=proposed.map((p,i)=>{
   const old=snapshots[i].data();
   if(!old)return {id:p.id,status:p.reviewRequired===true||p.ingredientsPending===true||!p.source||!p.operationalUnit?'missing':'new',reason:'Produto ainda não existe no catálogo central'};
   if(old.stockUnit!==p.stockUnit||old.trackExpiry!==p.trackExpiry||
      old.category!==p.category)return {id:p.id,status:'conflict',reason:'Cadastro central divergente; revisão manual obrigatória'};
   if(p.reviewRequired===true||p.ingredientsPending===true)return {id:p.id,status:'pending',reason:'Revisão ou ficha técnica pendente'};
   const updates=Object.fromEntries(fields.filter(f=>Object.hasOwn(p,f)).map(f=>[f,p[f]]));
   return {id:p.id,status:fields.every(f=>!Object.hasOwn(updates,f)||same(old[f],updates[f]))?'unchanged':'ready',updates};
  });
  const summary=plan.map(x=>({id:x.id,status:x.status,reason:x.reason||null}));
  if(action==='preview')return send(res,200,'Prévia sem alterações.',{plan:summary,schemaVersion:2});
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
  if(e.message==='CONFLICT')return send(res,409,'O catálogo mudou durante a revisão. Gere uma nova prévia.');
  console.error('Catalog migration:',e.message);return send(res,500,'Falha na prévia do catálogo experimental.');
 }
}
