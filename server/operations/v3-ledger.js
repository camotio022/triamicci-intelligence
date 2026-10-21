// Novo ledger isolado: não mistura os saldos legados nem converte kg em porções.
import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {MANAGEMENT_ROLES,TEAM_ROLES} from '../permissions/v31-policy.js';
const idOk=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const reqOk=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
const locations=['reserva','giro'];
const number=(v,unit,zero=false)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&(zero||v>0)&&v<=100000&&(!['un','porcao','pacote','duzia'].includes(unit)||Number.isInteger(v))&&Math.abs(Math.round(v*1000)-v*1000)<1e-7;
const round=v=>Math.round(v*1000)/1000;
const isoDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const active=(d,u,roles)=>d.exists&&d.data().status==='active'&&d.data().unitId===u&&roles.includes(d.data().role);
const hashed=s=>createHash('sha256').update(s).digest('hex');
const snapMap=s=>({id:s.id,...s.data()});
const now=()=>new Date();
const audit=(tx,db,event,unitId,uid,details)=>tx.create(db.collection('auditLogs').doc(),{event,unitId,actorUid:uid,at:now(),details});
function debitLotDocs(docs,location,amount,today){
 let remaining=amount,updates=[];
 for(const d of docs){
  const l=d.data(),value=l[location]||0;
  if(l.expiryDate<today||value<=0)continue;
  const use=Math.min(remaining,value);if(use>0){
   updates.push({ref:d.ref,value:round(value-use),total:round((l.reserva||0)+(l.giro||0)-use)});
   remaining=round(remaining-use);
  }
  if(!remaining)break;
 }
 if(remaining)return null;
 return updates;
}
export default async function v3Ledger(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const db=getDb(),unit=db.collection('units').doc(m.unitId),products=unit.collection('products'),profiles=unit.collection('operationalProfiles'),
   balances=unit.collection('v3PhysicalBalances'),lotRoots=unit.collection('v3PhysicalLots'),orders=unit.collection('purchaseOrdersV3'),
   actorRef=db.doc('memberships/'+actor.uid),action=req.body?.action;
  if(action==='v3Lots'){
   const {productId}=req.body||{};if(!idOk(productId))return send(res,400,'Insumo inválido.');
   const [a,p]=await Promise.all([actorRef.get(),products.doc(productId).get()]);
   if(!active(a,m.unitId,TEAM_ROLES))return send(res,403,'Sem permissão.');
   if(!p.exists||p.data().status!=='active')return send(res,404,'Insumo não encontrado.');
   const lots=await lotRoots.doc(productId).collection('lots').limit(101).get();
   if(lots.size>100)return send(res,409,'Muitos lotes: conferir paginação.');
   return send(res,200,'Lotes carregados.',{lots:lots.docs.map(snapMap)});
  }
  if(action==='v3LedgerHistory'){
   const a=await actorRef.get();
   if(!active(a,m.unitId,TEAM_ROLES))return send(res,403,'Sem permissão.');
   const h=await unit.collection('v3Operations').orderBy('at','desc').limit(60).get();
   return send(res,200,'Movimentações recentes.',{operations:h.docs.map(snapMap)});
  }
  if(action==='v3InspectReceive'){
   const {requestId,productId,commercialQuantity,commercialUnit,stockQuantity,location='reserva',orderId=null,lot='',expiryDate='',supplier='',notes=''}=req.body||{};
   if(!reqOk(requestId)||!idOk(productId)||!locations.includes(location)||!['kg','g','L','mL','un','porcao','pacote','duzia'].includes(commercialUnit)||
     !number(commercialQuantity,commercialUnit)||typeof stockQuantity!=='number'||!Number.isFinite(stockQuantity)||stockQuantity<0||
     typeof lot!=='string'||lot.length>80||typeof expiryDate!=='string'||typeof supplier!=='string'||!supplier.trim()||supplier.length>100||
     typeof notes!=='string'||notes.length>240||(orderId!==null&&!reqOk(orderId)))
     return send(res,400,'Revise a conferência do recebimento.');
   const inspection=unit.collection('v3ReceiptInspections').doc(requestId);
   const payload={productId,commercialQuantity,commercialUnit,stockQuantity,location,orderId,lot,expiryDate,supplier,notes};
   const fingerprint=hashed(JSON.stringify(payload));
   let duplicate=false;
   await db.runTransaction(async tx=>{
     const [who,existing,product,profile]=await Promise.all([tx.get(actorRef),tx.get(inspection),tx.get(products.doc(productId)),tx.get(profiles.doc(productId))]);
     if(!active(who,m.unitId,TEAM_ROLES))throw Error('FORBIDDEN');
     if(existing.exists){if(existing.data().fingerprint!==fingerprint||existing.data().inspectedBy!==actor.uid)throw Error('CONFLICT');duplicate=true;return;}
     if(!product.exists||product.data().status!=='active'||!profile.exists)throw Error('MISSING');
     const cfg=profile.data();
     if(cfg.controlMode==='quantitative'&&!number(stockQuantity,cfg.countUnit))throw Error('QUANTITY');
     if(cfg.controlMode!=='quantitative'&&stockQuantity!==0)throw Error('QUANTITY');
     if(cfg.controlMode==='quantitative'&&!cfg.locations.includes(location))throw Error('LOCATION');
     if(product.data().trackExpiry&&(!lot.trim()||!isoDay(expiryDate)))throw Error('LOT');
     tx.create(inspection,{...payload,unitId:m.unitId,status:'pending',fingerprint,inspectedBy:actor.uid,inspectedAt:now()});
     audit(tx,db,'v3.receipt_inspected',m.unitId,actor.uid,{requestId,productId});
   });
   return send(res,200,duplicate?'Conferência já enviada.':'Conferência enviada para aprovação. Estoque ainda não alterado.',{id:requestId,duplicate,status:'pending'});
  }
  if(action==='v3PendingReceipts'){
   const a=await actorRef.get();if(!active(a,m.unitId,MANAGEMENT_ROLES))return send(res,403,'Aprovação reservada à gestão.');
   const snap=await unit.collection('v3ReceiptInspections').where('status','==','pending').limit(101).get();
   if(snap.size>100)return send(res,409,'Há mais de 100 conferências pendentes. Solicite paginação.');
   return send(res,200,'Conferências pendentes.',{inspections:snap.docs.map(d=>({id:d.id,...d.data(),inspectedAt:d.data().inspectedAt?.toDate?.()?.toISOString?.()}))});
  }
  if(action==='v3ApproveReceipt'){
   const inspectionId=req.body?.inspectionId;
   if(!reqOk(inspectionId))return send(res,400,'Conferência inválida.');
   const who=await actorRef.get();if(!active(who,m.unitId,MANAGEMENT_ROLES))return send(res,403,'Aprovação reservada à gestão.');
   const inspectionRef=unit.collection('v3ReceiptInspections').doc(inspectionId),snapshot=await inspectionRef.get();
   if(!snapshot.exists)return send(res,404,'Conferência não encontrada.');
   const data=snapshot.data();
   if(data.status==='approved')return send(res,200,'Conferência já aprovada.',{duplicate:true,id:inspectionId});
   if(data.status!=='pending')return send(res,409,'Conferência não está pendente.');
   // Mesmo identificador evita dupla entrada em aprovações concorrentes e reenvios.
   const payload={requestId:inspectionId,productId:data.productId,commercialQuantity:data.commercialQuantity,
    commercialUnit:data.commercialUnit,stockQuantity:data.stockQuantity,location:data.location,orderId:data.orderId,
    lot:data.lot,expiryDate:data.expiryDate,supplier:data.supplier,notes:data.notes};
   const previous=req.body;
   req.body={...payload,action:'v3Receive',_approvedInspectionId:inspectionId};
   try{await v3Ledger(req,res)}finally{req.body=previous}
   return;
  }
  if(action==='v3Receive'){
   if(!MANAGEMENT_ROLES.includes(m.role))return send(res,403,'Somente gerência recebe mercadorias.');
   const {requestId,productId,commercialQuantity,commercialUnit,stockQuantity,location='reserva',orderId=null,lot='',expiryDate='',supplier='',notes=''}=req.body||{};
   if(!reqOk(requestId)||!idOk(productId)||!locations.includes(location)||typeof lot!=='string'||typeof expiryDate!=='string'||!['kg','g','L','mL','un','porcao','pacote','duzia'].includes(commercialUnit)||
      !number(commercialQuantity,commercialUnit)||!number(stockQuantity,'kg',true)||!Number.isFinite(stockQuantity)||stockQuantity<0||
      orderId!==null&&!reqOk(orderId)||typeof supplier!=='string'||supplier.length>100||typeof notes!=='string'||notes.length>240)
      return send(res,400,'Recebimento incompleto.');
   const recordRef=unit.collection('v3Operations').doc(requestId),pr=products.doc(productId),profileRef=profiles.doc(productId),balRef=balances.doc(productId),orderRef=orderId?orders.doc(orderId):null;
   const approvalRef=req.body?._approvedInspectionId===requestId?unit.collection('v3ReceiptInspections').doc(requestId):null;
   const fingerprint=hashed(JSON.stringify({productId,commercialQuantity,commercialUnit,stockQuantity,location,orderId,lot,expiryDate,supplier,notes}));
   let duplicate=false;
   await db.runTransaction(async tx=>{
    const [authSnap,product,profile,balance,existing,order,approval]=await Promise.all([
     tx.get(actorRef),tx.get(pr),tx.get(profileRef),tx.get(balRef),tx.get(recordRef),orderRef?tx.get(orderRef):Promise.resolve(null),approvalRef?tx.get(approvalRef):Promise.resolve(null)]);
    if(!active(authSnap,m.unitId,MANAGEMENT_ROLES))throw Error('FORBIDDEN');
    if(approvalRef&&(!approval?.exists||approval.data().status!=='pending'))throw Error('CONFLICT');
    if(existing.exists){if(existing.data().fingerprint!==fingerprint||existing.data().actorUid!==actor.uid)throw Error('CONFLICT');duplicate=true;return;}
    if(!product.exists||product.data().status!=='active'||!profile.exists)throw Error('MISSING');
    const cfg=profile.data(),isCounted=cfg.controlMode==='quantitative';
    if(isCounted&&!number(stockQuantity,cfg.countUnit))throw Error('QUANTITY');
    if(!isCounted&&stockQuantity!==0)throw Error('QUANTITY');
    if(isCounted&&!cfg.locations.includes(location))throw Error('LOCATION');
    if(product.data().trackExpiry&&(!lot.trim()||lot.length>80||!isoDay(expiryDate)||expiryDate<new Date().toISOString().slice(0,10)))throw Error('LOT');
    if(orderRef&&(!order?.exists||!order.data().items.some(i=>i.productId===productId)))throw Error('ORDER');
    if(orderRef&&['cancelled','received'].includes(order.data().status))throw Error('ORDER');
    const old=balance.exists?balance.data():{unit:cfg.countUnit,reserva:0,giro:0,total:0};
    if(isCounted&&old.unit!==cfg.countUnit)throw Error('UNIT');
    // Aferição e contagem explícitas: nunca kg -> peças por peso nominal.
    const lotRef=isCounted&&product.data().trackExpiry?lotRoots.doc(productId).collection('lots').doc(hashed(lot.trim()+'|'+expiryDate)):null;
    const batch=lotRef?await tx.get(lotRef):null;
    if(lotRef&&batch.exists&&batch.data().unit!==cfg.countUnit)throw Error('UNIT');
    if(isCounted){
     const newLoc=round((old[location]||0)+stockQuantity);
     tx.set(balRef,{productId,unit:cfg.countUnit,reserva:location==='reserva'?newLoc:old.reserva||0,
      giro:location==='giro'?newLoc:old.giro||0,total:round((old.total||0)+stockQuantity),
      updatedAt:now(),lastOperationId:requestId,quality:'ESTIMATED_BY_MOVEMENTS'},{merge:true});
     if(lotRef){
      const oldLot=batch?.data()||{};
      const lo=round((oldLot[location]||0)+stockQuantity);
      const values={reserva:location==='reserva'?lo:oldLot.reserva||0,giro:location==='giro'?lo:oldLot.giro||0};
      tx.set(lotRef,{productId,lot:lot.trim(),expiryDate,unit:cfg.countUnit,...values,availableQuantity:round(values.reserva+values.giro),updatedAt:now()},{merge:true});
     }
    }
    if(orderRef){
     const o=order.data(),received={...(o.received||{})};
     const previous=received[productId]||0;
     const expected=o.items.find(x=>x.productId===productId);
     if(expected.unit!==commercialUnit)throw Error('ORDER_UNIT');
     received[productId]=round(previous+commercialQuantity);
     const all=o.items.every(i=>(received[i.productId]||0)>=i.quantity);
     tx.update(orderRef,{received,status:all?'received':'partially_received',updatedAt:now()});
    }
    if(approvalRef)tx.update(approvalRef,{status:'approved',approvedBy:actor.uid,approvedAt:now()});
    tx.create(recordRef,{kind:'receipt',actorUid:actor.uid,at:now(),unitId:m.unitId,productId,
     commercialQuantity,commercialUnit,stockQuantity: isCounted?stockQuantity:null,stockUnit:isCounted?cfg.countUnit:null,
     location,orderId,lot,expiryDate,supplier,notes,fingerprint});
    audit(tx,db,'v3.received',m.unitId,actor.uid,{requestId,productId,orderId,commercialQuantity,commercialUnit,stockQuantity});
   });
   return send(res,200,duplicate?'Recebimento já registrado.':'Recebimento salvo.',{duplicate,id:requestId});
  }
  if(action==='v3Count'){
   const {requestId,sessionId,productId,location,quantity,lotCounts=[],initialLot=null,notes=''}=req.body||{};
   if(!reqOk(requestId)||!reqOk(sessionId)||!idOk(productId)||!locations.includes(location)||
    typeof notes!=='string'||notes.length>240||!Array.isArray(lotCounts)||lotCounts.length>100)return send(res,400,'Contagem incompleta.');
   const pr=products.doc(productId),cfgRef=profiles.doc(productId),balanceRef=balances.doc(productId),ref=unit.collection('v3Operations').doc(requestId);
   await db.runTransaction(async tx=>{
    const [a,p,cfg,balance,record]=await Promise.all([tx.get(actorRef),tx.get(pr),tx.get(cfgRef),tx.get(balanceRef),tx.get(ref)]);
    if(!active(a,m.unitId,MANAGEMENT_ROLES))throw Error('FORBIDDEN');
    if(record.exists){const old=record.data();if(old.kind==='count'&&old.actorUid===actor.uid&&old.sessionId===sessionId&&old.productId===productId&&old.location===location&&old.quantity===quantity&&old.notes===notes)return;throw Error('CONFLICT');}
    if(!p.exists||!cfg.exists||cfg.data().controlMode!=='quantitative'||!cfg.data().locations.includes(location))throw Error('MISSING');
    const u=cfg.data().countUnit;if(!number(quantity,u,true))throw Error('QUANTITY');
    const prior=balance.data()||{reserva:0,giro:0,total:0,unit:u};
    if(prior.unit!==u)throw Error('UNIT');
    const today=new Date().toISOString().slice(0,10);
    const lotQuery=p.data().trackExpiry?await tx.get(lotRoots.doc(productId).collection('lots').limit(101)):null;
    if(lotQuery?.size>100)throw Error('LOT');
    if(lotQuery){
     const lots=lotQuery.docs;
     if(lots.length===0&&quantity>0){
      if(!MANAGEMENT_ROLES.includes(a.data().role)||!initialLot||typeof initialLot.lot!=='string'||!initialLot.lot.trim()||initialLot.lot.length>80||!isoDay(initialLot.expiryDate)||initialLot.expiryDate<today)throw Error('LOT');
      const newRef=lotRoots.doc(productId).collection('lots').doc(hashed(initialLot.lot.trim()+'|'+initialLot.expiryDate));
      tx.create(newRef,{productId,lot:initialLot.lot.trim(),expiryDate:initialLot.expiryDate,unit:u,
       reserva:location==='reserva'?quantity:0,giro:location==='giro'?quantity:0,availableQuantity:quantity,
       initializedBy:actor.uid,initializedAt:now(),updatedAt:now()});
     }else{
     const mapped=new Map(lotCounts.map(x=>[x.id,x.quantity]));
     if(mapped.size!==lotCounts.length||lots.length!==mapped.size||
       lots.some(l=>!mapped.has(l.id)||!number(mapped.get(l.id),u,true)||l.data().unit!==u)||
       round(lotCounts.reduce((sum,x)=>sum+x.quantity,0))!==quantity)throw Error('LOT');
     for(const doc of lots){
      const d=doc.data(),newLoc=mapped.get(doc.id);
      tx.update(doc.ref,{[location]:newLoc,availableQuantity:round(newLoc+(d[location==='reserva'?'giro':'reserva']||0)),updatedAt:now()});
     }
     }
    }
    const after=round(quantity+(prior[location==='reserva'?'giro':'reserva']||0));
    tx.set(balanceRef,{productId,unit:u,[location]:quantity,[location==='reserva'?'giro':'reserva']:prior[location==='reserva'?'giro':'reserva']||0,total:after,updatedAt:now(),
      lastCountAtByArea:{...(prior.lastCountAtByArea||{}),[location]:now()},
      countSessions:{...(prior.countSessions||{}),[location]:sessionId},
      quality:'PARTIAL_LOCATION_COUNT',lastOperationId:requestId},{merge:true});
    tx.create(ref,{kind:'count',actorUid:actor.uid,at:now(),productId,location,sessionId,quantity,unit:u,
      before:prior[location]||0,difference:round(quantity-(prior[location]||0)),notes});
    audit(tx,db,'v3.counted',m.unitId,actor.uid,{requestId,productId,location,quantity,sessionId});
   });
   return send(res,200,'Contagem registrada.');
  }
  if(action==='v3Transfer'){
   const {requestId,productId,from,to,quantity}=req.body||{};
   if(!reqOk(requestId)||!idOk(productId)||!locations.includes(from)||!locations.includes(to)||from===to)return send(res,400,'Transferência inválida.');
   const ref=unit.collection('v3Operations').doc(requestId),pr=products.doc(productId),cfgRef=profiles.doc(productId),balRef=balances.doc(productId);
   await db.runTransaction(async tx=>{
    const [a,p,cfg,b,existing]=await Promise.all([tx.get(actorRef),tx.get(pr),tx.get(cfgRef),tx.get(balRef),tx.get(ref)]);
    if(!active(a,m.unitId,TEAM_ROLES))throw Error('FORBIDDEN');
    if(existing.exists)throw Error('CONFLICT');
    if(!p.exists||!cfg.exists||!b.exists||cfg.data().controlMode!=='quantitative'||!cfg.data().locations.includes(from)||!cfg.data().locations.includes(to))throw Error('MISSING');
    const u=cfg.data().countUnit,prior=b.data();
    if(!number(quantity,u)||prior.unit!==u||prior[from]<quantity)throw Error('QUANTITY');
    let changes=[];
    if(p.data().trackExpiry){
     const list=await tx.get(lotRoots.doc(productId).collection('lots').orderBy('expiryDate').limit(101));
     if(list.size>100)throw Error('LOT');
     const chunks=debitLotDocs(list.docs,from,quantity,new Date().toISOString().slice(0,10));if(!chunks)throw Error('LOT');
     changes=chunks.map(item=>{
      const d=list.docs.find(x=>x.ref.path===item.ref.path).data();
      return {ref:item.ref,after:{[from]:item.value,[to]:round((d[to]||0)+(d[from]-item.value)),updatedAt:now()}};
     });
    }
    for(const c of changes)tx.update(c.ref,c.after);
    tx.update(balRef,{[from]:round(prior[from]-quantity),[to]:round(prior[to]+quantity),lastOperationId:requestId,updatedAt:now(),quality:'ESTIMATED_BY_MOVEMENTS'});
    tx.create(ref,{kind:'transfer',actorUid:actor.uid,at:now(),productId,from,to,quantity,unit:u});
    audit(tx,db,'v3.transferred',m.unitId,actor.uid,{requestId,productId,from,to,quantity});
   });
   return send(res,200,'Transferência registrada. O total não mudou.');
  }
  if(action==='v3Produce'){
   const {requestId,outputProductId,outputQuantity,outputLocation='reserva',inputs,lot='',expiryDate='',notes='',alternativeReason=''}=req.body||{};
   if(!reqOk(requestId)||!idOk(outputProductId)||!locations.includes(outputLocation)||!Array.isArray(inputs)||!inputs.length||inputs.length>12||
      inputs.some(i=>!idOk(i?.productId)||!locations.includes(i.location)||typeof i.quantity!=='number')||
      new Set(inputs.map(i=>i.productId)).size!==inputs.length||typeof notes!=='string'||notes.length>240||
      typeof alternativeReason!=='string'||alternativeReason.length>240)return send(res,400,'Revise a produção.');
   const outputRef=products.doc(outputProductId),outputProfileRef=profiles.doc(outputProductId),outputBalanceRef=balances.doc(outputProductId);
   const recordRef=unit.collection('v3Operations').doc(requestId);
   const sourceRefs=inputs.map(i=>products.doc(i.productId)),sourceProfiles=inputs.map(i=>profiles.doc(i.productId)),sourceBalances=inputs.map(i=>balances.doc(i.productId));
   const fingerprint=hashed(JSON.stringify({outputProductId,outputQuantity,outputLocation,inputs,lot,expiryDate,notes,alternativeReason}));
   let duplicate=false;
   await db.runTransaction(async tx=>{
    const snaps=await Promise.all([tx.get(actorRef),tx.get(recordRef),tx.get(outputRef),tx.get(outputProfileRef),tx.get(outputBalanceRef),
     ...sourceRefs.map(r=>tx.get(r)),...sourceProfiles.map(r=>tx.get(r)),...sourceBalances.map(r=>tx.get(r))]);
    const [a,existing,outProduct,outProfile,outBalance]=snaps;
    if(!active(a,m.unitId,TEAM_ROLES))throw Error('FORBIDDEN');
    if(existing.exists){if(existing.data().fingerprint!==fingerprint||existing.data().actorUid!==actor.uid)throw Error('CONFLICT');duplicate=true;return;}
    if(!outProduct.exists||outProduct.data().status!=='active'||!outProfile.exists||!['internal','both'].includes(outProfile.data().origin)||
      outProfile.data().controlMode!=='quantitative'||!outProfile.data().locations.includes(outputLocation))throw Error('MISSING');
    const ocfg=outProfile.data(),outUnit=ocfg.countUnit;
    if(!number(outputQuantity,outUnit))throw Error('QUANTITY');
    if(outProduct.data().trackExpiry&&(!lot.trim()||lot.length>80||!isoDay(expiryDate)||expiryDate<new Date().toISOString().slice(0,10)))throw Error('LOT');
    const n=inputs.length,sP=snaps.slice(5,5+n),sCfg=snaps.slice(5+n,5+2*n),sBal=snaps.slice(5+2*n,5+3*n);
    if(sP.some(x=>!x.exists||x.data().status!=='active')||sCfg.some(x=>!x.exists)||sBal.some(x=>!x.exists))throw Error('MISSING');
    let usesAlternative=false;
    for(let i=0;i<n;i++){
     const item=inputs[i],cfg=sCfg[i].data(),b=sBal[i].data();
     if(!['supplier','internal','both'].includes(cfg.origin)||cfg.controlMode!=='quantitative'||!cfg.locations.includes(item.location)||
       !number(item.quantity,cfg.countUnit)||b.unit!==cfg.countUnit||b[item.location]<item.quantity)throw Error('QUANTITY');
     if(ocfg.sourceProductIds?.includes(item.productId))continue;
     if(ocfg.alternativeProductIds?.includes(item.productId)){usesAlternative=true;continue;}
     throw Error('SOURCE');
    }
    if(usesAlternative&&!MANAGEMENT_ROLES.includes(a.data().role))throw Error('ALTERNATIVE_APPROVAL');
     if(usesAlternative&&alternativeReason.trim().length<8)throw Error('ALTERNATIVE');
    const outputLotRef=outProduct.data().trackExpiry?lotRoots.doc(outputProductId).collection('lots').doc(hashed(lot.trim()+'|'+expiryDate)):null;
    const inputLots=await Promise.all(inputs.map((i,index)=>sP[index].data().trackExpiry?
      tx.get(lotRoots.doc(i.productId).collection('lots').orderBy('expiryDate').limit(101)):Promise.resolve(null)));
    const destLot=outputLotRef?await tx.get(outputLotRef):null;
    const sourceLotUpdates=[];
    for(let i=0;i<n;i++){
     if(!inputLots[i])continue;
     if(inputLots[i].size>100)throw Error('LOT');
     const matching=debitLotDocs(inputLots[i].docs,inputs[i].location,inputs[i].quantity,new Date().toISOString().slice(0,10));
     if(!matching)throw Error('LOT');
     for(const upd of matching)sourceLotUpdates.push(upd);
    }
    if(outBalance.exists&&outBalance.data().unit!==outUnit)throw Error('UNIT');
    if(destLot?.exists&&destLot.data().unit!==outUnit)throw Error('UNIT');
    const before=outBalance.data()||{unit:outUnit,reserva:0,giro:0,total:0};
    const newLoc=round((before[outputLocation]||0)+outputQuantity);
    for(let i=0;i<n;i++){
     const b=sBal[i].data(),item=inputs[i];
     tx.update(sourceBalances[i],{[item.location]:round(b[item.location]-item.quantity),
      total:round(b.total-item.quantity),lastOperationId:requestId,updatedAt:now(),quality:'ESTIMATED_BY_MOVEMENTS'});
    }
    for(const upd of sourceLotUpdates){
     tx.update(upd.ref,{[inputs.find(i=>upd.ref.path.includes('/'+i.productId+'/'))?.location||'giro']:upd.value,
      availableQuantity:upd.total,updatedAt:now()});
    }
    tx.set(outputBalanceRef,{productId:outputProductId,unit:outUnit,
     [outputLocation]:newLoc,[outputLocation==='reserva'?'giro':'reserva']:before[outputLocation==='reserva'?'giro':'reserva']||0,
     total:round(before.total+outputQuantity),lastOperationId:requestId,updatedAt:now(),quality:'ESTIMATED_BY_MOVEMENTS'},{merge:true});
    if(outputLotRef){
     const old=destLot.data()||{},updated=round((old[outputLocation]||0)+outputQuantity);
     const other=old[outputLocation==='reserva'?'giro':'reserva']||0;
     tx.set(outputLotRef,{productId:outputProductId,lot:lot.trim(),expiryDate,unit:outUnit,
      [outputLocation]:updated,[outputLocation==='reserva'?'giro':'reserva']:other,availableQuantity:round(updated+other),updatedAt:now()},{merge:true});
    }
    tx.create(recordRef,{kind:'production',actorUid:actor.uid,at:now(),productId:outputProductId,
     outputQuantity,outputUnit:outUnit,outputLocation,inputs:inputs.map((i,k)=>({...i,unit:sCfg[k].data().countUnit})),
     lot,expiryDate,alternativeReason:alternativeReason.trim(),notes,fingerprint,recipeProfileVersion:ocfg.version});
    audit(tx,db,'v3.produced',m.unitId,actor.uid,{requestId,outputProductId,inputs,outputQuantity,outputUnit:outUnit});
   });
   return send(res,200,duplicate?'Produção já registrada.':'Produção concluída e saldos atualizados.',{duplicate,id:requestId});
  }
  return send(res,400,'Ação não suportada.');
 }catch(e){
  const errors={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem permissão.'],MISSING:[409,'Produto não configurado ou saldo indisponível.'],
   CONFLICT:[409,'Operação já registrada ou identificador repetido.'],UNIT:[409,'Unidades incompatíveis; revisão necessária.'],
   QUANTITY:[409,'Quantidade inválida ou saldo insuficiente.'],LOT:[409,'Lotes e validade precisam ser reconciliados.'],
   LOCATION:[409,'Local não permitido para este item.'],ORDER:[409,'Pedido não corresponde ao item recebido.'],
   ORDER_UNIT:[409,'Unidade do pedido não corresponde à conferência.'],SOURCE:[409,'Matéria-prima não autorizada nesta preparação.'],ALTERNATIVE:[409,'Explique a substituição antes de produzir.'],ALTERNATIVE_APPROVAL:[403,'Uma substituição de matéria-prima exige autorização gerencial. Solicite à gestão que registre a produção.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  console.error('V3 ledger:',e.message);return send(res,500,'Erro ao registrar operação V3.');
 }
}
