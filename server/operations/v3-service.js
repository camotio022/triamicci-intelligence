import {hasArchiveStock} from './stock-scope.js';
import {configuredProduct} from './configured-product.js';
import {countUnit,validQuantity} from './logic.js';
import {RECEIVING_UNITS} from './unit-engine.js';
import {conferenceProfile} from './conference-profile.js';
import {sendQuotaError} from '../quota-error.js';
import {isOperationalProduct,belongsToOperationalCatalog,OPERATIONAL_CATALOG_VERSION} from './catalog-identity.js';
import {operationalView} from './shared-balance.js';
import {signalUnitChange} from '../live-signal.js';
import v3Ledger from './v3-ledger.js';
import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {validateOperationalProfile,reportShortage,transitionOrder} from './v3-catalog-policy.js';
const idOk=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const requestOk=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x);
import {MANAGEMENT_ROLES,TEAM_ROLES} from '../permissions/v31-policy.js';
import {redactFinancial} from '../permissions/v31-redaction.js';
import {restaurantDay} from '../schedules/restaurant-today.js';
const roles=MANAGEMENT_ROLES;
const locations=['reserva','giro'];
const unitNames=RECEIVING_UNITS;
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const obj=s=>({id:s.id,...s.data()});
const now=()=>new Date();
const dateOk=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const quantity=(v,unit,zero=false)=>validQuantity(v,{unit,allowZero:zero});
const newAudit=(tx,db,event,unitId,actorUid,details)=>{signalUnitChange(tx,db,unitId,['stock', 'catalog']);return tx.create(db.collection('auditLogs').doc(),{event,unitId,actorUid,details,at:now()});};
// Manual registrations may be configured by management before joining the operational catalog.
const isPendingProduct=p=>p?.status==='inactive'&&p.reviewRequired===true&&!belongsToOperationalCatalog(p)&&!p.catalogId;
const verify=(a,unitId,allowed)=>a.exists&&a.data().status==='active'&&a.data().unitId===unitId&&allowed.includes(a.data().role);
const productPath=(unit,id)=>unit.collection('products').doc(id);
const limitText=(x,max=240)=>typeof x==='string'&&x.length<=max;
const round=x=>Math.round(x*1000)/1000;
export default async function kitchenV3(req,res){
 if(['v3LossReport','v3LossPending','v3LossApprove','v3LossReject','v3InspectReceive','v3PendingReceipts','v3ApproveReceipt','v3RejectReceipt','v3Receive','v3Count','v3Transfer','v3Produce','v3Lots','v3LedgerHistory'].includes(req.body?.action))return v3Ledger(req,res);
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const user=await authenticate(req),member=await membership(user.uid);
  if(!member?.unitId)return send(res,403,'Usuário sem unidade ativa.');
  const db=getDb(),unitId=member.unitId,unit=db.collection('units').doc(unitId);
  const products=unit.collection('products'),profiles=unit.collection('operationalProfiles'),issues=unit.collection('stockSignals'),orders=unit.collection('purchaseOrdersV3'),balances=unit.collection('physicalBalances');
  const actorRef=db.doc('memberships/'+user.uid),action=req.body?.action;
  if(action==='v3Alerts'){
   const [s,o]=await Promise.all([issues.limit(201).get(),orders.limit(201).get()]);
   if(s.size>200||o.size>200)return send(res,409,'Há muitos avisos. Paginação necessária.');
   const today=restaurantDay();
   return send(res,200,'Alertas operacionais carregados.',{signals:s.docs.map(obj).filter(x=>x.status!=='resolved'),
    deliveries:o.docs.map(obj).filter(x=>!['received','cancelled'].includes(x.status)).sort((a,b)=>a.etaDate.localeCompare(b.etaDate)),today});
  }
  if(action==='v3Dashboard'||action==='v3Conference'){
   const [a,b,c,d,e,checks]=await Promise.all([products.limit(201).get(),profiles.limit(201).get(),issues.limit(201).get(),action==='v3Conference'?Promise.resolve({docs:[],size:0}):orders.limit(201).get(),balances.limit(201).get(),action==='v3Conference'?unit.collection('availabilityChecks').limit(401).get():Promise.resolve({docs:[],size:0})]);
   if(checks.size>400)return send(res,409,'Muitas conferências: paginação necessária.');
   if([a,b,c,d,e].some(s=>s.size>200))return send(res,409,'Limite de consulta atingido. Paginação necessária.');
   const pm=new Map(b.docs.map(obj).map(p=>[p.id,p]));
   // Only read the legacy collection if an operational product has no current balance.
   // Current balances always override legacy data; reading legacy when all are present
   // cannot affect the response and wastes a full collection query on every refresh.
   const currentIds=new Set(e.docs.map(doc=>doc.id));
   const needsLegacy=a.docs.some(doc=>isOperationalProduct(doc.data())&&!currentIds.has(doc.id));
   const legacy=needsLegacy?await unit.collection('v3PhysicalBalances').limit(201).get():{docs:[],size:0};
   if(legacy.size>200)return send(res,409,'Limite de consulta atingido.');
   const bm=new Map(legacy.docs.map(obj).map(p=>[p.id,operationalView(p)]));for(const doc of e.docs)bm.set(doc.id,operationalView(obj(doc)));
   return send(res,200,'Painel operacional carregado.',{
    products:a.docs.filter(s=>isOperationalProduct(s.data())).map(s=>{const data={...configuredProduct(obj(s),pm.get(s.id)),profile:conferenceProfile(s.data(),pm.get(s.id)),v3Balance:bm.get(s.id)||null};return roles.includes(member.role)?data:redactFinancial(data)}).sort((x,y)=>x.name.localeCompare(y.name,'pt-BR')),
    ...(action==='v3Dashboard'&&roles.includes(member.role)?{
     catalogPending:a.docs.filter(d=>isPendingProduct(d.data())).map(d=>({id:d.id,name:d.data().name,unit:d.data().unit,status:'inactive',reviewRequired:true}))
    }:{}),
    availability:checks.docs.map(s=>({...obj(s),at:iso(s.data().at)})),
    signals:c.docs.map(obj).filter(s=>s.status!=='resolved'),
    orders:d.docs.map(obj).filter(o=>o.status!=='cancelled').map(x=>roles.includes(member.role)?x:redactFinancial(x)).sort((x,y)=>(x.etaDate||'').localeCompare(y.etaDate||'')),
   });
  }
  if(action==='v3ProfileSave'){
   if(!roles.includes(member.role))return send(res,403,'Somente gerência configura insumos.');
   const {productId,profile,expectedVersion=null}=req.body||{};
   if(!idOk(productId)||!validateOperationalProfile(profile).ok||!Number.isInteger(expectedVersion)&&expectedVersion!==null)return send(res,400,'Revise a configuração operacional.');
   const ref=profiles.doc(productId),pref=products.doc(productId);
   let version=0;
   await db.runTransaction(async tx=>{
    const [actor,p,prior,balance,allProfiles,allProducts,oldLegacy]=await Promise.all([tx.get(actorRef),tx.get(pref),tx.get(ref),tx.get(balances.doc(productId)),tx.get(profiles.limit(201)),tx.get(products.limit(201)),tx.get(unit.collection('v3PhysicalBalances').doc(productId))]);
    if(!verify(actor,unitId,roles))throw Error('FORBIDDEN');
    if(!p.exists)throw Error('NOT_FOUND');
    if(allProfiles.size>200||allProducts.size>200)throw Error('TOO_MANY');
    const candidateNames=[profile.displayName,...(profile.aliases||[])].map(x=>x.trim().toLocaleLowerCase('pt-BR'));
    if(allProfiles.docs.some(d=>d.id!==productId&&[d.data().displayName,...(d.data().aliases||[])].some(x=>candidateNames.includes((x||'').trim().toLocaleLowerCase('pt-BR'))))||
       allProducts.docs.some(d=>d.id!==productId&&!allProfiles.docs.find(p=>p.id===d.id)&&candidateNames.includes((d.data().name||'').trim().toLocaleLowerCase('pt-BR'))))throw Error('DUPLICATE_NAME');
    const sourceIds=[...(profile.sourceProductIds||[]),...(profile.alternativeProductIds||[])];
    if(sourceIds.includes(productId))throw Error('INVALID_SOURCE');
    if(sourceIds.length){const sourceDocs=await Promise.all(sourceIds.map(id=>tx.get(products.doc(id))));if(sourceDocs.some(d=>!d.exists||!isOperationalProduct(d.data())))throw Error('INVALID_SOURCE');}
    if(prior.exists&&prior.data().version!==expectedVersion||!prior.exists&&expectedVersion!==null&&expectedVersion!==p.data().profile?.version)throw Error('STALE');
    const pending=isPendingProduct(p.data());
    if(!pending&&!isOperationalProduct(p.data()))throw Error('INACTIVE');
    const targetUnit=profile.countUnit||countUnit(p.data());
    const unitChanged=countUnit(p.data())!==targetUnit||(balance.exists&&balance.data().unit!==targetUnit)||(!balance.exists&&oldLegacy.exists&&oldLegacy.data().unit!==targetUnit);
    const legacy=unitChanged?oldLegacy:null;
    const lots=unitChanged?await tx.get(unit.collection('physicalLots').doc(productId).collection('lots').limit(201)):null;
    const recipes=unitChanged?await tx.get(unit.collection('productionRecipes').limit(101)):null;
    if(lots?.size>200||recipes?.size>100)throw Error('TOO_MANY');
    // Test-phase reconfiguration replaces current experimental balances; historical records remain unchanged.
    const next={displayName:profile.displayName.trim(),aliases:(profile.aliases||[]).map(x=>x.trim()),controlMode:profile.controlMode,origin:profile.origin,
      countUnit:profile.countUnit||null,locations:profile.locations,receivingPresentation:profile.receivingPresentation||null,
      receivingModel:profile.receivingModel||null,
      sourceProductIds:profile.sourceProductIds||[],alternativeProductIds:profile.alternativeProductIds||[],
      trackingNote:(profile.trackingNote||'').slice(0,240),version:(prior.data()?.version||p.data().profile?.version||0)+1,updatedAt:now(),updatedBy:user.uid};
    version=next.version;tx.set(ref,next);
    tx.update(pref,{...(pending?{status:'active',reviewRequired:false,operationalCatalogVersion:OPERATIONAL_CATALOG_VERSION,operationalCatalogOrigin:'reviewed_manual_product',lotTrackingMode:p.data().trackExpiry===true?'per_lot':'none'}:{}),name:next.displayName,aliases:[...new Set([...(p.data().aliases||[]),...(next.aliases||[]),p.data().name].filter(Boolean))],profile:next,unit:targetUnit,operationalUnitOverride:targetUnit,receivingUnitOverride:profile.receivingModel?.receivingUnit||([...unitNames,'ml'].includes(profile.receivingPresentation)?profile.receivingPresentation:unitChanged?targetUnit:p.data().receivingUnitOverride||null),...(unitChanged?{quantity:0,minStock:0}:{}),updatedAt:now()});
    if(unitChanged&&(!pending||balance.exists||oldLegacy.exists)){
     tx.set(balances.doc(productId),{productId,unit:targetUnit,reserve:0,rotation:0,total:0,quality:'CONFIGURATION_RESET',at:null,countedTotal:null,countSessions:{},lastCountAtByArea:{},entriesSinceCount:0,exitsSinceCount:0,updatedAt:now(),configurationVersion:next.version});
     if(legacy?.exists)tx.set(legacy.ref,{productId,unit:targetUnit,reserva:0,giro:0,total:0,quality:'CONFIGURATION_RESET',updatedAt:now()});
     for(const lot of lots.docs)tx.delete(lot.ref);
     for(const recipe of recipes.docs){const data=recipe.data();if(data.active&&(data.outputProductId===productId||data.lines?.some(l=>l.productId===productId)))tx.update(recipe.ref,{active:false,version:(data.version||0)+1,configurationReviewRequired:'A unidade de um insumo foi alterada. Revise as quantidades antes de usar.',updatedAt:now(),updatedBy:user.uid});}
     newAudit(tx,db,'v3.experimental_stock_reset',unitId,user.uid,{productId,previousProduct:{name:p.data().name,unit:p.data().unit,quantity:p.data().quantity??null},previousBalance:balance.data()||null,previousLegacyBalance:legacy?.data()||null,previousLots:lots.docs.map(d=>({id:d.id,...d.data()})),nextUnit:targetUnit,requiresNewCount:true});
    }
    newAudit(tx,db,'v3.profile_saved',unitId,user.uid,{productId,before:prior.data()||null,after:next});
   });
   return send(res,200,'Configuração operacional salva.',{version});
  }
  if(action==='v3ArchiveProduct'){
   if(!roles.includes(member.role))return send(res,403,'Somente gerência administra o catálogo.');
   const {productId,active:restore}=req.body||{};
   if(!idOk(productId)||typeof restore!=='boolean')return send(res,400,'Selecione produto e ação.');
   const pref=products.doc(productId),physical=balances.doc(productId),legacy=unit.collection('v3PhysicalBalances').doc(productId),stored=unit.collection('storageBalancesV1').doc(productId);
   await db.runTransaction(async tx=>{
    const [a,p,currentBalance,legacyBalance,storedBalance,pendingOrders,openSignals]=await Promise.all([
     tx.get(actorRef),tx.get(pref),tx.get(physical),tx.get(legacy),tx.get(stored),tx.get(orders.limit(201)),tx.get(issues.limit(201))]);
    if(!verify(a,unitId,roles))throw Error('FORBIDDEN');
    if(!p.exists)throw Error('NOT_FOUND');
    if(restore&&!belongsToOperationalCatalog(p.data()))throw Error('NOT_FOUND');
    if(!restore){
     if(pendingOrders.size>200||openSignals.size>200)throw Error('TOO_MANY');
     if(hasArchiveStock(p.data(),currentBalance,legacyBalance,storedBalance))throw Error('PRODUCT_HAS_STOCK');
     if(pendingOrders.docs.some(d=>!['received','cancelled'].includes(d.data().status)&&d.data().items?.some(i=>i.productId===productId))||
       openSignals.docs.some(d=>d.data().productId===productId&&d.data().status!=='resolved'))throw Error('PRODUCT_HAS_PENDING');
    }
    tx.update(pref,{status:restore?'active':'inactive',updatedAt:now(),updatedBy:user.uid});
    newAudit(tx,db,restore?'v3.product_restored':'v3.product_archived',unitId,user.uid,{productId});
   });
   return send(res,200,restore?'Insumo reativado.':'Insumo arquivado sem apagar o histórico.');
  }
  if(action==='v3Signal'){
   const {productId,location,observation='missing',note=''}=req.body||{};
   if(!idOk(productId)||!['missing','low','available'].includes(observation)||!reportShortage({productId,location,reporterUid:user.uid,note}).ok)return send(res,400,'Revise produto, local e observação.');
   const ref=issues.doc(createHash('sha256').update(productId+':'+location).digest('hex'));
   await db.runTransaction(async tx=>{
    const [actor,p,old]=await Promise.all([tx.get(actorRef),tx.get(productPath(unit,productId)),tx.get(ref)]);
    if(!verify(actor,unitId,TEAM_ROLES))throw Error('FORBIDDEN');
    if(!p.exists||!isOperationalProduct(p.data()))throw Error('NOT_FOUND');
    const previous=old.data()||{},reports=Array.isArray(previous.reports)?previous.reports.slice(-19):[];
    if(previous.status!=='resolved'&&reports.some(r=>r.actorUid===user.uid&&r.observation===observation))throw Error('ALREADY_REPORTED');
    reports.push({actorUid:user.uid,at:now(),observation,note:note.trim()});
    tx.set(ref,{productId,productName:p.data().name,location,status:'reported',observation,
      reports,updatedAt:now(),resolution:null,version:(previous.version||0)+1});
    newAudit(tx,db,'v3.stock_signal',unitId,user.uid,{productId,location,observation});
   });
   return send(res,200,'Aviso enviado à equipe.');
  }
  if(action==='v3ResolveSignal'){
   if(!roles.includes(member.role))return send(res,403,'Somente gerência resolve avisos.');
   const {productId,location,resolution}=req.body||{};
   if(!idOk(productId)||!locations.includes(location)||!limitText(resolution)||!resolution.trim())return send(res,400,'Informe a decisão.');
   const ref=issues.doc(createHash('sha256').update(productId+':'+location).digest('hex'));
   await db.runTransaction(async tx=>{
    const [actor,old]=await Promise.all([tx.get(actorRef),tx.get(ref)]);
    if(!verify(actor,unitId,roles))throw Error('FORBIDDEN');
    if(!old.exists||old.data().status==='resolved')throw Error('NOT_FOUND');
    tx.update(ref,{status:'resolved',resolution:resolution.trim(),resolvedBy:user.uid,resolvedAt:now()});
    newAudit(tx,db,'v3.stock_signal_resolved',unitId,user.uid,{productId,location,resolution});
   });
   return send(res,200,'Pendência resolvida sem alterar quantidades.');
  }
  if(action==='v3OrderCreate'){
   if(!roles.includes(member.role))return send(res,403,'Somente gerência cadastra pedidos.');
   const {requestId,etaDate,supplier,items,notes=''}=req.body||{};
   if(!requestOk(requestId)||!dateOk(etaDate)||!limitText(supplier,100)||!supplier.trim()||!limitText(notes)||
      !Array.isArray(items)||!items.length||items.length>40||items.some(x=>!idOk(x?.productId)||!unitNames.includes(x.unit)||!quantity(x.quantity,x.unit)))return send(res,400,'Informe fornecedor, data prevista e itens válidos.');
   const ref=orders.doc(requestId);
   let duplicate=false;
   const fingerprint=createHash('sha256').update(JSON.stringify({etaDate,supplier,items,notes})).digest('hex');
   await db.runTransaction(async tx=>{
    const [actor,old,...ps]=await Promise.all([tx.get(actorRef),tx.get(ref),...items.map(x=>tx.get(productPath(unit,x.productId)))]);
    if(!verify(actor,unitId,roles))throw Error('FORBIDDEN');
    if(old.exists){if(old.data().fingerprint!==fingerprint||old.data().createdBy!==user.uid)throw Error('CONFLICT');duplicate=true;return;}
    const unavailable=ps.findIndex(p=>!p.exists||!isOperationalProduct(p.data()));
    if(unavailable>=0)throw Object.assign(Error('ORDER_ITEM_UNAVAILABLE'),{itemIndex:unavailable});
    const configs=await Promise.all(items.map(item=>tx.get(profiles.doc(item.productId))));
    const invalidOrigin=configs.findIndex(cfg=>!cfg.exists||!['supplier','both'].includes(cfg.data().origin));
    if(invalidOrigin>=0)throw Object.assign(Error('ORDER_ITEM_ORIGIN'),{itemIndex:invalidOrigin,productName:ps[invalidOrigin].data().name});
    tx.create(ref,{etaDate,supplier:supplier.trim(),notes,items:items.map((x,i)=>({...x,name:ps[i].data().name})),status:'requested',
      channel:'whatsapp',createdAt:now(),createdBy:user.uid,fingerprint,delivered:[],updatedAt:now()});
    newAudit(tx,db,'v3.order_created',unitId,user.uid,{orderId:requestId,etaDate,items});
   });
   return send(res,200,duplicate?'Pedido já registrado.':'Pedido registrado na agenda.',{id:requestId,duplicate});
  }
  if(action==='v3OrderStatus'){
   if(!roles.includes(member.role))return send(res,403,'Somente gerência altera pedidos.');
   const {orderId,status,etaDate=null}=req.body||{};
   if(!requestOk(orderId)||!['confirmed','overdue','cancelled'].includes(status)||etaDate!==null&&!dateOk(etaDate))return send(res,400,'Pedido ou situação inválida.');
   const ref=orders.doc(orderId);
   await db.runTransaction(async tx=>{
    const [actor,p]=await Promise.all([tx.get(actorRef),tx.get(ref)]);
    if(!verify(actor,unitId,roles))throw Error('FORBIDDEN');
    if(!p.exists)throw Error('NOT_FOUND');
    const old=p.data();if(!transitionOrder(old,status).ok)throw Error('INVALID_TRANSITION');
    tx.update(ref,{status,etaDate:etaDate||old.etaDate,updatedAt:now(),updatedBy:user.uid});
    newAudit(tx,db,'v3.order_status',unitId,user.uid,{orderId,before:old.status,after:status});
   });
   return send(res,200,'Situação da entrega atualizada.');
  }
  return send(res,400,'Ação desconhecida.');
 }catch(e){
  if(e.message==='ORDER_ITEM_UNAVAILABLE')return send(res,409,'O insumo da linha '+(e.itemIndex+1)+' está indisponível. Escolha um insumo ativo da unidade.',{code:e.message,itemIndex:e.itemIndex});
  if(e.message==='ORDER_ITEM_ORIGIN')return send(res,409,e.productName+' não está habilitado para pedidos. Confira a origem em Gestão de Insumos.',{code:e.message,itemIndex:e.itemIndex});
  const errors={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem autorização.'],NOT_FOUND:[404,'Insumo ou pedido inexistente.'],
   STALE:[409,'Configuração alterada por outra pessoa. Recarregue antes de salvar.'],INACTIVE:[409,'Insumo arquivado.'],UNIT_LOCKED:[409,'Existe saldo no novo controle. Recontagem e migração supervisionada são necessárias antes de trocar unidade.'],INVALID_SOURCE:[409,'Origem de preparação inválida ou indisponível.'],
   TOO_MANY:[409,'Há muitos registros para validar a operação.'],DUPLICATE_NAME:[409,'Esse nome ou sinônimo já identifica outro insumo. Revise para evitar duplicidade.'],PRODUCT_HAS_STOCK:[409,'Insumo com estoque registrado: reconcilie antes de arquivar.'],PRODUCT_HAS_PENDING:[409,'Há faltas ou pedidos em aberto para esse insumo. Resolva antes de arquivar.'],
   ALREADY_REPORTED:[409,'Sua sinalização já está aberta para este produto e local.'],CONFLICT:[409,'Identificador do pedido já utilizado.'],
   INVALID_TRANSITION:[409,'Transição de pedido incompatível com a situação atual.']};
  if(errors[e.message])return send(res,...errors[e.message]);
  if(sendQuotaError(res,e))return;console.error('V3 operation:',e.message);
  return send(res,500,'Não foi possível completar a operação.');
 }
}
