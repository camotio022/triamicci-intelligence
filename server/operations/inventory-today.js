import dailyReport from './daily-report.js';
import {getDb,authenticate,membership,checkRequest,send} from '../_lib.js';
const iso=x=>x?.toDate?.()?.toISOString?.()||null;
const dayInUnit=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
export default async function handler(req,res){
 if(!checkRequest(req,res))return;
 res.setHeader('Cache-Control','no-store');
 try{
  const actor=await authenticate(req),m=await membership(actor.uid);
  if(!m?.unitId)return send(res,403,'Vínculo ativo obrigatório.');
  if(req.body?.action!=='todayCounts')return send(res,400,'Ação inválida.');
  const today=dayInUnit(new Date());
  const root=getDb().collection('units').doc(m.unitId);
  const before=req.body?.before;
  if(before!==undefined&&!/^[a-f0-9]{40}$/.test(before))return send(res,400,'Cursor inválido.');
  const start=new Date(today+'T03:00:00Z');
  let query=root.collection('physicalBalances').where('at','>=',start).orderBy('at','desc').orderBy('__name__','desc');
  if(before){const cursor=await root.collection('physicalBalances').doc(before).get();if(!cursor.exists)return send(res,400,'Cursor não encontrado.');query=query.startAfter(cursor);}
  const snap=await query.limit(13).get(),selected=snap.docs.slice(0,12),products=[];
  for(let i=0;i<selected.length;i+=4){const batch=await Promise.all(selected.slice(i,i+4).map(async doc=>{
   const p=await root.collection('products').doc(doc.id).get();let data=null,status=200;
   await dailyReport({...req,body:{action:'dailyReport',productId:doc.id}},{setHeader(){},status(c){status=c;return this},json(d){data=d;return this}});
   const report=data?.report;
   return {productId:doc.id,name:p.data()?.name||'Produto indisponível',at:iso(doc.data().at),countId:doc.data().countId||null,state:status!==200||!data?.complete||!report?'unavailable':report.status==='NO_PREVIOUS_COUNT'?'history':report.divergence?'investigate':'clear',report};
  }));products.push(...batch);}
  return send(res,200,'Produtos contados hoje com apuração.',{day:today,products,complete:true,hasMore:snap.size>12,nextCursor:snap.size>12?selected.at(-1).id:null});
 }catch(e){
  console.error('Inventory today:',e.message);
  return send(res,500,'Não foi possível listar as contagens de hoje.');
 }
}
