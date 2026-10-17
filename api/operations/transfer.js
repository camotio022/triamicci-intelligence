import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {countUnit,validQuantity} from './logic.js';

const idPattern=/^[a-f0-9]{40}$/;
const reqPattern=/^[a-f0-9-]{36}$/i;
const round=x=>Math.round(x*1000)/1000;
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId||!['admin','manager'].includes(m.role))return send(res,403,'Somente administração pode transferir estoque.');
  const {action,productId,requestId,from,to,quantity,notes=''}=req.body||{};
  if(action!=='transfer'||!idPattern.test(productId||'')||!reqPattern.test(requestId||'')||
    !['reserva','giro'].includes(from)||!['reserva','giro'].includes(to)||from===to||
    !validQuantity(quantity)||typeof notes!=='string'||notes.length>240)
   return send(res,400,'Dados da transferência inválidos.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId);
  const memberRef=db.doc('memberships/'+actor.uid),pRef=unit.collection('products').doc(productId);
  const bRef=unit.collection('physicalBalances').doc(productId);
  const opRef=unit.collection('physicalTransfers').doc(requestId);
  let duplicate=false;
  await db.runTransaction(async tx=>{
   const [member,product,balance,previous]=await Promise.all([tx.get(memberRef),tx.get(pRef),tx.get(bRef),tx.get(opRef)]);
   const a=member.data();
   if(!a||a.status!=='active'||a.unitId!==m.unitId||!['admin','manager'].includes(a.role))throw Error('FORBIDDEN');
   if(!product.exists)throw Error('NOT_FOUND');
   const p=product.data();
   if(p.status!=='active')throw Error('INACTIVE');
   if(previous.exists){
    const old=previous.data();
    if(old.actorUid!==actor.uid||old.productId!==productId||old.quantity!==quantity||
      old.from!==from||old.to!==to||old.notes!==notes)throw Error('CONFLICT');
    duplicate=true;return;
   }
   if(!balance.exists)throw Error('NOT_COUNTED');
   const central=p.catalogId?await tx.get(db.collection('productCatalog').doc(p.catalogId)):null;
   const unitName=countUnit(p,central?.data());
   const b=balance.data();
   if(b.unit!==unitName)throw Error('UNIT_CONFLICT');
   if(!validQuantity(quantity,{unit:unitName})||b[from]<quantity)throw Error('INSUFFICIENT');
   const allocations=[];
   let lotSnapshots;
   if(p.trackExpiry){
    const lotRef=unit.collection('physicalLots').doc(productId).collection('lots');
    lotSnapshots=await tx.get(lotRef.orderBy('expiryDate').limit(101));
    if(lotSnapshots.size>100)throw Error('LIMIT');
    const list=lotSnapshots.docs.map(d=>({ref:d.ref,...d.data()}));
    if(round(list.reduce((n,l)=>n+(Number.isFinite(l.reserva)?l.reserva:0),0))!==b.reserve||
       round(list.reduce((n,l)=>n+(Number.isFinite(l.giro)?l.giro:0),0))!==b.rotation)throw Error('LOTS_NOT_READY');
    let remaining=quantity;
    for(const lot of list){
     const available=lot[from]||0;
     if(!Number.isFinite(available)||available<=0)continue;
     // Não transferir lote vencido para giro.
     if(to==='giro'&&lot.expiryDate<new Date().toISOString().slice(0,10))continue;
     const part=round(Math.min(available,remaining));
     allocations.push({ref:lot.ref,lot:lot.lot,expiryDate:lot.expiryDate,quantity:part,
       fromAfter:round(available-part),toAfter:round((lot[to]||0)+part)});
     remaining=round(remaining-part);
     if(remaining<=0)break;
    }
    if(remaining>0)throw Error('LOTS_NOT_READY');
   }
   const now=new Date();
   for(const l of allocations)tx.update(l.ref,{[from]:l.fromAfter,[to]:l.toAfter,updatedAt:now});
   tx.update(bRef,{[from]:round(b[from]-quantity),[to]:round(b[to]+quantity),
     lastMovementAt:now,lastTransferId:requestId});
   const entry={productId,productName:p.name,from,to,quantity,unit:unitName,notes,
    actorUid:actor.uid,unitId:m.unitId,at:now,
    lots:allocations.map(({lot,expiryDate,quantity})=>({lot,expiryDate,quantity}))};
   tx.create(opRef,entry);
   tx.create(db.collection('auditLogs').doc(),{event:'physical.transferred',productId,
    unitId:m.unitId,actorUid:actor.uid,operationId:requestId,details:entry,at:now});
  });
  return send(res,200,duplicate?'Transferência já registrada.':'Transferência registrada.',{duplicate});
 }catch(e){
  const err={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem permissão.'],
   NOT_FOUND:[404,'Produto não encontrado.'],INACTIVE:[409,'Produto inativo.'],
   NOT_COUNTED:[409,'Faça a primeira contagem física.'],
   UNIT_CONFLICT:[409,'Unidade física precisa ser revista.'],
   INSUFFICIENT:[409,'Quantidade superior ao saldo disponível na área.'],
   LOTS_NOT_READY:[409,'Concilie os saldos por lote antes de transferir.'],
   LIMIT:[409,'Há muitos lotes para transferência automática.'],
   CONFLICT:[409,'Identificador repetido com dados diferentes.']};
  if(err[e.message])return send(res,...err[e.message]);
  console.error('Transfer:',e.message);return send(res,500,'Não foi possível transferir.');
 }
}
