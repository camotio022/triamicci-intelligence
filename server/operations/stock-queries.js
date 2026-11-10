import {send} from '../_lib.js';
import {historyNames} from './history-names.js';
import {restaurantDay} from '../../shared/operation-day.js';
import {countUnit} from './logic.js';
const idPattern=/^[a-f0-9]{40}$/;
const physicalUnit=countUnit;
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const clean=doc=>({id:doc.id,...doc.data(),at:iso(doc.data().at)});
// Context is supplied by the authenticated dispatcher, never by request payload.
export default async function stockQueries(req,res,{db,unit}){
 const {action}=req.body||{};
  if(action==='productActivity'){
   const id=req.body?.productId;
   if(!idPattern.test(id||''))throw Error('INVALID');
   const product=await unit.collection('products').doc(id).get();
   if(!product.exists)throw Error('NOT_FOUND');
   const [receipts,counts,outflows,transfers,productions]=await Promise.all([
    unit.collection('physicalReceipts').where('productId','==',id).limit(100).get(),
    unit.collection('physicalCounts').where('productId','==',id).limit(100).get(),
    unit.collection('physicalOutflows').where('productId','==',id).limit(100).get(),
    unit.collection('physicalTransfers').where('productId','==',id).limit(100).get(),
    unit.collection('productionRuns').orderBy('at','desc').limit(100).get()
   ]);
   const records=[...receipts.docs.map(d=>({...clean(d),kind:'receive'})),
     ...counts.docs.map(d=>({...clean(d),kind:'count'})),
     ...outflows.docs.map(d=>({...clean(d),kind:'dispatch'})),
     ...transfers.docs.map(d=>({...clean(d),kind:'transfer'})),
     ...productions.docs.filter(d=>d.data().items?.some(i=>i.productId===id)).map(d=>({...clean(d),kind:'production'}))]
     .sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,30);
   return send(res,200,'Atividade deste produto.',{records,
    limited:[receipts,counts,outflows,transfers,productions].some(x=>x.size===100)});
  }
  if(action==='lots'){
   const id=req.body?.productId;
   if(!idPattern.test(id||''))throw Error('INVALID');
   const product=await unit.collection('products').doc(id).get();
   if(!product.exists)throw Error('NOT_FOUND');
   const snap=await unit.collection('physicalLots').doc(id).collection('lots').orderBy('expiryDate').limit(100).get();
   return send(res,200,'Lotes de recebimento consultados.',{lots:snap.docs.map(d=>({id:d.id,...d.data()})),
    note:'Quantidades recebidas por lote. Não representam saldo disponível nem possuem baixa FEFO.'});
  }
  if(action==='summary'){
   const id=req.body?.productId;
   if(!idPattern.test(id||''))throw Error('INVALID');
   const p=await unit.collection('products').doc(id).get();
   if(!p.exists)throw Error('NOT_FOUND');
   const [catalogSnap,balanceSnap]=await Promise.all([
    p.data().catalogId?db.collection('productCatalog').doc(p.data().catalogId).get():Promise.resolve(null),
    unit.collection('physicalBalances').doc(id).get()
   ]);
   const unitName=physicalUnit(p.data(),catalogSnap?.data());
   const b=balanceSnap.data();
   if(b&&Number.isFinite(b.countedTotal)){
    const compatible=b.unit===unitName;
    return send(res,200,'Resumo físico carregado dos acumulados auditados.',{summary:{
     complete:compatible,reason:compatible?null:'A contagem está numa unidade diferente do catálogo.',
     unit:unitName,
     previous:{reserve:b.countedReserve,rotation:b.countedRotation,total:b.countedTotal,
      at:iso(b.at)},
     lastDelivery:b.lastDelivery||null,
     entriesSincePrevious:compatible?(b.entriesSinceCount||0):null,
     exitsSincePrevious:compatible?(b.exitsSinceCount||0):null
    }});
   }
   const [cSnap,rSnap,oSnap]=await Promise.all([
    unit.collection('physicalCounts').where('productId','==',id).limit(501).get(),
    unit.collection('physicalReceipts').where('productId','==',id).limit(501).get(),
    unit.collection('physicalOutflows').where('productId','==',id).limit(501).get()
   ]);
   if(cSnap.size>500||rSnap.size>500||oSnap.size>500)return send(res,200,'Histórico muito extenso para conciliação simples.',{
    summary:{complete:false,reason:'Há mais de 500 registros. É necessário paginar para calcular com segurança.'}});
   const counts=cSnap.docs.map(x=>x.data()).sort((a,b)=>b.at.toMillis()-a.at.toMillis());
   const receipts=rSnap.docs.map(x=>x.data()).sort((a,b)=>b.at.toMillis()-a.at.toMillis());
   const outflows=oSnap.docs.map(x=>x.data());
   const last=counts[0]||null,lastDelivery=receipts[0]||null;
   const sinceLast=last?receipts.filter(x=>x.at.toMillis()>last.at.toMillis()):[];
   const compatible=!last||last.unit===unitName&&sinceLast.every(x=>x.unit===unitName);
   const incoming=compatible?sinceLast:[];
   const leaving=last?outflows.filter(x=>x.at.toMillis()>last.at.toMillis()):[];
   const allCompatible=compatible&&leaving.every(x=>x.unit===unitName);
   return send(res,200,'Resumo físico consultado.',{summary:{
    complete:allCompatible,reason:allCompatible?null:'A última contagem ou as entregas posteriores têm unidades diferentes; não converter automaticamente.',
    unit:unitName,previous: last?{reserve:last.reserve,rotation:last.rotation,
      total:last.reserve+last.rotation,at:iso(last.at)}:null,
    lastDelivery:lastDelivery?{physicalQuantity:lastDelivery.physicalQuantity,unit:lastDelivery.unit,
      at:iso(lastDelivery.at),supplier:lastDelivery.supplier}:null,
    entriesSincePrevious:last&&allCompatible?Number(incoming.reduce((n,x)=>n+x.physicalQuantity,0).toFixed(3)):null,
    exitsSincePrevious:last&&allCompatible?Number(leaving.reduce((n,x)=>n+x.quantity,0).toFixed(3)):null
   }});
  }
  if(action==='list'){
   const size=req.body?.preview===true?5:30;
   const types=[['receipts','physicalReceipts'],['counts','physicalCounts'],
    ['outflows','physicalOutflows'],['transfers','physicalTransfers'],['productions','productionRuns']];
   const result={};
   await Promise.all(types.map(async([key,col])=>{
    if(req.body?.['skip'+key]){result[key]=[];result['hasMore_'+key]=false;return}
    const before=req.body?.['before_'+key];
    if(before!==undefined&&(typeof before!=='string'||!Number.isFinite(Date.parse(before))))throw Error('INVALID');
    let q=unit.collection(col).orderBy('at','desc');
    if(req.body?.todayOnly===true){const start=new Date(restaurantDay()+'T03:00:00Z');q=q.where('at','>=',start).where('at','<',new Date(start.getTime()+86400000));}
    if(before)q=q.where('at','<',new Date(before));
    const snap=await q.limit(size+1).get();
    result[key]=snap.docs.slice(0,size).map(clean);
    result['hasMore_'+key]=snap.size>size;
   }));
   return send(res,200,'Histórico físico carregado.',await historyNames(db,unit,result));
  }
}
