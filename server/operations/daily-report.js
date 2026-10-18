import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
import {countUnit} from './logic.js';
import {calculateDailyInventory} from './daily-inventory.js';

const idPattern=/^[a-f0-9]{40}$/;
const timestamp=value=>value?.toDate?.()?.toISOString?.()||null;
const row=(doc,unit)=>({id:doc.id,...doc.data(),at:timestamp(doc.data().at),unit:doc.data().unit||unit});
const LIMIT=501;
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
  const [counts,receipts,exits,productions]=await Promise.all([
   root.collection('physicalCounts').where('productId','==',productId).limit(LIMIT).get(),
   root.collection('physicalReceipts').where('productId','==',productId).limit(LIMIT).get(),
   root.collection('physicalOutflows').where('productId','==',productId).limit(LIMIT).get(),
   root.collection('productionRuns').limit(LIMIT).get()
  ]);
  if([counts,receipts,exits,productions].some(s=>s.size===LIMIT))
   return send(res,200,'Histórico incompleto: cálculo bloqueado até consulta paginada.',{
    report:null,complete:false,reason:'LIMITED_HISTORY'});
  const ordered=counts.docs.map(d=>row(d,unit)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  if(!ordered.length)return send(res,200,'Sem contagem física.',{
   report:null,complete:true,reason:'NO_COUNT'});
  const current=ordered[0],previous=ordered[1]||null;
  if(previous && (!current.at||!previous.at||Date.parse(current.at)<=Date.parse(previous.at)))
   return send(res,200,'Contagens com datas ambíguas.',{report:null,complete:false,reason:'AMBIGUOUS_COUNT'});
  const between=r=>previous&&r.at&&Date.parse(r.at)>Date.parse(previous.at)&&Date.parse(r.at)<=Date.parse(current.at);
  const entries=receipts.docs.map(d=>row(d,unit)).filter(between).map(r=>({
    at:r.at,unit:r.unit,quantity:r.physicalQuantity}));
  const outflows=exits.docs.map(d=>row(d,unit)).filter(between).map(r=>({
    at:r.at,unit:r.unit,quantity:r.quantity}));
  for(const run of productions.docs) {
   const r=run.data(),at=timestamp(r.at);
   if(!previous||!between({at}))continue;
   for(const item of r.items||[])if(item.productId===productId)
    outflows.push({at,unit:item.unit,quantity:item.quantity});
  }
  try {
   const report=calculateDailyInventory({
    unit,current:{at:current.at,unit:current.unit,reserve:current.reserve,rotation:current.rotation},
    previous:previous?{at:previous.at,unit:previous.unit,reserve:previous.reserve,rotation:previous.rotation}:null,
    entries,outflows
   });
   return send(res,200,'Conciliação informativa; não altera saldos.',{
    report:{...report,productId,productName:product.data().name,
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
