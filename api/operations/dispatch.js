import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {countUnit,validQuantity} from './logic.js';

const idPattern=/^[a-f0-9]{40}$/;
const requestPattern=/^[a-f0-9-]{36}$/i;
const reasons=new Set(['consumption','loss','supplier_return','adjustment']);
const locations=new Set(['reserva','giro']);
const qtyRound=x=>Math.round(x*1000)/1000;

export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId||!['admin','manager'].includes(m.role))return send(res,403,'Somente gerente ou administrador pode registrar saídas e ajustes.');
  const {productId,requestId,quantity,location,reason,notes=''}=req.body||{};
  if(req.body?.action!=='dispatch'||!idPattern.test(productId||'')||
    !requestPattern.test(requestId||'')||!locations.has(location)||!reasons.has(reason)||
    !validQuantity(quantity)||typeof notes!=='string'||notes.length>240)
    return send(res,400,'Dados de saída inválidos.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId);
  const actorRef=db.doc('memberships/'+actor.uid);
  const productRef=unit.collection('products').doc(productId);
  const balanceRef=unit.collection('physicalBalances').doc(productId);
  const movementRef=unit.collection('physicalOutflows').doc(requestId);
  const auditRef=db.collection('auditLogs').doc();
  const now=new Date();
  let duplicate=false,lotAllocations=[];
  await db.runTransaction(async tx=>{
   const [member,product,balance,previous]=await Promise.all([
    tx.get(actorRef),tx.get(productRef),tx.get(balanceRef),tx.get(movementRef)
   ]);
   const a=member.data();
   if(!a||a.status!=='active'||a.unitId!==m.unitId||!['admin','manager'].includes(a.role))throw Error('FORBIDDEN');
   if(!product.exists)throw Error('NOT_FOUND');
   const p=product.data();if(p.status!=='active')throw Error('INACTIVE');
   if(previous.exists){
    const old=previous.data();
    if(old.actorUid!==actor.uid||old.productId!==productId||old.quantity!==quantity||
      old.reason!==reason||old.location!==location||old.notes!==notes)throw Error('CONFLICT');
    duplicate=true;return;
   }
   if(!balance.exists)throw Error('NOT_COUNTED');
   const central=p.catalogId?await tx.get(db.collection('productCatalog').doc(p.catalogId)):null;
   const unitName=countUnit(p,central?.data());
   const current=balance.data();
   if(current.unit!==unitName)throw Error('UNIT_CONFLICT');
   if(!validQuantity(quantity,{unit:unitName}))throw Error('INVALID');
   if(!validQuantity(current[location],{allowZero:true,unit:unitName})||quantity>current[location]||
     !validQuantity(current.total,{allowZero:true,unit:unitName})||quantity>current.total)throw Error('INSUFFICIENT');
   if(p.trackExpiry===true){
    // Quantidade disponível é homologada por lote; entradas legadas sem esse campo NÃO são presumidas disponíveis.
    const query=unit.collection('physicalLots').doc(productId).collection('lots')
      .orderBy('expiryDate','asc').limit(101);
    const lots=await tx.get(query);
    if(lots.size>100)throw Error('HISTORY_LIMIT');
    let remaining=quantity;
    const dateToday=now.toISOString().slice(0,10);
    for(const doc of lots.docs){
     const lot=doc.data();
     if(!Number.isFinite(lot.availableQuantity)||lot.availableQuantity<=0)continue;
     if(reason==='consumption'&&lot.expiryDate<dateToday)continue;
     const amount=Math.min(qtyRound(remaining),qtyRound(lot.availableQuantity));
     if(amount<=0)continue;
     lotAllocations.push({ref:doc.ref,id:doc.id,quantity:amount,lot:lot.lot,expiryDate:lot.expiryDate,
       remaining:qtyRound(lot.availableQuantity-amount)});
     remaining=qtyRound(remaining-amount);
     if(remaining<=0)break;
    }
    if(remaining>0)throw Error('LOTS_NOT_READY');
   }
   const nextReserve=qtyRound(current.reserve-(location==='reserva'?quantity:0));
   const nextRotation=qtyRound(current.rotation-(location==='giro'?quantity:0));
   const nextTotal=qtyRound(current.total-quantity);
   if(nextReserve<0||nextRotation<0||nextTotal<0)throw Error('INSUFFICIENT');
   for(const l of lotAllocations)tx.update(l.ref,{availableQuantity:l.remaining,updatedAt:now});
   tx.update(balanceRef,{reserve:nextReserve,rotation:nextRotation,total:nextTotal,
    lastMovementAt:now,lastOutflowId:requestId});
   const record={productId,productName:p.name,quantity,unit:unitName,location,reason,
    notes,actorUid:actor.uid,unitId:m.unitId,at:now,lots:lotAllocations.map(l=>({
     lotId:l.id,lot:l.lot,expiryDate:l.expiryDate,quantity:l.quantity
    }))};
   tx.create(movementRef,record);
   tx.create(auditRef,{event:'physical.dispatched',unitId:m.unitId,productId,operationId:requestId,
    actorUid:actor.uid,details:record,at:now});
  });
  return send(res,200,duplicate?'Saída já registrada.':'Saída física salva e estoque atualizado.',{duplicate});
 }catch(e){
  const errors={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem permissão.'],INVALID:[400,'Quantidade inválida.'],
   NOT_FOUND:[404,'Produto não encontrado.'],INACTIVE:[409,'Produto inativo.'],
   NOT_COUNTED:[409,'Faça a primeira contagem física antes de registrar saída.'],
   UNIT_CONFLICT:[409,'Unidade física diverge do catálogo; revisão necessária.'],
   INSUFFICIENT:[409,'Quantidade superior ao saldo disponível na área selecionada.'],
   LOTS_NOT_READY:[409,'Os saldos por lote não foram conferidos ou não cobrem esta saída. Regularize os lotes antes de baixar.'],
   HISTORY_LIMIT:[409,'Há mais de 100 lotes: requer conferência administrativa antes de baixa.'],
   CONFLICT:[409,'Identificador já usado com dados diferentes.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  console.error('Dispatch:',e.message);return send(res,500,'Não foi possível registrar saída.');
 }
}
