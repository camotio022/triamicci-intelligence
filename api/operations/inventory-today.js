import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';
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
  // Bounded scan: refuse to assert a complete list when pagination is needed.
  const snaps=await root.collection('physicalCounts').orderBy('at','desc').limit(401).get();
  const limited=snaps.size===401;
  const rows=[];
  for(const doc of snaps.docs){
   const d=doc.data(),at=iso(d.at);
   if(!at||dayInUnit(at)!==today)continue;
   if(!/^[a-f0-9]{40}$/.test(d.productId||''))continue;
   rows.push({productId:d.productId,at,countId:doc.id});
  }
  const latest=new Map();
  for(const row of rows){if(!latest.has(row.productId))latest.set(row.productId,row);}
  const products=await Promise.all([...latest.values()].map(async row=>{
   const doc=await root.collection('products').doc(row.productId).get();
   return {...row,name:doc.exists?doc.data().name||row.productId:'Produto indisponível'};
  }));
  products.sort((a,b)=>b.at.localeCompare(a.at));
  return send(res,200,limited?'Lista parcial: muitas contagens, refine a consulta.':'Contagens do dia carregadas.',{
   day:today,products,complete:!limited,hasMore:limited});
 }catch(e){
  console.error('Inventory today:',e.message);
  return send(res,500,'Não foi possível listar as contagens de hoje.');
 }
}
