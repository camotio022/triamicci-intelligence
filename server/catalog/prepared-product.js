import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {countUnit} from '../operations/logic.js';
import {sendQuotaError} from '../quota-error.js';
import {signalUnitChange} from '../live-signal.js';
import {normalizeProductName,OPERATIONAL_CATALOG_VERSION,operationalProfileFor} from '../operations/catalog-identity.js';
const management=m=>m?.status==='active'&&['admin','manager','submanager'].includes(m.role);
export function validatePreparedProduct(p){
 if(!p||typeof p.name!=='string'||p.name.trim().length<3||p.name.length>100||typeof p.category!=='string'||p.category.trim().length<2||p.category.length>60)return 'Informe nome e categoria do insumo preparado.';
 if(!['porcao','un','kg','g','L','ml'].includes(p.unit)||typeof p.minStock!=='number'||!Number.isFinite(p.minStock)||p.minStock<0||p.minStock>100000||(['porcao','un'].includes(p.unit)&&!Number.isInteger(p.minStock)))return 'Revise a unidade de contagem e o estoque mínimo.';
 if(typeof p.trackExpiry!=='boolean'||!['daily','weekly','on_demand'].includes(p.countFrequency)||p.reviewConfirmed!==true)return 'Confira a validade, a frequência e confirme a revisão do cadastro.';
 if(p.portionWeight!==null&&(!(typeof p.portionWeight==='number'&&Number.isFinite(p.portionWeight)&&p.portionWeight>0&&p.portionWeight<=100000)||!['g','kg'].includes(p.weightUnit)||!['porcao','un'].includes(p.unit)))return 'Revise o peso padrão da porção.';
 if(p.existingProductId!==undefined&&(!/^[a-f0-9]{40}$/.test(p.existingProductId)||typeof p.expectedRevision!=='string'))return 'Selecione um cadastro existente após revisar.';
 if(typeof p.requestId!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(p.requestId))return 'Identificador do cadastro inválido.';
 return null;
}
export default async function preparedProduct(req,res){
 if(!checkRequest(req,res))return;res.setHeader('Cache-Control','no-store');
 let candidate;
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!management(m)||!m.unitId)return send(res,403,'Somente gestão pode cadastrar insumos preparados.');
  const p=req.body,invalid=validatePreparedProduct(p);if(invalid)return send(res,400,invalid);
  const name=p.name.trim().replace(/\s+/g,' '),category=p.category.trim().replace(/\s+/g,' '),identity=normalizeProductName(name);
  const id=p.existingProductId||createHash('sha256').update(identity).digest('hex').slice(0,40),db=getDb(),root=db.collection('units').doc(m.unitId),ref=root.collection('products').doc(id),now=new Date();
  const data={name,category,unit:p.unit==='porcao'?'un':p.unit,operationalUnitOverride:p.unit,minStock:p.minStock,trackExpiry:p.trackExpiry,lotTrackingMode:p.trackExpiry?'per_lot':'none',countFrequency:p.countFrequency,portionWeight:p.portionWeight,weightUnit:p.portionWeight===null?null:p.weightUnit,source:'internal',status:'active',reviewRequired:false,operationalCatalogVersion:OPERATIONAL_CATALOG_VERSION,operationalCatalogOrigin:'reviewed_prepared_product',quantity:0,critical:false,creationRequestId:p.requestId,createdAt:now,createdBy:actor.uid,updatedAt:now,profile:operationalProfileFor({name,source:'internal',operationalUnit:p.unit},actor.uid,now)};
  let duplicate=false,product;
  await db.runTransaction(async tx=>{
   const [member,catalog]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),tx.get(root.collection('products').limit(201))]);
   if(!management(member.data())||member.data().unitId!==m.unitId)throw Error('FORBIDDEN');
   const replay=catalog.docs.find(d=>d.data().creationRequestId===p.requestId||d.data().preparedReviewRequestId===p.requestId);
   if(replay){const old=replay.data();if(replay.id!==id||(old.preparedReviewBy||old.createdBy)!==actor.uid||['name','category','unit','operationalUnitOverride','minStock','trackExpiry','countFrequency','portionWeight','weightUnit'].some(k=>old[k]!==data[k]))throw Error('CONFLICT');duplicate=true;product={id:replay.id,...old,physicalUnit:countUnit(old)};return;}
   const match=catalog.docs.find(d=>d.id===id||[d.data().name,...(d.data().aliases||[]),...(d.data().profile?.aliases||[])].some(n=>normalizeProductName(n)===identity));
   if(match){
    const old=match.data(),central=old.catalogId?await tx.get(db.doc('productCatalog/'+old.catalogId)):null,balance=await tx.get(root.collection('physicalBalances').doc(match.id));
    const physicalUnit=countUnit(old,central?.data()),revision=`${match.updateTime.seconds}:${match.updateTime.nanoseconds}`;
    candidate={id:match.id,name:old.name,category:old.category||'Preparações',unit:physicalUnit,minStock:old.minStock||0,trackExpiry:old.trackExpiry===true,countFrequency:old.countFrequency||'weekly',portionWeight:old.portionWeight??null,weightUnit:old.weightUnit||'g',quantity:old.quantity??0,revision,physicalBalance:balance.exists?{total:balance.data().total,unit:balance.data().unit}:null};
    if(!p.existingProductId)throw Error('DUPLICATE');
    if(match.id!==p.existingProductId||revision!==p.expectedRevision||normalizeProductName(old.name)!==identity)throw Error('CONFLICT');
    if(p.unit!==physicalUnit||p.trackExpiry!==(old.trackExpiry===true)||(balance.exists&&balance.data().unit!==physicalUnit))throw Error('MIGRATION');
    const patch={...data,name:old.name,unit:old.unit,quantity:old.quantity??0,createdAt:old.createdAt||now,createdBy:old.createdBy||actor.uid,creationRequestId:old.creationRequestId||null,preparedReviewRequestId:p.requestId,preparedReviewBy:actor.uid,preparedReviewedAt:now,lotTrackingMode:old.lotTrackingMode||'legacy'};
    tx.set(ref,patch,{merge:true});product={id,...old,...patch,physicalUnit};
   }else{
    if(p.existingProductId)throw Error('CONFLICT');
    if(catalog.size>=200)throw Error('LIMIT');
    tx.create(ref,data);product={id,...data,physicalUnit:p.unit};
   }
   tx.create(db.collection('auditLogs').doc(),{event:p.existingProductId?'product.prepared_reviewed':'product.prepared_created',unitId:m.unitId,productId:id,actorUid:actor.uid,at:now,details:{name,unit:p.unit,portionWeight:p.portionWeight,trackExpiry:p.trackExpiry,changesBalance:false}});
   signalUnitChange(tx,db,m.unitId,['catalog','stock','production']);
  });
  return send(res,duplicate||p.existingProductId?200:201,p.existingProductId?'Cadastro existente validado. ID, histórico e saldos preservados.':'Insumo preparado cadastrado no catálogo da unidade. Nenhum saldo foi lançado.',{id,duplicate,product:{...product,physicalBalance:candidate?.physicalBalance||null}});
 }catch(e){const errors={UNAUTHENTICATED:[401,'Faça login.'],FORBIDDEN:[403,'Sem permissão para cadastrar nesta unidade.'],DUPLICATE:[409,'Já existe um insumo com este nome. Use o cadastro existente ou revise-o na Administração.'],CONFLICT:[409,'Este envio já foi utilizado com outros dados. Reabra o cadastro.'],MIGRATION:[409,'Unidade, validade ou saldo exigem migração revisada. Nenhum saldo foi alterado.'],LIMIT:[409,'Limite de 200 insumos atingido. Revise o catálogo antes de cadastrar.']};if(errors[e.message])return send(res,...errors[e.message],candidate?{candidate}:{});if(sendQuotaError(res,e))return;console.error('Prepared product:',e.message);return send(res,500,'Não foi possível cadastrar o insumo preparado.');}
}
