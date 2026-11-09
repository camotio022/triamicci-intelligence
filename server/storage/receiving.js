import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {sendQuotaError} from '../quota-error.js';
import {signalUnitChange} from '../live-signal.js';
import {isManagement} from '../permissions/v31-policy.js';
import {STOCK_UNITS} from '../operations/unit-engine.js';
import {createHash} from 'node:crypto';
const identity=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,60}$/.test(x);
const productId=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const amount=(x,u)=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<=1e8&&(!['un','porcao','pacote','duzia'].includes(u)||Number.isInteger(x));
const currentUnit=p=>[p.operationalUnitOverride,p.profile?.countUnit,p.operationalUnit,p.unit].find(u=>STOCK_UNITS.includes(u))||null;
const dateValid=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T12:00:00Z'));
const materialize=d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate?.()?.toISOString?.()||null,decidedAt:d.data().decidedAt?.toDate?.()?.toISOString?.()||null});
export default async function storageReceiving(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)return send(res,403,'Vínculo de unidade obrigatório.');
  const db=getDb(),root=db.collection('units').doc(m.unitId),receipts=root.collection('storageReceiptsV1'),{action}=req.body||{};
  if(action==='storageReceiptList'){
   const [recent,pending,orders]=await Promise.all([receipts.orderBy('createdAt','desc').limit(31).get(),receipts.where('status','==','pending').limit(101).get(),root.collection('purchaseOrdersV3').limit(101).get()]);
   if(pending.size>100||orders.size>100)return send(res,409,'Muitos registros: revisão de paginação necessária.');
   return send(res,200,'Recebimentos da nova operação.',{receipts:recent.docs.map(materialize),pending:pending.docs.map(materialize),orders:orders.docs.filter(x=>!['cancelled','received'].includes(x.data().status)).map(x=>({id:x.id,supplier:x.data().supplier,status:x.data().status,items:x.data().items||[]})),legacyExcluded:true});
  }
  const {requestId}=req.body||{};
  if(!identity(requestId))return send(res,400,'Identificador inválido.');
  const ref=receipts.doc(requestId);
  if(action==='storageReceiptInspect'){
   const {supplier='',orderId=null,lines=[],notes=''}=req.body||{};
   if(typeof supplier!=='string'||supplier.trim().length<2||supplier.length>100||!Array.isArray(lines)||!lines.length||lines.length>12||typeof notes!=='string'||notes.length>400||orderId!==null&&!identity(orderId)||!orderId&&notes.trim().length<8)return send(res,400,'Informe fornecedor, itens e justificativa quando não há pedido.');
   if(lines.some(x=>!x||!productId(x.productId)||!identity(x.storageId)||!STOCK_UNITS.includes(x.stockUnit)||!amount(x.stockQuantity,x.stockUnit)||typeof x.lot!=='string'||x.lot.length>80||typeof x.expiryDate!=='string'||x.expiryDate&&!dateValid(x.expiryDate)))return send(res,400,'Revise produtos, quantidades e validade.');
   let duplicate=false;
   await db.runTransaction(async tx=>{
    const [who,previous,...docs]=await tx.getAll(db.doc('memberships/'+actor.uid),ref,...lines.flatMap(l=>[root.collection('products').doc(l.productId),root.collection('storageLinksV1').doc(l.productId),root.collection('storageSpacesV1').doc(l.storageId)]),...(orderId?[root.collection('purchaseOrdersV3').doc(orderId)]:[]));
    if(who.data()?.status!=='active'||who.data()?.unitId!==m.unitId)throw Error('FORBIDDEN');
    if(previous.exists){if(previous.data().createdBy===actor.uid&&JSON.stringify(previous.data().lines.map(l=>[l.productId,l.storageId,l.stockQuantity,l.stockUnit]))===JSON.stringify(lines.map(l=>[l.productId,l.storageId,l.stockQuantity,l.stockUnit]))){duplicate=true;return;}throw Error('CONFLICT');}
    const order=orderId?docs.at(-1):null;
    if(orderId&&(!order?.exists||['cancelled','received'].includes(order.data().status)))throw Error('ORDER');
    const normalized=[],seen=new Set();
    for(let i=0;i<lines.length;i++){
     const l=lines[i],p=docs[i*3],link=docs[i*3+1],space=docs[i*3+2];
     if(!p.exists||p.data().status!=='active'||!link.exists||link.data().primaryStorageId!==l.storageId||!space.exists||space.data().active===false)throw Error('CONFIGURATION');
     if(currentUnit(p.data())!==l.stockUnit)throw Error('UNIT');
     if(p.data().trackExpiry&&(!l.lot.trim()||!dateValid(l.expiryDate)))throw Error('LOT');
     const unique=l.productId+'|'+l.lot+'|'+l.expiryDate;
     if(seen.has(unique))throw Error('DUPLICATE');seen.add(unique);
     const expected=order?.data()?.items?.find(item=>item.productId===l.productId);
     if(orderId&&!expected&&notes.trim().length<8)throw Error('ORDER');
     normalized.push({...l,productName:p.data().name});
    }
    const now=new Date();
    tx.create(ref,{unitId:m.unitId,supplier:supplier.trim(),orderId,lines:normalized,notes:notes.trim(),status:'pending',createdBy:actor.uid,createdAt:now});
    tx.create(db.collection('auditLogs').doc(),{event:'storage.receipt_inspected',unitId:m.unitId,receiptId:requestId,actorUid:actor.uid,at:now,lines:normalized.map(l=>({productId:l.productId,storageId:l.storageId,quantity:l.stockQuantity,unit:l.stockUnit}))});
    signalUnitChange(tx,db,m.unitId,['stock']);
   });
   return send(res,200,duplicate?'Recebimento já registrado.':'Recebimento registrado. A cozinha já pode preparar antes da aprovação.',{duplicate,receiptId:requestId,affectsBalance:false});
  }
  if(!['storageReceiptApprove','storageReceiptReject'].includes(action))return send(res,400,'Ação inválida.');
  const {reason=''}=req.body||{};
  if(action==='storageReceiptReject'&&(typeof reason!=='string'||reason.trim().length<8||reason.length>240))return send(res,400,'Justifique a recusa.');
  let outcome;
  await db.runTransaction(async tx=>{
   const [who,receipt]=await tx.getAll(db.doc('memberships/'+actor.uid),ref);
   if(who.data()?.status!=='active'||who.data()?.unitId!==m.unitId||!isManagement(who.data()?.role))throw Error('FORBIDDEN');
   if(!receipt.exists)throw Error('RECEIPT');
   if(receipt.data().status!=='pending')throw Error('CONFLICT');
   const status=action==='storageReceiptApprove'?'approved':'rejected',now=new Date();
   const allocations=await tx.getAll(...(receipt.data().lines||[]).map((l,i)=>root.collection('storageReceiptAllocationsV1').doc(createHash('sha256').update(requestId+'|'+i).digest('hex'))));
   const reconciliation=(receipt.data().lines||[]).map((l,i)=>({lineIndex:i,productId:l.productId,received:l.stockQuantity,prepared:allocations[i].data()?.allocatedQuantity||0,remaining:Math.round((l.stockQuantity-(allocations[i].data()?.allocatedQuantity||0))*1000)/1000,unit:l.stockUnit}));
   if(reconciliation.some(x=>x.remaining<0))throw Error('CONFLICT');
   const requiresReview=status==='rejected'&&reconciliation.some(x=>x.prepared>0);
   // A aprovação administrativa nunca soma novamente produtos que já foram contados ou preparados.
   tx.update(ref,{status,reason:reason.trim(),decidedBy:actor.uid,decidedAt:now,reconciliation,requiresReview});
   tx.create(db.collection('auditLogs').doc(),{event:'storage.receipt_'+status,unitId:m.unitId,receiptId:requestId,actorUid:actor.uid,at:now,reason:reason.trim()});
   signalUnitChange(tx,db,m.unitId,['stock']);
   outcome={status,requiresBalanceCount:status==='approved',affectsBalance:false,preparationsPreserved:true,requiresReview,reconciliation};
  });
  return send(res,200,action==='storageReceiptApprove'?'Entrega aprovada; valide a contagem para registrar o saldo.':'Entrega recusada; preparações existentes permanecem registradas para revisão gerencial.',{receipt:outcome});
 }catch(e){
  if(sendQuotaError(res,e))return;
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login novamente.');
  const messages={FORBIDDEN:[403,'Sem permissão.'],CONFLICT:[409,'O registro foi alterado; atualize.'],ORDER:[409,'Pedido inválido ou encerrado.'],CONFIGURATION:[409,'Configure o armazenamento principal de cada insumo antes do recebimento.'],UNIT:[409,'Unidade do insumo diferente da configurada.'],LOT:[400,'Informe lote e validade.'],DUPLICATE:[409,'Item repetido no recebimento.'],RECEIPT:[404,'Recebimento não encontrado.']};
  if(messages[e.message])return send(res,...messages[e.message]);
  console.error('Storage receiving:',e.message);return send(res,500,'Não foi possível processar o recebimento.');
 }
}
