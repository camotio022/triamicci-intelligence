import {signalUnitChange} from '../live-signal.js';
import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {countUnit,validQuantity} from './logic.js';

const idPattern=/^[a-f0-9]{40}$/;
const reqPattern=/^[a-f0-9-]{36}$/i;
const keyFor=(lot,expiryDate)=>createHash('sha256').update(lot+'|'+expiryDate).digest('hex');
const round=x=>Math.round(x*1000)/1000;
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId||m.role!=='admin')return send(res,403,'Somente administrador pode conciliar lotes.');
  const {action,productId,requestId,lots}=req.body||{};
  if(action!=='reconcile'||!idPattern.test(productId||'')||!reqPattern.test(requestId||'')||
     !Array.isArray(lots)||lots.length<1||lots.length>80)
   return send(res,400,'Confira os dados da conciliação.');
  const items=lots.map(l=>({...l,lot:typeof l.lot==='string'?l.lot.trim():''}));
  for(const l of items){
   if(l.lot.length<1||l.lot.length>80||typeof l.expiryDate!=='string'||
      !/^\d{4}-\d{2}-\d{2}$/.test(l.expiryDate)||
      !Number.isFinite(Date.parse(l.expiryDate+'T12:00:00Z'))||
      new Date(l.expiryDate+'T12:00:00Z').toISOString().slice(0,10)!==l.expiryDate||
      !validQuantity(l.reserva,{allowZero:true})||!validQuantity(l.giro,{allowZero:true}))
     return send(res,400,'Lote, data ou quantidades inválidas.');
  }
  const keys=items.map(l=>keyFor(l.lot,l.expiryDate));
  if(new Set(keys).size!==keys.length)return send(res,400,'Lotes duplicados.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId);
  const productRef=unit.collection('products').doc(productId);
  const balanceRef=unit.collection('physicalBalances').doc(productId);
  const actorRef=db.doc('memberships/'+actor.uid);
  const ref=unit.collection('physicalLotReconciliations').doc(requestId);
  const col=unit.collection('physicalLots').doc(productId).collection('lots');
  const payloadHash=createHash('sha256').update(JSON.stringify(items)).digest('hex');
  let duplicate=false;
  await db.runTransaction(async tx=>{
   const [a,p,b,prev,existingLots]=await Promise.all([
    tx.get(actorRef),tx.get(productRef),tx.get(balanceRef),tx.get(ref),
    tx.get(col.orderBy('expiryDate').limit(101))
   ]);
   if(!a.exists||a.data().status!=='active'||a.data().role!=='admin'||a.data().unitId!==m.unitId)throw Error('FORBIDDEN');
   if(!p.exists||!p.data().trackExpiry)throw Error('INVALID');
   if(!b.exists)throw Error('NOT_COUNTED');
   if(prev.exists){
    if(prev.data().actorUid!==actor.uid||prev.data().payloadHash!==payloadHash)throw Error('CONFLICT');
    duplicate=true;return;
   }
   if(existingLots.size>100)throw Error('LIMIT');
   const central=p.data().catalogId?await tx.get(db.collection('productCatalog').doc(p.data().catalogId)):null;
   const unitName=countUnit(p.data(),central?.data());
   if(b.data().unit!==unitName)throw Error('UNIT_CONFLICT');
   for(const l of items){
    if(!validQuantity(l.reserva,{allowZero:true,unit:unitName})||
       !validQuantity(l.giro,{allowZero:true,unit:unitName}))throw Error('INVALID');
   }
   const expected=new Set(existingLots.docs.map(d=>d.id));
   if([...expected].some(key=>!keys.includes(key)))throw Error('INCOMPLETE');
   const sumReserva=round(items.reduce((n,l)=>n+l.reserva,0));
   const sumGiro=round(items.reduce((n,l)=>n+l.giro,0));
   if(sumReserva!==b.data().reserve||sumGiro!==b.data().rotation)throw Error('TOTAL_MISMATCH');
   const old=new Map(existingLots.docs.map(d=>[d.id,d.data()]));
   const now=new Date();
   for(let i=0;i<items.length;i++){
    const l=items[i],key=keys[i],previous=old.get(key);
    const data={lot:l.lot,expiryDate:l.expiryDate,productId,productName:p.data().name,
     unit:unitName,reserva:l.reserva,giro:l.giro,availableQuantity:round(l.reserva+l.giro),
     receivedQuantity:previous?.receivedQuantity||0,updatedAt:now,verifiedAt:now,verifiedBy:actor.uid};
    tx.set(col.doc(key),data,{merge:true});
   }
   tx.create(ref,{productId,actorUid:actor.uid,unitId:m.unitId,payloadHash,at:now,
     before:existingLots.docs.map(d=>({id:d.id,reserva:d.data().reserva??null,giro:d.data().giro??null})),
     after:items,reason:'physical_lot_reconciliation'});
   signalUnitChange(tx,db,m.unitId);
   tx.create(db.collection('auditLogs').doc(),{event:'physical.lots_reconciled',
    productId,actorUid:actor.uid,unitId:m.unitId,operationId:requestId,at:now});
  });
  return send(res,200,duplicate?'Conciliação já realizada.':'Lotes conciliados com a última contagem física.',{duplicate});
 }catch(e){
  const errors={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem permissão.'],INVALID:[400,'Dados inválidos.'],
   NOT_COUNTED:[409,'Registre a contagem física antes de conciliar lotes.'],CONFLICT:[409,'Identificador utilizado anteriormente.'],
   LIMIT:[409,'Mais de 100 lotes: regularização exige processo específico.'],
   INCOMPLETE:[409,'Todos os lotes previamente cadastrados devem ser incluídos, mesmo com saldo zero.'],
   TOTAL_MISMATCH:[409,'A soma dos lotes deve coincidir com reserva e giro da última contagem.'],
   UNIT_CONFLICT:[409,'Unidade de contagem diverge do catálogo.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  console.error('Lot reconciliation:',e.message);return send(res,500,'Não foi possível conciliar lotes.');
 }
}
