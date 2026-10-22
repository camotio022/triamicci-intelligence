import {validQuantity} from '../operations/logic.js';
import {signalUnitChange} from '../live-signal.js';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
const recipePattern=/^[a-z0-9-]{3,64}$/;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const formatDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const canPlan=role=>['admin','manager','submanager','cook'].includes(role);
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
    const unit=recipeDoc.data().outputUnit||'un';if(plannedQuantity!==null&&!validQuantity(plannedQuantity,{unit}))throw Error('INVALID_QUANTITY');
    const now=new Date();
    tx.create(taskRef,{recipeId,recipeName:recipeDoc.data().name,unit,plannedQuantity,status:'pending',day,unitId:m.unitId,createdBy:actor.uid,createdAt:now});
    signalUnitChange(tx,db,m.unitId);
    tx.create(db.collection('auditLogs').doc(),{event:'production.task_added',unitId:m.unitId,day,taskId:taskRef.id,recipeId,actorUid:actor.uid,at:now});
   });
   return send(res,200,'Preparação adicionada à lista do dia.',{taskId:taskRef.id});
  }
  return send(res,400,'Ação inválida.');
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  if(e.message==='INVALID_QUANTITY')return send(res,400,'Meta incompatível com a unidade da preparação.');
  if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
  if(e.message==='RECIPE_NOT_FOUND')return send(res,404,'Ficha técnica não disponível.');
  console.error('Production day list:',e.message);return send(res,500,'Não foi possível consultar ou atualizar a lista de produção.');
 }
}
