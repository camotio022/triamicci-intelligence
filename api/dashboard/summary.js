import {getDb,authenticate,membership,checkRequest,send} from '../../server/_lib.js';

export default async function handler(req,res) {
  if(!checkRequest(req,res))return;
  res.setHeader('Cache-Control','no-store');
  try{
    const actor=await authenticate(req);
    const m=await membership(actor.uid);
    if(!m?.unitId)return send(res,403,'Acesso à unidade não autorizado.');
    const db=getDb();
    const unit=db.collection('units').doc(m.unitId);
    const end=new Date();
    const start=new Date(end.getTime()-7*86400000);
    const [productsSnap,movementsSnap]=await Promise.all([
      unit.collection('products').limit(201).get(),
      unit.collection('movements').where('at','>=',start).orderBy('at','asc').limit(1001).get()
    ]);
    if(productsSnap.size>200 || movementsSnap.size>1000)
      return send(res,409,'Dados acima do limite inicial do dashboard. É necessário paginar ou agregar os registros.');
    const products=productsSnap.docs.map(doc=>({id:doc.id,...doc.data()}));
    const active=products.filter(p=>p.status==='active');
    const low=active.filter(p=>typeof p.quantity==='number' && typeof p.minStock==='number' && p.quantity<=p.minStock);
    const movements=movementsSnap.docs.map(doc=>doc.data());
    const days=Array.from({length:7},(_,i)=>{
      const date=new Date(start.getTime()+(i+1)*86400000);
      const key=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
      return {key,day:new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'}).format(date),entry:0,exit:0};
    });
    const byDay=new Map(days.map(d=>[d.key,d]));
    for(const movement of movements){
      const date=movement.at?.toDate?.();
      if(!date)continue;
      const key=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
      const day=byDay.get(key);
      if(day && movement.type==='entry')day.entry++;
      if(day && movement.type==='exit')day.exit++;
    }
    const categories={};
    for(const p of active){const name=typeof p.category==='string'?p.category:'Outros';categories[name]=(categories[name]||0)+1;}
    return send(res,200,'Indicadores reais da unidade.',{
      generatedAt:end.toISOString(),productCount:products.length,activeCount:active.length,
      attentionCount:low.length,entries:movements.filter(x=>x.type==='entry').length,
      exits:movements.filter(x=>x.type==='exit').length,
      days,categories:Object.entries(categories).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),
      lowProducts:low.sort((a,b)=>(a.quantity||0)-(b.quantity||0)).slice(0,10)
        .map(p=>({id:p.id,name:p.name,category:p.category,quantity:p.quantity,unit:p.unit,minStock:p.minStock}))
    });
  }catch(e){
    if(e.message==='UNAUTHENTICATED')return send(res,401,'Entre com Google.');
    console.error('Dashboard summary:',e.message);
    return send(res,500,'Não foi possível carregar o dashboard.');
  }
}
