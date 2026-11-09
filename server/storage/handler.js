import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {isManagement,TEAM_ROLES} from '../permissions/v31-policy.js';
import {validQuantity} from '../operations/logic.js';
import {STOCK_UNITS} from '../operations/unit-engine.js';
import {createHash} from 'node:crypto';
import {signalUnitChange} from '../live-signal.js';
import {STORAGE_TEMPLATES,STORAGE_ICONS,STORAGE_FREQUENCIES,validateStorage,scheduled,progress} from './storage-model.js';
import {sendQuotaError} from '../quota-error.js';

const idOk=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(x);
const productOk=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const dayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const countedUnit=p=>[p.operationalUnitOverride,p.operationalUnit,p.unit].find(u=>STOCK_UNITS.includes(u))||null;
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),member=await membership(actor.uid);
  if(!member?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const db=getDb(),root=db.collection('units').doc(member.unitId),spaces=root.collection('storageSpacesV1'),links=root.collection('storageLinksV1');
  const {action}=req.body||{};
  if(action==='storageList'){
   const today=dayKey();
   const [s,l,countsSnap]=await Promise.all([spaces.limit(81).get(),links.limit(201).get(),root.collection('storageCountsV1').where('day','==',today).limit(501).get()]);
   if(s.size>80||l.size>200||countsSnap.size>500)return send(res,409,'Limite inicial atingido; é necessário paginar.');
   const all=s.docs.map(d=>({id:d.id,...d.data(),updatedAt:d.data().updatedAt?.toDate?.()?.toISOString?.()||null}));
   const bindings=l.docs.map(d=>({productId:d.id,...d.data()}));
   const counts=countsSnap.docs.map(d=>({id:d.id,...d.data(),at:d.data().at?.toDate?.()?.toISOString?.()||null}));
   const active=new Set(bindings.map(l=>l.productId+'|'+l.primaryStorageId));
   const confirmed=counts.filter(x=>active.has(x.productId+'|'+x.storageId));
   return send(res,200,'Armazenamentos configurados.',{storages:all,links:bindings,counts:confirmed,templates:STORAGE_TEMPLATES,day:today,progress:all.map(s=>({id:s.id,...progress(bindings.filter(l=>l.primaryStorageId===s.id).length,confirmed.filter(c=>c.storageId===s.id).length),scheduled:scheduled(s,today)})),countingEnabled:true,countsAffectOfficialBalance:false});
  }
  if(action==='storageCount'){
   const {storageId,productId,quantity}=req.body||{};
   if(!idOk(storageId)||!productOk(productId))return send(res,400,'Armazenamento ou produto inválido.');
   const date=dayKey(),docId=createHash('sha256').update(date+'|'+storageId+'|'+productId).digest('hex');
   const countRef=root.collection('storageCountsV1').doc(docId);
   const storageRef=spaces.doc(storageId),linkRef=links.doc(productId),productRef=root.collection('products').doc(productId);
   let recorded;
   await db.runTransaction(async tx=>{
    const [who,storage,link,product,previous]=await tx.getAll(db.doc('memberships/'+actor.uid),storageRef,linkRef,productRef,countRef);
    if(who.data()?.status!=='active'||who.data()?.unitId!==member.unitId||!TEAM_ROLES.includes(who.data()?.role))throw Error('FORBIDDEN');
    if(!storage.exists||storage.data().active===false||link.data()?.primaryStorageId!==storageId||!product.exists||product.data().status!=='active')throw Error('STORAGE');
    const unit=countedUnit(product.data());
    if(!unit||!validQuantity(quantity,{unit,allowZero:true}))throw Error('QUANTITY');
    const now=new Date(),version=(previous.data()?.version||0)+1;
    tx.set(countRef,{day:date,storageId,productId,quantity,unit,version,actorUid:actor.uid,at:now,kind:'PHYSICAL_OBSERVATION',affectsOfficialBalance:false});
    tx.create(db.collection('auditLogs').doc(),{event:'storage.count_recorded',unitId:member.unitId,storageId,productId,actorUid:actor.uid,at:now,before:previous.data()?{quantity:previous.data().quantity,unit:previous.data().unit}:null,after:{quantity,unit,version}});
    signalUnitChange(tx,db,member.unitId,['stock']);
    recorded={day:date,storageId,productId,quantity,unit,version};
   });
   return send(res,200,'Conferência registrada para revisão gerencial. O saldo oficial não foi alterado.',{count:recorded});
  }
  if(!isManagement(member.role))return send(res,403,'Somente gestão pode configurar armazenamentos.');
  if(action==='storageSave'){
   const {storage={},storageId=null,expectedVersion=0}=req.body;
   if(storageId!==null&&!idOk(storageId)||!Number.isInteger(expectedVersion)||expectedVersion<0)return send(res,400,'Identificação ou versão inválida.');
   const problem=validateStorage(storage);
   if(problem)return send(res,400,problem);
   const name=storage.name.trim(),daySet=storage.frequency==='custom'?storage.weekdays.slice().sort():[];
   const ref=storageId?spaces.doc(storageId):spaces.doc();
   let result;
   await db.runTransaction(async tx=>{
    const [who,prior,existing]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref),tx.get(spaces.limit(81))]);
    if(who.data()?.status!=='active'||who.data()?.unitId!==member.unitId||!isManagement(who.data()?.role))throw Error('FORBIDDEN');
    if(existing.size>80)throw Error('LIMIT');
    const version=prior.exists?prior.data().version||0:0;
    if(version!==expectedVersion||Boolean(storageId)!==prior.exists)throw Error('CONFLICT');
    if(existing.docs.some(x=>x.id!==ref.id&&x.data().active!==false&&x.data().name.trim().toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw Error('DUPLICATE');
    const now=new Date();
    tx.set(ref,{name,icon:storage.icon,area:storage.area,frequency:storage.frequency,weekdays:daySet,active:true,version:version+1,updatedAt:now,updatedBy:actor.uid,...(!prior.exists?{createdAt:now,createdBy:actor.uid}:{})},{merge:true});
    tx.create(db.collection('auditLogs').doc(),{event:'storage.config_saved',unitId:member.unitId,actorUid:actor.uid,storageId:ref.id,at:now,before:prior.data()||null,after:{name,area:storage.area,icon:storage.icon,frequency:storage.frequency,weekdays:daySet}});
    signalUnitChange(tx,db,member.unitId,['stock','catalog']);
    result={id:ref.id,version:version+1};
   });
   return send(res,200,'Armazenamento salvo.',{storage:result});
  }
  if(action==='storageAssign'){
   const {storageId,productIds}=req.body;
   if(!idOk(storageId)||!Array.isArray(productIds)||productIds.length<1||productIds.length>60||productIds.some(x=>!productOk(x))||new Set(productIds).size!==productIds.length)return send(res,400,'Selecione até 60 insumos válidos.');
   const ref=spaces.doc(storageId);
   const result={assigned:0};
   await db.runTransaction(async tx=>{
    const [who,storage,...products]=await tx.getAll(db.doc('memberships/'+actor.uid),ref,...productIds.map(id=>root.collection('products').doc(id)));
    if(who.data()?.status!=='active'||who.data()?.unitId!==member.unitId||!isManagement(who.data()?.role))throw Error('FORBIDDEN');
    if(!storage.exists||storage.data().active===false)throw Error('STORAGE');
    if(products.some(p=>!p.exists||p.data().status!=='active'))throw Error('PRODUCT');
    const previous=await tx.getAll(...productIds.map(id=>links.doc(id)));
    const now=new Date();
    for(let i=0;i<productIds.length;i++){
     const id=productIds[i],old=previous[i].data()||{};
     tx.set(links.doc(id),{productId:id,primaryStorageId:storageId,allowedStorageIds:[...new Set([...(old.allowedStorageIds||[]),storageId])],updatedAt:now,updatedBy:actor.uid},{merge:true});
    }
    tx.create(db.collection('auditLogs').doc(),{event:'storage.products_assigned',unitId:member.unitId,actorUid:actor.uid,storageId,productIds,at:now});
    signalUnitChange(tx,db,member.unitId,['stock','catalog']);
    result.assigned=productIds.length;
   });
   return send(res,200,'Insumos vinculados ao armazenamento.',result);
  }
  return send(res,400,'Ação inválida.');
 }catch(e){
  if(sendQuotaError(res,e))return;
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login novamente.');
  const errors={FORBIDDEN:[403,'Acesso restrito à gestão.'],CONFLICT:[409,'Configuração alterada por outro usuário. Atualize e tente novamente.'],DUPLICATE:[409,'Já existe um armazenamento com esse nome.'],STORAGE:[409,'Armazenamento indisponível.'],PRODUCT:[409,'Um ou mais insumos estão indisponíveis.'],LIMIT:[409,'Limite inicial de armazenamentos atingido.'],QUANTITY:[400,'Quantidade ou unidade inválida.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  console.error('Storage spaces:',e.message);
  return send(res,500,'Não foi possível concluir a operação.');
 }
}
