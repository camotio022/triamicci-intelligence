import {reportFromSnapshot} from './inventory-summary.js';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {countUnit} from './logic.js';
import {calculateDailyInventory} from './daily-inventory.js';

const idPattern=/^[a-f0-9]{40}$/;
const timestamp=value=>value?.toDate?.()?.toISOString?.()||null;
const row=(doc,unit)=>({id:doc.id,...doc.data(),at:timestamp(doc.data().at),unit:doc.data().unit||unit});
async function scan(query,visit){
 let cursor=null;
 for(;;){const page=await (cursor?query.orderBy('__name__').startAfter(cursor):query.orderBy('__name__')).limit(200).get();for(const doc of page.docs)visit(doc);if(page.size<200)return;cursor=page.docs.at(-1);}
}
export default async function dailyReport(req,res) {
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try {
  const actor=await authenticate(req), member=await membership(actor.uid);
  if(!member?.unitId)return send(res,403,'Vínculo ativo necessário.');
  const {productId}=req.body||{};
  if(!idPattern.test(productId||''))return send(res,400,'Produto inválido.');
  const db=getDb(),root=db.collection('units').doc(member.unitId);
  const product=await root.collection('products').doc(productId).get();
  if(!product.exists)return send(res,404,'Produto não encontrado nesta unidade.');
  const catalog=product.data().catalogId?
    await db.collection('productCatalog').doc(product.data().catalogId).get():null;
  const unit=countUnit(product.data(),catalog?.data());
  const balance=await root.collection('physicalBalances').doc(productId).get();
  if(balance.data()?.countId){const count=await root.collection('physicalCounts').doc(balance.data().countId).get();if(count.exists&&count.data().productId===productId&&count.data().unit===unit&&count.data().inventorySummary){try{const report=reportFromSnapshot(count,productId,product.data().name);return send(res,200,'Apuração pelos acumulados transacionais.',{report,complete:true});}catch{return send(res,200,'Resumo incompatível. Revise contagens e unidades.',{report:null,complete:false,reason:'INCOMPATIBLE_SUMMARY'});}}}
  // Compatibility for experimental records predating transactional summaries: scan in bounded pages.
  const ordered=[];
  await scan(root.collection('physicalCounts').where('productId','==',productId),d=>{ordered.push(row(d,unit));ordered.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));ordered.splice(2);});
  if(!ordered.length)return send(res,200,'Sem contagem física.',{
   report:null,complete:true,reason:'NO_COUNT'});
  const current=ordered[0],previous=ordered[1]||null;
  if(previous && (!current.at||!previous.at||Date.parse(current.at)<=Date.parse(previous.at)))
   return send(res,200,'Contagens com datas ambíguas.',{report:null,complete:false,reason:'AMBIGUOUS_COUNT'});
  const between=r=>previous&&r.at&&Date.parse(r.at)>Date.parse(previous.at)&&Date.parse(r.at)<=Date.parse(current.at);
  let entryTotal=0,outflowTotal=0,latestEntry=null,compatible=true;
  const accumulate=(r,quantity,kind)=>{if(!between(r))return;if(r.unit!==unit||!Number.isFinite(quantity)||quantity<0){compatible=false;return;}if(kind==='entry'){entryTotal+=quantity;if(!latestEntry||Date.parse(r.at)>Date.parse(latestEntry.at))latestEntry={quantity,at:r.at};}else outflowTotal+=quantity;};
  await Promise.all([
   scan(root.collection('physicalReceipts').where('productId','==',productId),d=>{const r=row(d,unit);accumulate(r,r.physicalQuantity,'entry');}),
   scan(root.collection('physicalOutflows').where('productId','==',productId),d=>{const r=row(d,unit);accumulate(r,r.quantity,'outflow');}),
   scan(root.collection('productionRuns'),d=>{const r=d.data(),at=timestamp(r.at);for(const item of r.items||[])if(item.productId===productId)accumulate({at,unit:item.unit},item.quantity,'outflow');if(r.outputProductId===productId)accumulate({at,unit:r.outputUnit||unit},r.portions,'entry');})
  ]);
  if(!compatible)return send(res,200,'Histórico incompatível; confira as unidades.',{report:null,complete:false,reason:'INCOMPATIBLE_HISTORY'});
  const entries=previous?[{at:current.at,unit,quantity:Math.round(entryTotal*1000)/1000}]:[];
  const outflows=previous?[{at:current.at,unit,quantity:Math.round(outflowTotal*1000)/1000}]:[];
  try {
   const report=calculateDailyInventory({
    unit,current:{at:current.at,unit:current.unit,reserve:current.reserve,rotation:current.rotation},
    previous:previous?{at:previous.at,unit:previous.unit,reserve:previous.reserve,rotation:previous.rotation}:null,
    entries,outflows
   });
   return send(res,200,'Conciliação informativa; não altera saldos.',{
    report:{...report,latestEntry,productId,productName:product.data().name,
      currentAt:current.at,previousAt:previous?.at||null,
      currentCountId:current.id||null,previousCountId:previous?.id||null},
    complete:true});
  } catch(e) {
   if(['INVALID_UNIT','INVALID_CURRENT_COUNT','INVALID_PREVIOUS_COUNT',
     'INCOMPATIBLE_OR_OUT_OF_WINDOW_EVENT'].includes(e.message))
    return send(res,200,'Histórico incompatível; cálculo indisponível até conciliação.',{
     report:null,complete:false,reason:e.message});
   throw e;
  }
 }catch(e){
  if(e.message==='UNAUTHENTICATED')return send(res,401,'Faça login.');
  console.error('Daily inventory report:',e.message);
  return send(res,500,'Não foi possível apurar o inventário.');
 }
}
