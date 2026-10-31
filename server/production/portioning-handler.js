import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {sendQuotaError} from '../quota-error.js';
import {signalUnitChange} from '../live-signal.js';
import {isOperationalProduct} from '../operations/catalog-identity.js';
import {countUnit,validQuantity} from '../operations/logic.js';
import {progressAfterProduction} from './daily-task.js';
const round=x=>Math.round(x*1000)/1000;
const manager=m=>['admin','manager','submanager'].includes(m?.role);
const stamp=s=>s.updateTime?`${s.updateTime.seconds}:${s.updateTime.nanoseconds}`:null;
export function portionStatus(balance,state,area,basis){
 const total=balance?.[area==='reserva'?'reserve':'rotation'];
 if(!Number.isFinite(total)||total<0)return {ready:false,reason:'Faça uma contagem física válida antes de porcionar.'};
 if(state&&(state.basis!==basis||state.unit!==balance.unit||!Number.isFinite(state.weight)||state.weight<0||state.weight>total))return {ready:false,reason:'O estoque mudou. A gestão precisa conferir quanto continua porcionado neste local.',total,unit:balance.unit};
 const weight=state?.weight||0;return {ready:true,total,unit:balance.unit,portionedWeight:weight,unmarkedWeight:round(total-weight)};
}
export default async function portioningHandler(req,res){
 if(!checkRequest(req,res))return;res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);if(!m?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const {action,recipeId,requestId,portions,notes='',taskId=null,portionedWeight,expectedBasis}=req.body;
  if(typeof recipeId!=='string'||!/^[a-z0-9-]{3,64}$/.test(recipeId))return send(res,400,'Preparação inválida.');
  const db=getDb(),root=db.collection('units').doc(m.unitId),recipeRef=root.collection('productionRecipes').doc(recipeId);
  if(action!=='portionStatus'&&(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(requestId)||typeof notes!=='string'||notes.length>240||taskId!==null&&(typeof taskId!=='string'||!/^[A-Za-z0-9]{20}$/.test(taskId))))return send(res,400,'Registro inválido.');
  if(action==='finishPortioning'&&(!Number.isInteger(portions)||portions<1||portions>10000))return send(res,400,'Informe uma quantidade inteira de porções.');
  if(action==='reconcilePortioning'&&(!manager(m)||!validQuantity(portionedWeight,{allowZero:true})||typeof expectedBasis!=='string'))return send(res,403,'A gestão deve conferir o peso porcionado.');
  let result,duplicate=false;
  const recordRef=action==='reconcilePortioning'?root.collection('portioningReviews').doc(requestId):action==='finishPortioning'?root.collection('productionRuns').doc(requestId):null;
  const hash=createHash('sha256').update(JSON.stringify({action,recipeId,portions:portions??null,portionedWeight:portionedWeight??null,expectedBasis:expectedBasis??null,notes,taskId})).digest('hex');
  await db.runTransaction(async tx=>{
   duplicate=false;
   const [a,r,existing]=await tx.getAll(db.doc('memberships/'+actor.uid),recipeRef,...(recordRef?[recordRef]:[]));
   if(!a.exists||a.data().status!=='active'||a.data().unitId!==m.unitId||!['admin','manager','submanager','cook','auxiliar'].includes(a.data().role))throw Error('FORBIDDEN');
   if(action==='reconcilePortioning'&&!manager(a.data()))throw Error('FORBIDDEN');
   if(existing?.exists){if(existing.data().payloadHash!==hash||existing.data().actorUid!==actor.uid)throw Error('CONFLICT');duplicate=true;return;}
   const recipe=r.data(),cfg=recipe?.preparationConfig;
   if(!r.exists||recipe.active!==true||recipe.stockEffect!=='portion_same_product'||!cfg||cfg.sourceProductId!==cfg.outputProductId)throw Error('RECIPE');
   const productId=cfg.sourceProductId,area=cfg.location,pRef=root.collection('products').doc(productId),bRef=root.collection('physicalBalances').doc(productId),sRef=root.collection('portioningState').doc(productId+'-'+area);
   const [product,balance,state]=await tx.getAll(pRef,bRef,sRef);
   if(!product.exists||!isOperationalProduct(product.data())||!balance.exists||!['reserva','giro'].includes(area))throw Error('STOCK');
   const central=product.data().catalogId?await tx.get(db.collection('productCatalog').doc(product.data().catalogId)):null;
   const unit=countUnit(product.data(),central?.data()),basis=stamp(balance);
   if(balance.data().unit!==unit||recipe.stockUnit!==unit||!['kg','g'].includes(unit)||!validQuantity(recipe.portionSize,{unit}))throw Error('UNIT');
   const status=portionStatus(balance.data(),state.data(),area,basis);result={...status,basis,location:area};
   if(action==='portionStatus')return;
   const now=new Date();
   if(action==='reconcilePortioning'){
    const total=balance.data()[area==='reserva'?'reserve':'rotation'];
    if(expectedBasis!==basis||!Number.isFinite(total)||portionedWeight>total||!validQuantity(portionedWeight,{allowZero:true,unit}))throw Error('CONFLICT');
    tx.set(sRef,{productId,location:area,unit,basis,weight:portionedWeight,updatedAt:now,reviewedBy:actor.uid});
    tx.create(recordRef,{actorUid:actor.uid,payloadHash:hash,productId,location:area,unit,portionedWeight,at:now});
   }else{
    if(!status.ready)throw Error('REVIEW');
    const weight=round(portions*recipe.portionSize);if(!validQuantity(weight,{unit})||weight>status.unmarkedWeight)throw Error('INSUFFICIENT');
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(now),taskRef=taskId?root.collection('productionDays').doc(today).collection('tasks').doc(taskId):null,task=taskRef?await tx.get(taskRef):null;
    if(taskRef&&(!task.exists||task.data().recipeId!==recipeId||!['pending','partial'].includes(task.data().status)))throw Error('TASK');
    tx.set(sRef,{productId,location:area,unit,basis,weight:round(status.portionedWeight+weight),updatedAt:now,lastRunId:requestId},{merge:true});
    tx.create(recordRef,{recipeId,recipeName:recipe.name,recipeVersion:recipe.version,stockEffect:'portion_same_product',outputUnit:'porcao',portions,portionWeight:cfg.portionWeight,weightUnit:cfg.weightUnit,portionedWeight:weight,stockUnit:unit,productId,sourceArea:area,destinationArea:area,items:[],notes,actorUid:actor.uid,actorName:a.data().displayName||a.data().name||actor.name||actor.uid,payloadHash:hash,unitId:m.unitId,at:now});
    if(taskRef)tx.update(taskRef,{...progressAfterProduction(task.data(),portions),productionRunId:requestId,completedBy:actor.uid});
   }
   signalUnitChange(tx,db,m.unitId,['production','stock']);tx.create(db.collection('auditLogs').doc(),{event:action==='reconcilePortioning'?'production.portioning_reviewed':'production.portioned',unitId:m.unitId,recipeId,operationId:requestId,actorUid:actor.uid,at:now});
  });
  return send(res,200,action==='portionStatus'?'Porcionamento consultado.':duplicate?'Registro já processado.':action==='reconcilePortioning'?'Peso porcionado conferido. O saldo total foi preservado.':'Porcionamento registrado. O saldo total foi preservado.',{...result,duplicate});
 }catch(e){const map={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem permissão.'],CONFLICT:[409,'O registro ou o estoque mudou. Atualize antes de confirmar.'],RECIPE:[409,'Preparação indisponível para porcionamento do mesmo insumo.'],STOCK:[409,'Faça a contagem física antes de porcionar.'],UNIT:[409,'A unidade do estoque mudou. Revise a configuração.'],REVIEW:[409,'A gestão precisa conferir o peso já porcionado após a mudança de estoque.'],INSUFFICIENT:[409,'Quantidade maior que o saldo ainda não marcado como porcionado.'],TASK:[409,'Tarefa indisponível para esta preparação.']};if(map[e.message])return send(res,...map[e.message]);if(sendQuotaError(res,e))return;console.error('Portioning:',e.message);return send(res,500,'Não foi possível registrar o porcionamento.');}
}
