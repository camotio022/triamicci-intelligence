import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {countUnit,validQuantity} from '../operations/logic.js';
import {areaTotals,allocateFEFO} from '../operations/lot-logic.js';
import {validProductionSelection} from './logic.js';
import {createHash} from 'node:crypto';

const productIdPattern=/^[a-f0-9]{40}$/;
const idPattern=/^[a-z0-9-]{3,64}$/;
const requestPattern=/^[a-f0-9-]{36}$/i;
const round=x=>Math.round(x*1000)/1000;
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const clean=d=>({id:d.id,...d.data(),at:iso(d.data().at),updatedAt:iso(d.data().updatedAt)});
function validLine(x){
 return productIdPattern.test(x?.productId||'')&&validQuantity(x?.quantity)&&
  (x?.substitutes===undefined||Array.isArray(x.substitutes)&&x.substitutes.length<=4&&x.substitutes.every(id=>productIdPattern.test(id)));
}
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),member=await membership(actor.uid);
  if(!member?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const db=getDb(),unit=db.collection('units').doc(member.unitId);
  const recipes=unit.collection('productionRecipes'),runs=unit.collection('productionRuns');
  const action=req.body?.action;
  if(action==='list'){
   const [r,p]=await Promise.all([recipes.orderBy('name').limit(100).get(),runs.orderBy('at','desc').limit(30).get()]);
   return send(res,200,'Produção carregada.',{recipes:r.docs.map(clean),runs:p.docs.map(clean)});
  }
  if(action==='saveRecipe'){
   if(!['admin','manager'].includes(member.role))return send(res,403,'Somente administração pode definir preparações.');
   const {id,name,yieldQuantity,lines}=req.body||{};
   if(!idPattern.test(id||'')||typeof name!=='string'||name.trim().length<3||name.length>100||
    !Number.isInteger(yieldQuantity)||yieldQuantity<1||yieldQuantity>10000||
    !Array.isArray(lines)||lines.length<1||lines.length>12||!lines.every(validLine)||
    new Set(lines.map(x=>x.productId)).size!==lines.length||
    lines.some(x=>x.substitutes?.includes(x.productId)))return send(res,400,'Revise a ficha técnica.');
   const ref=recipes.doc(id),actorRef=db.doc('memberships/'+actor.uid);
   await db.runTransaction(async tx=>{
    const [a,prev,...products]=await Promise.all([tx.get(actorRef),tx.get(ref),
     ...[...new Set(lines.flatMap(x=>[x.productId,...(x.substitutes||[])]))].map(id=>tx.get(unit.collection('products').doc(id)))]);
    if(!a.exists||a.data().status!=='active'||!['admin','manager'].includes(a.data().role)||a.data().unitId!==member.unitId)throw Error('FORBIDDEN');
    if(products.some(x=>!x.exists||x.data().status!=='active'))throw Error('PRODUCT_NOT_FOUND');
    const now=new Date();
    tx.set(ref,{name:name.trim(),yieldQuantity,lines:lines.map(x=>({productId:x.productId,
      quantity:x.quantity,substitutes:x.substitutes||[]})),version:(prev.data()?.version||0)+1,
      updatedAt:now,updatedBy:actor.uid,active:true});
    tx.create(db.collection('auditLogs').doc(),{event:'production.recipe_saved',unitId:member.unitId,
      recipeId:id,actorUid:actor.uid,at:now});
   });
   return send(res,200,'Ficha técnica salva.');
  }
  if(action!=='finish')return send(res,400,'Ação inválida.');
  const {recipeId,requestId,portions,items,notes=''}=req.body||{};
  if(!idPattern.test(recipeId||'')||!requestPattern.test(requestId||'')||
   !Number.isInteger(portions)||portions<1||portions>10000||
   !Array.isArray(items)||items.length<1||items.length>12||
   items.some(i=>!productIdPattern.test(i?.productId||'')||!validQuantity(i.quantity))||
   new Set(items.map(i=>i.productId)).size!==items.length||
   typeof notes!=='string'||notes.length>240)return send(res,400,'Revise os insumos realmente utilizados.');
  const ref=runs.doc(requestId);
  const payloadHash=createHash('sha256').update(JSON.stringify({recipeId,portions,items,notes})).digest('hex');
  let duplicate=false;
  await db.runTransaction(async tx=>{
   const recipeRef=recipes.doc(recipeId),actorRef=db.doc('memberships/'+actor.uid);
   const productRefs=items.map(i=>unit.collection('products').doc(i.productId));
   const balanceRefs=items.map(i=>unit.collection('physicalBalances').doc(i.productId));
   const [a,recipe,existing,...docs]=await Promise.all([tx.get(actorRef),tx.get(recipeRef),tx.get(ref),
    ...productRefs.map(p=>tx.get(p)),...balanceRefs.map(b=>tx.get(b))]);
   if(!a.exists||a.data().status!=='active'||a.data().unitId!==member.unitId||
     !['admin','manager','cook'].includes(a.data().role))throw Error('FORBIDDEN');
   if(existing.exists){
    if(existing.data().payloadHash!==payloadHash||existing.data().actorUid!==actor.uid)throw Error('CONFLICT');
    duplicate=true;return;
   }
   if(!recipe.exists||recipe.data().active!==true)throw Error('RECIPE_NOT_FOUND');
   const recipeData=recipe.data(),productDocs=docs.slice(0,items.length),balanceDocs=docs.slice(items.length);
   if(productDocs.some(p=>!p.exists||p.data().status!=='active')||balanceDocs.some(b=>!b.exists))throw Error('MISSING_STOCK');
   if(!validProductionSelection(recipeData.lines,items))
      throw Error('UNAUTHORIZED_SUBSTITUTE');
   // Fetch all lot snapshots and catalog definitions BEFORE any transaction writes.
   const centralDocs=await Promise.all(productDocs.map(p=>p.data().catalogId?
     tx.get(db.collection('productCatalog').doc(p.data().catalogId)):Promise.resolve(null)));
   const lots=await Promise.all(items.map((item,index)=>productDocs[index].data().trackExpiry?
    tx.get(unit.collection('physicalLots').doc(item.productId).collection('lots').orderBy('expiryDate').limit(101)):Promise.resolve(null)));
   const updates=[],lotUpdates=[],used=[];
   for(let i=0;i<items.length;i++){
    const item=items[i],p=productDocs[i].data(),b=balanceDocs[i].data();
    const physicalUnit=countUnit(p,centralDocs[i]?.data());
    if(!validQuantity(item.quantity,{unit:physicalUnit})||b.unit!==physicalUnit||
      b.rotation<item.quantity||b.total<item.quantity)throw Error('INSUFFICIENT');
    const allocations=[];
    if(p.trackExpiry){
     const snap=lots[i];if(snap.size>100)throw Error('LOT_LIMIT');
     const list=snap.docs.map(d=>({id:d.id,...d.data()}));
     const totals=areaTotals(list);
     if(!totals||totals.reserva!==b.reserve||totals.giro!==b.rotation)throw Error('LOTS_NOT_READY');
     const parts=allocateFEFO(list,{area:'giro',quantity:item.quantity,today:new Date().toISOString().slice(0,10)});
     if(!parts)throw Error('LOTS_NOT_READY');
     for(const part of parts){
      const d=snap.docs.find(d=>d.id===part.id),v=d.data();
      lotUpdates.push({ref:d.ref,data:{giro:round(v.giro-part.quantity),
       availableQuantity:round(v.reserva+v.giro-part.quantity),updatedAt:new Date()}});
      allocations.push({lot:v.lot,expiryDate:v.expiryDate,quantity:part.quantity});
     }
    }
    updates.push({ref:balanceRefs[i],data:{rotation:round(b.rotation-item.quantity),
     total:round(b.total-item.quantity),...(Number.isFinite(b.countedTotal)?{
      exitsSinceCount:round((b.exitsSinceCount||0)+item.quantity)}:{}),
     lastProductionId:requestId,lastMovementAt:new Date()}});
    used.push({productId:item.productId,productName:p.name,quantity:item.quantity,
     unit:physicalUnit,substituted:!recipeData.lines.some(l=>l.productId===item.productId),
     lots:allocations});
   }
   const now=new Date();
   for(const x of lotUpdates)tx.update(x.ref,x.data);
   for(const x of updates)tx.update(x.ref,x.data);
   const record={recipeId,recipeName:recipeData.name,recipeVersion:recipeData.version,
    portions,items:used,payloadHash,notes,actorUid:actor.uid,
    actorName:a.data().displayName||a.data().name||actor.name||actor.email||actor.uid,
    unitId:member.unitId,at:now};
   tx.create(ref,record);
   tx.create(db.collection('auditLogs').doc(),{event:'production.finished',unitId:member.unitId,
    operationId:requestId,actorUid:actor.uid,at:now,details:record});
  });
  return send(res,200,duplicate?'Produção já registrada.':'Produção finalizada, estoque de giro atualizado.',{duplicate});
 }catch(e){
  const errors={FORBIDDEN:[403,'Sem permissão.'],PRODUCT_NOT_FOUND:[409,'Produto da receita não está ativo.'],
   RECIPE_NOT_FOUND:[404,'Preparação não encontrada.'],MISSING_STOCK:[409,'Faça a contagem física antes de produzir.'],
   UNAUTHORIZED_SUBSTITUTE:[409,'Produto não autorizado nesta ficha técnica.'],
   INSUFFICIENT:[409,'Saldo de giro insuficiente ou unidade incompatível.'],
   LOTS_NOT_READY:[409,'Concilie os lotes do ingrediente antes de confirmar a produção.'],
   LOT_LIMIT:[409,'Há muitos lotes para baixa automática.'],CONFLICT:[409,'Identificador já utilizado.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  console.error('Production:',e.message);return send(res,500,'Não foi possível registrar a produção.');
 }
}
