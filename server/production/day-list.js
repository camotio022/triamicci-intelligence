import {restaurantDay} from '../../shared/operation-day.js';
import {createHash} from 'node:crypto';
import {recipeAvailability,recipeProducts} from './readiness.js';
import {sendQuotaError} from '../quota-error.js';
import {isOperationalProduct} from '../operations/catalog-identity.js';
import {validQuantity} from '../operations/logic.js';
import {signalUnitChange} from '../live-signal.js';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
const recipePattern=/^[a-z0-9-]{3,64}$/;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const formatDay=restaurantDay;
const canPlan=role=>['admin','manager','submanager','cook','auxiliar'].includes(role);
const view=d=>({id:d.id,recipeId:d.data().recipeId,recipeName:d.data().recipeName,unit:d.data().unit||'un',plannedQuantity:d.data().plannedQuantity??null,status:d.data().status||'pending',completedQuantity:d.data().completedQuantity??null,createdBy:d.data().createdBy,createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null,completedAt:d.data().completedAt?.toDate?.()?.toISOString?.()||null});
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)return send(res,403,'Sem acesso à produção desta unidade.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId);
  const {action,day=formatDay()}=req.body||{};
  if(!datePattern.test(day)||day!==formatDay())return send(res,400,'A lista do dia deve corresponder à data atual da unidade.');
  const ref=unit.collection('productionDays').doc(day).collection('tasks');
  if(action==='dayList'){
   const snap=await ref.orderBy('createdAt','asc').limit(100).get();
   return send(res,200,'Lista de produção consultada.',{day,tasks:snap.docs.map(view),hasMore:snap.size===100});
  }
  if(action==='dayImport'){
   if(!canPlan(m.role))return send(res,403,'Sem permissão para planejar produção.');
   const {requestId,items}=req.body||{};
   if(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(requestId)||!Array.isArray(items)||!items.length||items.length>12||
      items.some(i=>!recipePattern.test(i?.recipeId||'')||i.plannedQuantity!==null&&
       (!Number.isFinite(i.plannedQuantity)||i.plannedQuantity<=0||i.plannedQuantity>10000))||
      new Set(items.map(i=>i.recipeId)).size!==items.length)
    return send(res,400,'Revise os itens e quantidades da lista.');
   // IDs determinísticos e estáveis em qualquer tentativa de reenvio, inclusive após queda da conexão.
   const ids=items.map((_,i)=>createHash('sha256').update('photo:'+m.unitId+':'+day+':'+requestId+':'+i).digest('hex').slice(0,20));
   const hash=createHash('sha256').update(JSON.stringify(items)).digest('hex');
   let already=false;
   await db.runTransaction(async tx=>{
    const memberRef=db.collection('memberships').doc(actor.uid);
    const recipeRefs=items.map(i=>unit.collection('productionRecipes').doc(i.recipeId));
    const taskRefs=ids.map(id=>ref.doc(id));
    const [memberDoc,...docs]=await Promise.all([tx.get(memberRef),...recipeRefs.map(x=>tx.get(x)),...taskRefs.map(x=>tx.get(x))]);
    if(!memberDoc.exists||memberDoc.data().status!=='active'||memberDoc.data().unitId!==m.unitId||!canPlan(memberDoc.data().role))throw Error('FORBIDDEN');
    const recipeDocs=docs.slice(0,items.length),taskDocs=docs.slice(items.length);
    if(taskDocs.some(x=>x.exists)){
     if(taskDocs.every(x=>x.exists&&x.data().photoImportHash===hash&&x.data().createdBy===actor.uid)) {already=true;return;}
     throw Error('CONFLICT');
    }
    if(recipeDocs.some(x=>!x.exists||x.data().active!==true))throw Error('RECIPE_NOT_FOUND');
    const productIds=[...new Set(recipeDocs.flatMap(x=>[...(x.data().lines||[]).map(l=>l.productId),x.data().outputProductId].filter(Boolean)))];
    const products=await Promise.all(productIds.map(id=>tx.get(unit.collection('products').doc(id))));
    if(products.some(p=>!p.exists||!isOperationalProduct(p.data())))throw Error('RECIPE_NOT_FOUND');
    const available=await recipeProducts(db,unit,recipeDocs.map(x=>x.data()),products,tx);
    recipeDocs.forEach((recipe,i)=>{
     if(!recipeAvailability(recipe.data(),available).available)throw Error('RECIPE_NOT_FOUND');
     const q=items[i].plannedQuantity;
     if(q!==null&&!validQuantity(q,{unit:recipe.data().outputUnit||'un'}))throw Error('INVALID_QUANTITY');
    });
    const now=new Date();
    taskRefs.forEach((taskRef,i)=>tx.create(taskRef,{recipeId:items[i].recipeId,recipeName:recipeDocs[i].data().name,unit:recipeDocs[i].data().outputUnit||'un',plannedQuantity:items[i].plannedQuantity,status:'pending',day,unitId:m.unitId,createdBy:actor.uid,createdAt:now,photoImportHash:hash}));
    signalUnitChange(tx,db,m.unitId,['production']);
    tx.create(db.collection('auditLogs').doc(),{event:'production.photo_import',unitId:m.unitId,day,taskIds:ids,actorUid:actor.uid,count:items.length,at:now});
   });
   return send(res,200,already?'Lista já importada anteriormente.':'Tarefas adicionadas à produção de hoje.',{taskIds:ids,already});
  }
  if(action==='dayAdd'){
   if(!canPlan(m.role))return send(res,403,'Sem permissão para planejar produção.');
   const {recipeId,plannedQuantity=null}=req.body||{};
   if(!recipePattern.test(recipeId||'')||(plannedQuantity!==null&&(!Number.isFinite(plannedQuantity)||plannedQuantity<=0||plannedQuantity>10000)))
    return send(res,400,'Preparação ou quantidade planejada inválida.');
   const recipeRef=unit.collection('productionRecipes').doc(recipeId);
   const taskRef=ref.doc();
   await db.runTransaction(async tx=>{
    const [memberDoc,recipeDoc]=await Promise.all([tx.get(db.collection('memberships').doc(actor.uid)),tx.get(recipeRef)]);
    if(!memberDoc.exists||memberDoc.data().status!=='active'||memberDoc.data().unitId!==m.unitId||!canPlan(memberDoc.data().role))throw Error('FORBIDDEN');
    if(!recipeDoc.exists||recipeDoc.data().active!==true)throw Error('RECIPE_NOT_FOUND');
    const recipe=recipeDoc.data(),ids=[...new Set([...(recipe.lines||[]).map(line=>line.productId),recipe.outputProductId].filter(Boolean))];
    const products=await Promise.all(ids.map(id=>tx.get(unit.collection('products').doc(id))));
    if(products.some(p=>!p.exists||!isOperationalProduct(p.data())))throw Error('RECIPE_NOT_FOUND');
    const context=await recipeProducts(db,unit,[recipe],products,tx);
    if(!recipeAvailability(recipe,context).available)throw Error('RECIPE_NOT_FOUND');
    const outputUnit=recipeDoc.data().outputUnit||'un';if(plannedQuantity!==null&&!validQuantity(plannedQuantity,{unit:outputUnit}))throw Error('INVALID_QUANTITY');
    const now=new Date();
    tx.create(taskRef,{recipeId,recipeName:recipeDoc.data().name,unit:outputUnit,plannedQuantity,status:'pending',day,unitId:m.unitId,createdBy:actor.uid,createdAt:now});
    signalUnitChange(tx,db,m.unitId,['production', 'stock']);
    tx.create(db.collection('auditLogs').doc(),{event:'production.task_added',unitId:m.unitId,day,taskId:taskRef.id,recipeId,actorUid:actor.uid,at:now});
   });
   return send(res,200,'Preparação adicionada à lista do dia.',{taskId:taskRef.id});
  }
  return send(res,400,'Ação inválida.');
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='INVALID_QUANTITY')return send(res,400,'Meta incompatível com a unidade da preparação.');
  if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
  if(e.message==='CONFLICT')return send(res,409,'Esta importação já foi utilizada com dados diferentes.');
  if(e.message==='RECIPE_NOT_FOUND')return send(res,404,'Ficha técnica não disponível.');
  if(sendQuotaError(res,e))return;console.error('Production day list:',e.message);return send(res,500,'Não foi possível consultar ou atualizar a lista de produção.');
 }
}
