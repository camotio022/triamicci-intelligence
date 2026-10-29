import {isOperationalProduct,usesPhysicalLots} from '../../server/operations/catalog-identity.js';
import {hasRecipeCycle} from '../../server/production/recipe-graph.js';
import {signalUnitChange} from '../../server/live-signal.js';
import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';
import dayListHandler from '../../server/production/day-list.js';
import {countUnit,validQuantity} from '../../server/operations/logic.js';
import {areaTotals,allocateFEFO} from '../../server/operations/lot-logic.js';
import {validProductionSelection} from '../../server/production/logic.js';
import {transformationPreview} from '../../server/production/transformation.js';
import {progressAfterProduction} from '../../server/production/daily-task.js';
import {createHash} from 'node:crypto';

const productIdPattern=/^[a-f0-9]{40}$/;
const idPattern=/^[a-z0-9-]{3,64}$/;
const requestPattern=/^[a-f0-9-]{36}$/i;
const round=x=>Math.round(x*1000)/1000;
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const clean=d=>({id:d.id,...d.data(),at:iso(d.data().at),updatedAt:iso(d.data().updatedAt)});
function validLine(x){
 return (x?.location===undefined||['reserva','giro'].includes(x.location))&&productIdPattern.test(x?.productId||'')&&validQuantity(x?.quantity)&&
  (x?.substitutes===undefined||Array.isArray(x.substitutes)&&x.substitutes.length<=4&&x.substitutes.every(id=>productIdPattern.test(id)));
}
export default async function handler(req,res){
 if(['dayList','dayAdd'].includes(req.body?.action))return dayListHandler(req,res);
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),member=await membership(actor.uid);
  if(!member?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const db=getDb(),unit=db.collection('units').doc(member.unitId);
  const recipes=unit.collection('productionRecipes'),runs=unit.collection('productionRuns');
  const action=req.body?.action;
  if(action==='list'){
   const [r,p,available]=await Promise.all([recipes.orderBy('name').limit(100).get(),runs.orderBy('at','desc').limit(30).get(),unit.collection('products').limit(201).get()]);
   if(available.size>200)return send(res,409,'Catálogo acima do limite desta consulta.');
   const ids=new Set(available.docs.filter(d=>isOperationalProduct(d.data())).map(d=>d.id));
   return send(res,200,'Produção carregada.',{recipes:r.docs.filter(d=>d.data().active===true&&(d.data().lines||[]).every(line=>ids.has(line.productId))&&(!d.data().outputProductId||ids.has(d.data().outputProductId))).map(clean),runs:p.docs.map(clean)});
  }
  if(action==='archiveRecipe'){
   if(!['admin','manager','submanager'].includes(member.role))return send(res,403,'Somente gestão pode arquivar fichas.');
   const {id,expectedVersion}=req.body||{};
   if(!idPattern.test(id||'')||!Number.isInteger(expectedVersion)||expectedVersion<1)return send(res,400,'Ficha ou versão inválida.');
   const ref=recipes.doc(id),actorRef=db.doc('memberships/'+actor.uid);
   await db.runTransaction(async tx=>{
    const [a,old]=await Promise.all([tx.get(actorRef),tx.get(ref)]);
    if(!a.exists||a.data().status!=='active'||a.data().unitId!==member.unitId||
       !['admin','manager','submanager'].includes(a.data().role))throw Error('FORBIDDEN');
    if(!old.exists)throw Error('RECIPE_NOT_FOUND');
    if(old.data().version!==expectedVersion)throw Error('CONFLICT');
    if(old.data().active===false)throw Error('RECIPE_ARCHIVED');
    const now=new Date();
    tx.update(ref,{active:false,archivedAt:now,archivedBy:actor.uid,updatedAt:now});
    tx.create(db.collection('auditLogs').doc(),{event:'production.recipe_archived',unitId:member.unitId,recipeId:id,actorUid:actor.uid,at:now});
    signalUnitChange(tx,db,member.unitId);
   });
   return send(res,200,'Ficha arquivada, histórico preservado.');
  }
  if(action==='saveRecipe'){
   if(!['admin','manager','submanager'].includes(member.role))return send(res,403,'Somente administração pode definir preparações.');
   const {id,name,yieldQuantity,lines,outputProductId=null,method='',expectedVersion=null}=req.body||{};
   if(!idPattern.test(id||'')||typeof name!=='string'||name.trim().length<3||name.length>100||
    typeof method!=='string'||method.length>2000||!validQuantity(yieldQuantity)||yieldQuantity<=0||yieldQuantity>10000||
    !Array.isArray(lines)||lines.length<1||lines.length>12||!lines.every(validLine)||
    new Set(lines.map(x=>x.productId)).size!==lines.length||
    lines.some(x=>x.substitutes?.includes(x.productId))||
    (outputProductId!==null&&(!productIdPattern.test(outputProductId)||lines.some(x=>x.productId===outputProductId||x.substitutes?.includes(outputProductId)))))return send(res,400,'Revise a ficha técnica.');
   const ref=recipes.doc(id),actorRef=db.doc('memberships/'+actor.uid);
   await db.runTransaction(async tx=>{
    const [a,prev,...products]=await Promise.all([tx.get(actorRef),tx.get(ref),
     ...[...new Set(lines.flatMap(x=>[x.productId,...(x.substitutes||[])]))].map(id=>tx.get(unit.collection('products').doc(id)))]);
    if(!a.exists||a.data().status!=='active'||!['admin','manager','submanager'].includes(a.data().role)||a.data().unitId!==member.unitId)throw Error('FORBIDDEN');
    if(products.some(x=>!x.exists||!isOperationalProduct(x.data())))throw Error('PRODUCT_NOT_FOUND');
    if(prev.exists&&expectedVersion!==prev.data().version)throw Error('CONFLICT');
    let outputUnit='un';
    if(outputProductId){const output=await tx.get(unit.collection('products').doc(outputProductId));
     if(!output.exists||!isOperationalProduct(output.data()))throw Error('INVALID_OUTPUT');
     const balance=await tx.get(unit.collection('physicalBalances').doc(outputProductId));
     const catalog=output.data().catalogId?await tx.get(db.collection('productCatalog').doc(output.data().catalogId)):null;
     outputUnit=countUnit(output.data(),catalog?.data());
     if(!validQuantity(yieldQuantity,{unit:outputUnit})||balance.exists&&(balance.data().unit!==outputUnit||!Number.isFinite(balance.data().reserve)||!Number.isFinite(balance.data().total)))throw Error('INVALID_OUTPUT');}

    const graph=await tx.get(recipes.limit(101));
    if(graph.size>100)throw Error('RECIPE_GRAPH_LIMIT');
    if(hasRecipeCycle([...graph.docs.filter(d=>d.id!==id&&d.data().active!==false).map(d=>d.data()),{outputProductId,lines}]))throw Error('RECIPE_CYCLE');
    const now=new Date();
    tx.set(ref,{name:name.trim(),method:method.trim(),outputUnit,outputProductId,yieldQuantity,lines:lines.map(x=>({productId:x.productId,
      location:x.location||(outputProductId?'reserva':'giro'),quantity:x.quantity,substitutes:x.substitutes||[]})),version:(prev.data()?.version||0)+1,
      updatedAt:now,updatedBy:actor.uid,active:true});
    signalUnitChange(tx,db,member.unitId);
    tx.create(db.collection('auditLogs').doc(),{event:'production.recipe_saved',unitId:member.unitId,
      recipeId:id,actorUid:actor.uid,at:now});
   });
   return send(res,200,'Ficha técnica salva.');
  }
  if(action!=='finish')return send(res,400,'Ação inválida.');
  const {recipeId,requestId,portions,items,notes='',taskId=null,outputLot='',expiryDate=''}=req.body||{};
  if(!idPattern.test(recipeId||'')||!requestPattern.test(requestId||'')||
   !validQuantity(portions)||portions<=0||portions>10000||
   !Array.isArray(items)||items.length<1||items.length>12||
   items.some(i=>!productIdPattern.test(i?.productId||'')||!validQuantity(i.quantity))||
   new Set(items.map(i=>i.productId)).size!==items.length||
   typeof notes!=='string'||notes.length>240||typeof outputLot!=='string'||outputLot.length>80||typeof expiryDate!=='string'||
   (taskId!==null&&(typeof taskId!=='string'||!/^[A-Za-z0-9]{20}$/.test(taskId))))return send(res,400,'Revise os insumos realmente utilizados.');
  const ref=runs.doc(requestId);
  const payloadHash=createHash('sha256').update(JSON.stringify({recipeId,portions,items,notes,taskId,outputLot,expiryDate})).digest('hex');
  let duplicate=false;
  await db.runTransaction(async tx=>{
   const recipeRef=recipes.doc(recipeId),actorRef=db.doc('memberships/'+actor.uid);
   const productRefs=items.map(i=>unit.collection('products').doc(i.productId));
   const balanceRefs=items.map(i=>unit.collection('physicalBalances').doc(i.productId));
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const taskRef=taskId?unit.collection('productionDays').doc(today).collection('tasks').doc(taskId):null;
   const [a,recipe,existing,task,...docs]=await Promise.all([tx.get(actorRef),tx.get(recipeRef),tx.get(ref),taskRef?tx.get(taskRef):Promise.resolve(null),
    ...productRefs.map(p=>tx.get(p)),...balanceRefs.map(b=>tx.get(b))]);
   if(!a.exists||a.data().status!=='active'||a.data().unitId!==member.unitId||
     !['admin','manager','submanager','cook','auxiliar'].includes(a.data().role))throw Error('FORBIDDEN');
   if(existing.exists){
    if(existing.data().payloadHash!==payloadHash||existing.data().actorUid!==actor.uid)throw Error('CONFLICT');
    duplicate=true;return;
   }
   if(!recipe.exists||recipe.data().active!==true)throw Error('RECIPE_NOT_FOUND');
   if(taskRef&&(!task?.exists||task.data().recipeId!==recipeId||!['pending','partial'].includes(task.data().status)))throw Error('TASK_NOT_PENDING');
   const recipeData=recipe.data(),productDocs=docs.slice(0,items.length),balanceDocs=docs.slice(items.length);
   const transformed=Boolean(recipeData.outputProductId);
   const outputRef=transformed?unit.collection('products').doc(recipeData.outputProductId):null;
   const outputBalanceRef=transformed?unit.collection('physicalBalances').doc(recipeData.outputProductId):null;
   const [outputDoc,outputBalanceDoc]=transformed?await Promise.all([tx.get(outputRef),tx.get(outputBalanceRef)]):[null,null];
   if(transformed&&(!outputDoc.exists||!isOperationalProduct(outputDoc.data())))throw Error('INVALID_OUTPUT');
   const outputCatalog=transformed&&outputDoc.data().catalogId?await tx.get(db.collection('productCatalog').doc(outputDoc.data().catalogId)):null;
   if(productDocs.some(p=>!p.exists||!isOperationalProduct(p.data()))||balanceDocs.some(b=>!b.exists))throw Error('MISSING_STOCK');
   if(productDocs.some(p=>p.data().catalogId==='alcatra'))throw Error('LEGACY_CUT');
   if(!validProductionSelection(recipeData.lines,items))
      throw Error('UNAUTHORIZED_SUBSTITUTE');
   if(transformed&&items.some((item,i)=>item.productId!==recipeData.lines[i].productId))throw Error('INVALID_TRANSFORMATION');
   // Fetch all lot snapshots and catalog definitions BEFORE any transaction writes.
   const centralDocs=await Promise.all(productDocs.map(p=>p.data().catalogId?
     tx.get(db.collection('productCatalog').doc(p.data().catalogId)):Promise.resolve(null)));
   const lots=await Promise.all(items.map((item,index)=>usesPhysicalLots(productDocs[index].data())?
    tx.get(unit.collection('physicalLots').doc(item.productId).collection('lots').orderBy('expiryDate').limit(101)):Promise.resolve(null)));
   const outputUnit=transformed?countUnit(outputDoc.data(),outputCatalog?.data()):'un';
   if(!validQuantity(portions,{unit:outputUnit}))throw Error('INVALID_UNIT_QUANTITY');
   const trackedOutput=transformed&&usesPhysicalLots(outputDoc.data());
   if(trackedOutput&&(!outputLot.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)||!Number.isFinite(Date.parse(expiryDate+'T12:00:00Z'))||new Date(expiryDate+'T12:00:00Z').toISOString().slice(0,10)!==expiryDate||expiryDate<today))throw Error('OUTPUT_LOT_REQUIRED');
   const outputLotRef=trackedOutput?unit.collection('physicalLots').doc(recipeData.outputProductId).collection('lots').doc(createHash('sha256').update(outputLot.trim()+'|'+expiryDate).digest('hex')):null;
   const outputLotDoc=outputLotRef?await tx.get(outputLotRef):null;
   if(outputLotDoc?.exists&&outputLotDoc.data().unit!==outputUnit)throw Error('INVALID_OUTPUT');
   if(transformed){
    const unitMap=Object.fromEntries(productDocs.map((p,i)=>[items[i].productId,countUnit(p.data(),centralDocs[i]?.data())]));
    const check=transformationPreview({...recipeData,outputUnit},portions,unitMap);
    if(!check.valid||check.inputs.some((x,i)=>x.productId!==items[i].productId||Math.abs(x.quantity-items[i].quantity)>0.000001))throw Error('INVALID_TRANSFORMATION');
    if(outputBalanceDoc.exists&&(outputBalanceDoc.data().unit!==outputUnit||!Number.isFinite(outputBalanceDoc.data().reserve)||!Number.isFinite(outputBalanceDoc.data().total)))throw Error('INVALID_OUTPUT');
   }
   const updates=[],lotUpdates=[],used=[];
   for(let i=0;i<items.length;i++){
    const item=items[i],p=productDocs[i].data(),b=balanceDocs[i].data();
    const physicalUnit=countUnit(p,centralDocs[i]?.data());
    const sourceArea=recipeData.lines[i].location||(transformed?'reserva':'giro');
    const sourceField=sourceArea==='reserva'?'reserve':'rotation';
    if(!validQuantity(item.quantity,{unit:physicalUnit})||b.unit!==physicalUnit||
      b[sourceField]<item.quantity||b.total<item.quantity)throw Error('INSUFFICIENT');
    const allocations=[];
    if(usesPhysicalLots(p)){
     const snap=lots[i];if(snap.size>100)throw Error('LOT_LIMIT');
     const list=snap.docs.map(d=>({id:d.id,...d.data()}));
     const totals=areaTotals(list);
     if(!totals||totals.reserva!==b.reserve||totals.giro!==b.rotation)throw Error('LOTS_NOT_READY');
     const parts=allocateFEFO(list,{area:sourceArea,quantity:item.quantity,today});
     if(!parts)throw Error('LOTS_NOT_READY');
     for(const part of parts){
      const d=snap.docs.find(d=>d.id===part.id),v=d.data();
      lotUpdates.push({ref:d.ref,data:{[sourceArea]:round(v[sourceArea]-part.quantity),
       availableQuantity:round(v.reserva+v.giro-part.quantity),updatedAt:new Date()}});
      allocations.push({lot:v.lot,expiryDate:v.expiryDate,quantity:part.quantity});
     }
    }
    updates.push({ref:balanceRefs[i],data:{[sourceField]:round(b[sourceField]-item.quantity),
     total:round(b.total-item.quantity),...(Number.isFinite(b.countedTotal)?{
      exitsSinceCount:round((b.exitsSinceCount||0)+item.quantity)}:{}),
     lastProductionId:requestId,lastMovementAt:new Date()}});
    used.push({productId:item.productId,productName:p.name,quantity:item.quantity,
     unit:physicalUnit,location:sourceArea,substituted:!recipeData.lines.some(l=>l.productId===item.productId),
     lots:allocations});
   }
   const now=new Date();
   for(const x of lotUpdates)tx.update(x.ref,x.data);
   for(const x of updates)tx.update(x.ref,x.data);
   if(transformed){const b=outputBalanceDoc.data()||{reserve:0,rotation:0,total:0};tx.set(outputBalanceRef,{productId:recipeData.outputProductId,unit:outputUnit,rotation:b.rotation,reserve:round(b.reserve+portions),total:round(b.total+portions),...(Number.isFinite(b.countedTotal)?{entriesSinceCount:round((b.entriesSinceCount||0)+portions)}:{}),lastProductionId:requestId,lastMovementAt:now},{merge:true});}
   if(outputLotRef){const old=outputLotDoc.data()||{};tx.set(outputLotRef,{productId:recipeData.outputProductId,unit:outputUnit,lot:outputLot.trim(),expiryDate,reserva:round((old.reserva||0)+portions),giro:old.giro||0,availableQuantity:round((old.reserva||0)+(old.giro||0)+portions),updatedAt:now},{merge:true});}
   const record={recipeId,recipeName:recipeData.name,recipeVersion:recipeData.version,
    outputUnit,outputLot:outputLot.trim(),expiryDate,portions,items:used,outputProductId:recipeData.outputProductId||null,sourceArea:new Set(used.map(i=>i.location)).size===1?used[0].location:'mixed',destinationArea:transformed?'reserva':null,payloadHash,notes,actorUid:actor.uid,
    actorName:a.data().displayName||a.data().name||actor.name||actor.email||actor.uid,
    unitId:member.unitId,at:now};
   tx.create(ref,record);
   if(taskRef){const progress=progressAfterProduction(task.data(),portions);
    tx.update(taskRef,{...progress,...(progress.status==='completed'?{completedAt:now}:{}),completedBy:actor.uid,productionRunId:requestId});}
   signalUnitChange(tx,db,member.unitId);
   tx.create(db.collection('auditLogs').doc(),{event:'production.finished',unitId:member.unitId,
    operationId:requestId,actorUid:actor.uid,at:now,details:record});
  });
  return send(res,200,duplicate?'Produção já registrada.':'Produção registrada com os saldos atualizados.',{duplicate});
 }catch(e){
  if(e.message==='RECIPE_CYCLE')return send(res,409,'As fichas formam um ciclo de preparações. Revise as origens.');
  if(e.message==='RECIPE_GRAPH_LIMIT')return send(res,409,'Mais de cem fichas: revisão administrativa necessária.');
  const errors={UNAUTHENTICATED:[401,'Faça login.'],OUTPUT_LOT_REQUIRED:[409,'Informe lote e validade reais do preparo final.'],FORBIDDEN:[403,'Sem permissão.'],PRODUCT_NOT_FOUND:[409,'Produto da receita não está ativo.'],
   LEGACY_CUT:[409,'Alcatra genérica é cadastro legado; selecione bife ou cubos de alcatra com contagem própria.'],
   INVALID_UNIT_QUANTITY:[409,'Peças devem ser inteiras; revise a quantidade da ficha técnica.'],
   RECIPE_NOT_FOUND:[404,'Preparação não encontrada.'],MISSING_STOCK:[409,'Faça a contagem física antes de produzir.'],
   UNAUTHORIZED_SUBSTITUTE:[409,'Produto não autorizado nesta ficha técnica.'],
   INSUFFICIENT:[409,'Saldo insuficiente no local de origem ou unidade incompatível.'],
   LOTS_NOT_READY:[409,'Concilie os lotes do ingrediente antes de confirmar a produção.'],
   LOT_LIMIT:[409,'Há muitos lotes para baixa automática.'],CONFLICT:[409,'Identificador já utilizado.'],
   INVALID_OUTPUT:[409,'Produto final indisponível ou estoque sem unidade válida.'],
   INVALID_TRANSFORMATION:[409,'Revise as quantidades e unidades de transformação da ficha técnica.'],
   TASK_NOT_PENDING:[409,'Tarefa inexistente, já concluída ou incompatível com a preparação.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  console.error('Production:',e.message);return send(res,500,'Não foi possível registrar a produção.');
 }
}
