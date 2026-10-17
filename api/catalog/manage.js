import {createHash} from 'node:crypto';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';

const allowedUnits = new Set(['kg','L','un']);
const genericIds = new Set(['queijos','massas','hortifruti','temperos']);
const eligible=p=>p.schemaVersion===2&&p.reviewRequired!==true&&p.ingredientsPending!==true&&
  ['supplier','internal'].includes(p.source)&&
  ['kg','L','un'].includes(p.operationalUnit)&&
  (p.source==='internal'||['kg','L','un'].includes(p.receivingUnit));
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
          reviewRequired:p.active!==true || genericIds.has(doc.id),
          approvalEligible:!genericIds.has(doc.id)&&eligible(p),schemaVersion:p.schemaVersion||1,
          receivingUnit:p.receivingUnit||null,operationalUnit:p.operationalUnit||null};
      }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      return send(res,200,'Catálogo central carregado.',{catalog:items});
    }
    if(req.body?.action==='activateUnitCatalog'){
      if(m.role!=='admin')return send(res,403,'A ativação em lote exige administrador.');
      const docs=await catalog.limit(201).get();
      if(docs.size>200)return send(res,409,'Catálogo acima do limite de 200 itens; faça a ativação paginada.');
      if(docs.empty)return send(res,409,'Catálogo central vazio. Importe os produtos primeiro.');
      const unitProducts=db.collection('units').doc(m.unitId).collection('products');
      const refs=docs.docs.map(doc=>unitProducts.doc(hashId(doc.data().name||doc.id)));
      if(new Set(refs.map(ref=>ref.id)).size!==refs.length)return send(res,409,'Existem nomes duplicados no catálogo central. Revise antes da ativação.');
      const auditRef=db.collection('auditLogs').doc();
      let result;
      await db.runTransaction(async tx=>{
        const [memberSnap,...existingSnaps]=await Promise.all([tx.get(db.doc('memberships/'+actor.uid)),...refs.map(ref=>tx.get(ref))]);
        const current=memberSnap.data();
        if(!current||current.status!=='active'||current.unitId!==m.unitId||current.role!=='admin')throw Error('FORBIDDEN');
        const invalid=[],created=[],preserved=[],conflicts=[];
        for(let i=0;i<docs.docs.length;i++){
          const cat=docs.docs[i],p=cat.data(),ref=refs[i],existing=existingSnaps[i];
          if(typeof p.name!=='string'||p.name.trim().length<2||typeof p.category!=='string'||
             !allowedUnits.has(p.stockUnit)||typeof p.trackExpiry!=='boolean'){
            invalid.push(cat.id);continue;
          }
          if(existing.exists){
            if(existing.data().catalogId&&existing.data().catalogId!==cat.id){conflicts.push(cat.id);continue;}
            preserved.push(cat.id);
            if(existing.data().status!=='active')tx.update(ref,{status:'active',updatedAt:new Date(),updatedBy:actor.uid});
            continue;
          }
          created.push({id:cat.id,ref,data:{
            name:p.name,category:p.category,unit:p.stockUnit,minStock:0,
            trackExpiry:p.trackExpiry,quantity:0,status:'active',catalogId:cat.id,
            productType:p.type||'raw',relatedCatalogIds:p.relatedProducts||[],
            createdAt:new Date(),createdBy:actor.uid,updatedAt:new Date()
          }});
        }
        if(conflicts.length)throw Error('CATALOG_CONFLICT');
        if(invalid.length)throw Error('INVALID_CATALOG');
        for(const item of created)tx.create(item.ref,item.data);
        for(let i=0;i<docs.docs.length;i++){
          const cat=docs.docs[i];
          if(cat.data().active!==true)tx.update(cat.ref,{active:true,approvedBy:actor.uid,approvedAt:new Date()});
        }
        tx.create(auditRef,{event:'catalog.unit_bootstrapped',unitId:m.unitId,actorUid:actor.uid,
          catalogCount:docs.size,createdCount:created.length,preservedCount:preserved.length,
          createdCatalogIds:created.map(x=>x.id),at:new Date()});
        result={created:created.length,preserved:preserved.length,total:docs.size};
      });
      return send(res,200,'Produtos do catálogo disponibilizados à unidade; novos produtos começam em zero.',result);
    }
    if(req.body?.action==='approveBatch'){
      if(m.role!=='admin')return send(res,403,'Aprovação restrita ao administrador.');
      const ids=req.body.catalogIds;
      if(!Array.isArray(ids)||ids.length<1||ids.length>30||new Set(ids).size!==ids.length||
        ids.some(id=>typeof id!=='string'||!/^[a-z0-9-]{2,80}$/.test(id)||genericIds.has(id)))
        return send(res,400,'Selecione somente IDs específicos válidos e sem duplicatas.');
      const refs=ids.map(id=>catalog.doc(id));
      const actorRef=db.doc('memberships/'+actor.uid),now=new Date();
      const outcome={approved:[],alreadyActive:[],rejected:[]};
      await db.runTransaction(async tx=>{
        const [memberSnap,...snaps]=await Promise.all([tx.get(actorRef),...refs.map(ref=>tx.get(ref))]);
        const current=memberSnap.data();
        if(!current||current.status!=='active'||current.unitId!==m.unitId||current.role!=='admin')throw new Error('FORBIDDEN');
        for(let i=0;i<snaps.length;i++){
          const doc=snaps[i],id=ids[i];const product=doc.data();
          if(!doc.exists||typeof product.name!=='string'||!allowedUnits.has(product.stockUnit)||
           typeof product.category!=='string'||typeof product.trackExpiry!=='boolean'||
           !eligible(product)){
             outcome.rejected.push(id);continue;
          }
          if(product.active===true){outcome.alreadyActive.push(id);continue;}
          tx.update(refs[i],{active:true,approvedAt:now,approvedBy:actor.uid});
          tx.create(db.collection('auditLogs').doc(),{event:'catalog.approved_batch',catalogId:id,
           actorUid:actor.uid,unitId:m.unitId,at:now});
          outcome.approved.push(id);
        }
      });
      return send(res,200,'Revisão em lote concluída.',outcome);
    }
    if(req.body?.action==='approve'){
      if(m.role!=='admin')return send(res,403,'Aprovação restrita ao administrador.');
      const {catalogId}=req.body;
      if(typeof catalogId!=='string'||!/^[a-z0-9-]{2,80}$/.test(catalogId))
        return send(res,400,'Identificador inválido.');
      if(genericIds.has(catalogId))return send(res,409,'Item genérico: defina o produto específico antes de aprovar.');
      const catalogRef=catalog.doc(catalogId),actorRef=db.doc('memberships/'+actor.uid),auditRef=db.collection('auditLogs').doc();
      const now=new Date();
      await db.runTransaction(async tx=>{
        const [memberSnap,catSnap]=await Promise.all([tx.get(actorRef),tx.get(catalogRef)]);
        const current=memberSnap.data();
        if(!current||current.status!=='active'||current.unitId!==m.unitId||current.role!=='admin')throw new Error('FORBIDDEN');
        if(!catSnap.exists)throw new Error('NOT_FOUND');
        const p=catSnap.data();
        if(typeof p.name!=='string'||!allowedUnits.has(p.stockUnit)||typeof p.category!=='string'||
          typeof p.trackExpiry!=='boolean'||!eligible(p))throw new Error('INVALID_CATALOG');
        if(p.active===true)return;
        tx.update(catalogRef,{active:true,approvedAt:now,approvedBy:actor.uid});
        tx.create(auditRef,{event:'catalog.approved',unitId:m.unitId,catalogId,actorUid:actor.uid,at:now});
      });
      return send(res,200,'Produto aprovado no catálogo central.');
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
    if(e.message==='CATALOG_CONFLICT')return send(res,409,'Existe conflito entre IDs e produtos existentes; nenhum dado foi modificado.');
    if(e.message==='DUPLICATE')return send(res,409,'Este produto já está cadastrado na unidade.');
    console.error('Catalog attach:',e.message);
    return send(res,500,'Falha ao consultar ou vincular catálogo.');
  }
}
