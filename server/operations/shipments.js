import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {signalUnitChange} from '../live-signal.js';
import {operationalBalance,writeOperationalBalance} from './shared-balance.js';
import {validQuantity} from './logic.js';
const manager=r=>['admin','manager','submanager'].includes(r);
const id=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x);
const product=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
export default async function shipments(req,res){
 if(!checkRequest(req,res))return;res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),{action,requestId,orderId=null,lines=[],supplier='',notes='',reason=''}=req.body||{};
  const collection=unit.collection('receiptShipments');
  if(action==='shipmentsList'){
   const before=req.body.before;
   if(before!==undefined&&!id(before))return send(res,400,'Cursor inválido.');
   let query=collection.orderBy('createdAt','desc').orderBy('__name__','desc');
   if(before){const cursor=await collection.doc(before).get();if(!cursor.exists)return send(res,400,'Cursor indisponível.');query=query.startAfter(cursor);}
   const snap=await query.limit(21).get();
   return send(res,200,'Conferências de entregas.',{shipments:snap.docs.slice(0,20).map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate?.()?.toISOString?.(),decidedAt:d.data().decidedAt?.toDate?.()?.toISOString?.()||null})),hasMore:snap.size>20,nextCursor:snap.size>20?snap.docs[19].id:null});
  }
  if(!id(requestId)||!['shipmentInspect','shipmentApprove','shipmentReject'].includes(action))return send(res,400,'Conferência inválida.');
  if(action!=='shipmentInspect'&&!manager(m.role))return send(res,403,'Revisão reservada à gestão.');
  if(action==='shipmentInspect'&&(!Array.isArray(lines)||!lines.length||lines.length>20||orderId!==null&&!id(orderId)||typeof supplier!=='string'||supplier.trim().length<2||supplier.length>100||typeof notes!=='string'||notes.length>400||!orderId&&notes.trim().length<8))return send(res,400,'Informe fornecedor, itens e justificativa para entrega não prevista.');
  if(action==='shipmentReject'&&(typeof reason!=='string'||reason.trim().length<8||reason.length>400))return send(res,400,'Informe a justificativa da recusa.');
  if(action==='shipmentInspect'&&lines.some(l=>!l||!product(l.productId)||!['reserva','giro'].includes(l.location)||!validQuantity(l.commercialQuantity,{unit:l.commercialUnit})||typeof l.stockQuantity!=='number'||!Number.isFinite(l.stockQuantity)||l.stockQuantity<0||typeof l.lot!=='string'||l.lot.length>80||typeof l.expiryDate!=='string'))return send(res,400,'Revise as quantidades, os locais e os campos informados.');
  let duplicate=false;
  await db.runTransaction(async tx=>{
   const ref=collection.doc(requestId),[account,previous]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(ref)]);
   if(!account.exists||account.data().status!=='active'||account.data().unitId!==m.unitId||action!=='shipmentInspect'&&!manager(account.data().role))throw Error('FORBIDDEN');
   if(action==='shipmentInspect'&&previous.exists){if(previous.data().fingerprint!==hash({orderId,lines,supplier:supplier.trim(),notes:notes.trim()})||previous.data().createdBy!==actor.uid)throw Error('CONFLICT');duplicate=true;return;}
   if(action!=='shipmentInspect'&&!previous.exists)throw Error('NOT_FOUND');
   if(action!=='shipmentInspect'&&previous.data().status!=='pending'){
    if(previous.data().status===(action==='shipmentApprove'?'approved':'rejected')){duplicate=true;return;}
    throw Error('CONFLICT');
   }
   if(action==='shipmentReject'){const at=new Date();tx.update(ref,{status:'rejected',reason:reason.trim(),decidedBy:actor.uid,decidedAt:at});signalUnitChange(tx,db,m.unitId);tx.create(db.collection('auditLogs').doc(),{event:action,shipmentId:requestId,unitId:m.unitId,actorUid:actor.uid,at});return;}
   const data=action==='shipmentInspect'?{orderId,lines,supplier:supplier.trim(),notes:notes.trim()}:previous.data();
   const ids=[...new Set(data.lines.map(l=>l.productId))];
   const orderRef=data.orderId?unit.collection('purchaseOrdersV3').doc(data.orderId):null;
   const [order,...snapshots]=await Promise.all([orderRef?tx.get(orderRef):Promise.resolve(null),...ids.map(p=>tx.get(unit.collection('products').doc(p))),...ids.map(p=>tx.get(unit.collection('operationalProfiles').doc(p))),...ids.map(p=>operationalBalance(tx,unit.collection('physicalBalances').doc(p)))]);
   if(orderRef&&(!order.exists||['cancelled','received'].includes(order.data().status)))throw Error('ORDER');
   const products=new Map(ids.map((p,i)=>[p,snapshots[i]])),profiles=new Map(ids.map((p,i)=>[p,snapshots[ids.length+i]])),balances=new Map(ids.map((p,i)=>[p,snapshots[2*ids.length+i]]));
   const totals=new Map(),stock=new Map(),lotUpdates=new Map(),normalized=[];
   const keys=new Set();
   for(const line of data.lines){
    const p=products.get(line.productId),profile=profiles.get(line.productId);
    if(!p?.exists||p.data().status!=='active'||!profile?.exists||!['supplier','both'].includes(profile.data().origin))throw Error('PRODUCT');
    const cfg=profile.data(),quantitative=cfg.controlMode==='quantitative';
    if(!['kg','g','L','ml','mL','un','porcao','pacote','duzia'].includes(line.commercialUnit)||!validQuantity(line.commercialQuantity,{unit:line.commercialUnit})||quantitative&&(!cfg.locations.includes(line.location)||!validQuantity(line.stockQuantity,{unit:cfg.countUnit}))||!quantitative&&line.stockQuantity!==0)throw Error('QUANTITY');
    const expected=order?.data()?.items.find(x=>x.productId===line.productId);
    if(orderRef&&(!expected||expected.unit!==line.commercialUnit))throw Error('ORDER');
    const commercial=(totals.get(line.productId)||0)+line.commercialQuantity;totals.set(line.productId,commercial);
    if(expected&&commercial>expected.quantity-(order.data().received?.[line.productId]||0)&&data.notes.trim().length<8)throw Error('DIVERGENCE');
    if(p.data().lotTrackingMode==='per_lot'&&(!line.lot.trim()||!date(line.expiryDate)||line.expiryDate<day()))throw Error('LOT');
    const key=line.productId+'|'+line.location+'|'+line.lot+'|'+line.expiryDate;if(keys.has(key))throw Error('DUPLICATE_LINE');keys.add(key);
    const balance=balances.get(line.productId).data()||{unit:cfg.countUnit,reserva:0,giro:0,total:0};
    if(quantitative&&balance.unit!==cfg.countUnit)throw Error('UNIT');
    if(quantitative){
     const accumulated=stock.get(line.productId)||{...balance};
     accumulated[line.location]=Math.round(((accumulated[line.location]||0)+line.stockQuantity)*1000)/1000;accumulated.total=Math.round((accumulated.total+line.stockQuantity)*1000)/1000;stock.set(line.productId,accumulated);
     if(p.data().lotTrackingMode==='per_lot'){
      const lotRef=unit.collection('physicalLots').doc(line.productId).collection('lots').doc(createHash('sha256').update(line.lot.trim()+'|'+line.expiryDate).digest('hex'));
      let change=lotUpdates.get(lotRef.path);
      if(!change){const old=await tx.get(lotRef);if(old.exists&&old.data().unit!==cfg.countUnit)throw Error('UNIT');change={ref:lotRef,data:{...(old.data()||{}),productId:line.productId,lot:line.lot.trim(),expiryDate:line.expiryDate,unit:cfg.countUnit,reserva:old.data()?.reserva||0,giro:old.data()?.giro||0}};}
      change.data[line.location]=Math.round((change.data[line.location]+line.stockQuantity)*1000)/1000;change.data.availableQuantity=change.data.reserva+change.data.giro;lotUpdates.set(lotRef.path,change);
     }
    }
    normalized.push({...line,productName:p.data().name,stockUnit:quantitative?cfg.countUnit:null});
   }
   const now=new Date();
   if(action==='shipmentInspect')tx.create(ref,{...data,lines:normalized,supplier:order?.data()?.supplier||data.supplier,status:'pending',fingerprint:hash({orderId,lines,supplier:supplier.trim(),notes:notes.trim()}),createdBy:actor.uid,createdAt:now,unitId:m.unitId});
   else if(action==='shipmentReject')tx.update(ref,{status:'rejected',reason:reason.trim(),decidedBy:actor.uid,decidedAt:now});
   else{
    for(const [p,b] of stock)writeOperationalBalance(tx,unit.collection('physicalBalances').doc(p),{...b,updatedAt:now,quality:'ESTIMATED_BY_MOVEMENTS'},{},balances.get(p).data()||{});
    for(const change of lotUpdates.values())tx.set(change.ref,{...change.data,updatedAt:now},{merge:true});
    for(const [i,line] of normalized.entries())if(line.stockUnit)tx.create(unit.collection('physicalReceipts').doc(requestId+'_'+i),{productId:line.productId,productName:line.productName,physicalQuantity:line.stockQuantity,unit:line.stockUnit,location:line.location,lot:line.lot,expiryDate:line.expiryDate,supplier:data.supplier,orderId:data.orderId,shipmentId:requestId,commercialQuantity:line.commercialQuantity,commercialUnit:line.commercialUnit,actorUid:actor.uid,unitId:m.unitId,at:now});
    if(orderRef){const received={...(order.data().received||{})};for(const [p,q] of totals)received[p]=Math.round(((received[p]||0)+q)*1000)/1000;tx.update(orderRef,{received,status:order.data().items.every(i=>(received[i.productId]||0)>=i.quantity)?'received':'partially_received',updatedAt:now});}
    tx.update(ref,{status:'approved',decidedBy:actor.uid,decidedAt:now});
   }
   signalUnitChange(tx,db,m.unitId);tx.create(db.collection('auditLogs').doc(),{event:action,shipmentId:requestId,unitId:m.unitId,actorUid:actor.uid,at:now});
  });
  return send(res,200,duplicate?'Conferência já processada.':action==='shipmentInspect'?'Conferência enviada para aprovação.':action==='shipmentApprove'?'Entrega aprovada e estoque atualizado.':'Entrega recusada sem alterar o estoque.',{duplicate});
 }catch(e){const messages={UNAUTHENTICATED:'Faça login.',FORBIDDEN:'Sem permissão.',NOT_FOUND:'Conferência indisponível.',CONFLICT:'A conferência mudou. Atualize antes de decidir.',ORDER:'Pedido encerrado, item ou unidade incompatível.',PRODUCT:'Produto ou perfil indisponível.',QUANTITY:'Quantidade ou local incompatível.',DIVERGENCE:'Justifique quantidades acima do pedido.',LOT:'Informe lote e validade reais.',UNIT:'Unidades de saldo e configuração divergem.',DUPLICATE_LINE:'Não repita o mesmo produto/local/lote.'};if(messages[e.message])return send(res,e.message==='UNAUTHENTICATED'?401:e.message==='FORBIDDEN'?403:409,messages[e.message]);console.error('Shipments:',e.message);return send(res,500,'Não foi possível processar a entrega.');}
}
