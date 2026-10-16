import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';

const allowedUnits = new Set(['kg','L','un']);
const genericIds = new Set(['queijos','massas','hortifruti','temperos']);
const hashId = name => createHash('sha256').update(name.trim().toLocaleLowerCase('pt-BR')).digest('hex').slice(0,40);

export default async function handler(req,res){
  if(!checkRequest(req,res))return;
  res.setHeader('Cache-Control','no-store');
  try{
    const actor=await authenticate(req);
    const m=await membership(actor.uid);
    if(!m?.unitId)return send(res,403,'Vínculo ativo necessário.');
    const db=getDb(), catalog=db.collection('productCatalog');
    if(req.body?.action==='list'){
      const snap=await catalog.limit(201).get();
      if(snap.size>200)return send(res,409,'Catálogo acima do limite de 200 itens.');
      const items=snap.docs.map(doc=>{
        const p=doc.data();
        return {id:doc.id,name:p.name,category:p.category,stockUnit:p.stockUnit,
          type:p.type,trackExpiry:p.trackExpiry===true,relatedProducts:p.relatedProducts||[],
          producedFrom:p.producedFrom||[],notes:p.notes||'',active:p.active===true,
          reviewRequired:p.active!==true || genericIds.has(doc.id)};
      }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      return send(res,200,'Catálogo central carregado.',{catalog:items});
    }
    if(req.body?.action!=='attach')return send(res,400,'Ação inválida.');
    if(!['admin','manager'].includes(m.role))return send(res,403,'Acesso restrito à administração.');
    const {catalogId,minStock}=req.body;
    if(typeof catalogId!=='string'||!/^[a-z0-9-]{2,80}$/.test(catalogId)||
       typeof minStock!=='number'||!Number.isFinite(minStock)||minStock<0||minStock>100000000)
      return send(res,400,'Produto ou estoque mínimo inválido.');
    const catalogRef=catalog.doc(catalogId), actorRef=db.doc('memberships/'+actor.uid);
    const unitProducts=db.collection('units').doc(m.unitId).collection('products');
    const auditRef=db.collection('auditLogs').doc();
    const now=new Date();
    let id;
    await db.runTransaction(async tx=>{
      const [memberSnap,catSnap]=await Promise.all([tx.get(actorRef),tx.get(catalogRef)]);
      const current=memberSnap.data();
      if(!current||current.status!=='active'||current.unitId!==m.unitId||
         !['admin','manager'].includes(current.role))throw new Error('FORBIDDEN');
      if(!catSnap.exists)throw new Error('NOT_FOUND');
      const p=catSnap.data();
      if(p.active!==true||genericIds.has(catalogId))throw new Error('NOT_APPROVED');
      if(typeof p.name!=='string'||!allowedUnits.has(p.stockUnit)||
         typeof p.category!=='string'||typeof p.trackExpiry!=='boolean')throw new Error('INVALID_CATALOG');
      id=hashId(p.name);
      const productRef=unitProducts.doc(id);
      const existing=await tx.get(productRef);
      if(existing.exists)throw new Error('DUPLICATE');
      const record={name:p.name,category:p.category,unit:p.stockUnit,minStock,
        trackExpiry:p.trackExpiry,quantity:0,status:'active',catalogId,
        productType:p.type||'raw',relatedCatalogIds:p.relatedProducts||[],
        createdAt:now,createdBy:actor.uid,updatedAt:now};
      tx.create(productRef,record);
      tx.create(auditRef,{event:'product.attached_from_catalog',unitId:m.unitId,actorUid:actor.uid,
        productId:id,catalogId,at:now});
    });
    return send(res,201,'Produto vinculado à unidade com saldo inicial zero.',{id});
  }catch(e){
    if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
    if(e.message==='FORBIDDEN')return send(res,403,'Sem permissão.');
    if(e.message==='NOT_FOUND')return send(res,404,'Produto não encontrado no catálogo central.');
    if(e.message==='NOT_APPROVED')return send(res,409,'Produto ainda não aprovado no catálogo central.');
    if(e.message==='INVALID_CATALOG')return send(res,409,'Produto central precisa de revisão técnica.');
    if(e.message==='DUPLICATE')return send(res,409,'Este produto já está cadastrado na unidade.');
    console.error('Catalog attach:',e.message);
    return send(res,500,'Falha ao consultar ou vincular catálogo.');
  }
}
