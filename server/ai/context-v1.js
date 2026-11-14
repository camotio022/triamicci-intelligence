import {restaurantDay} from '../../shared/operation-day.js';
import {aiAllowed} from './permissions-v1.js';
import {operationalContext} from './operational-context.js';

const DAY=()=>restaurantDay(new Date());
const str=(v,n=80)=>typeof v==='string'?v.slice(0,n):'';
const iso=v=>v?.toDate?.()?.toISOString?.()||null;
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function classifyAiV1(question){
 const s=String(question).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return {
  stock:/estoque|saldo|inventario|insumo|compra|repor|reposic|falta|desperdic|divergenc/.test(s),
  production:/produc|prepar|porcion|cozinha|prioridade|planej/.test(s),
  schedules:/escala|turno|folga|dobr|cobertura|plantao|disponib/.test(s),
  attendance:/presen|ponto|entrada|saida|trabalhando agora|dobr|cobertura/.test(s),
  sessions:/logad|conectad|sessao ativa|online agora/.test(s),
  team:/equipe|colaborador|funcionario|pessoal|cargo|funcao|disponib|dobr/.test(s),
  receiving:/receb|entrega|fornecedor|pedido de mercadoria/.test(s),
  history:/historico|ocorrencia|movimentac|auditoria/.test(s),
  checklists:/checklist|abertura|fechamento/.test(s)
 };
}
const weekdays=['dom','seg','ter','qua','qui','sex','sab'];
const weekdayOf=date=>weekdays[new Date(date+'T12:00:00Z').getUTCDay()];
const slotFor=(person,date)=>(
 Array.isArray(person?.professional?.availability)?person.professional.availability:
 Array.isArray(person?.availability)?person.availability:[]
).find(slot=>slot.day===weekdayOf(date))||null;
const safeHour=value=>/^([01]\\d|2[0-3]):[0-5]\\d$/.test(value||'')?value:null;
export function rosterDirectory(docs){
 const people=docs.map(d=>({id:d.id,data:d.data()}));
 const byId=new Map(people.map(p=>[p.id,p.data]));
 for(const p of people){
  if(p.data?.accountUid && !byId.has(p.data.accountUid))byId.set(p.data.accountUid,p.data);
 }
 return byId;
}
export function summarizeScheduleDocs(docs,directory,date,limit=15){
 return docs.slice(0,limit).filter(d=>d.data().status==='published'&&!d.data().archivedAt).map(d=>({
  status:'published',date,entries:(d.data().entries||[]).filter(e=>e.date===date).slice(0,60).map(e=>{
   const p=directory.get(e.uid);
   const slot=slotFor(p,date);
   return {
    name:str(p?.name||'Colaborador sem identificação confirmada',90),
    role:str(p?.jobTitle||p?.professional?.jobTitle||'',60),
    sector:str(p?.sector||p?.professional?.sector||'',32),
    shift:str(p?.shift||'',24),
    status:['work','off','leave','monthly_sunday'].includes(e.type)?e.type:'não identificado',
    plannedStart:safeHour(e.start)||safeHour(slot?.start),
    plannedEnd:safeHour(e.end)||safeHour(slot?.end),
    timeSource:(safeHour(e.start)&&safeHour(e.end))?'escala':(safeHour(slot?.start)&&safeHour(slot?.end))?'disponibilidade habitual':'não informado',
    nameConfirmed:Boolean(p?.name)
   };
  })
 }));
}

export async function aiV1Context(db,member,question){
 const intents=classifyAiV1(question),unit=db.collection('units').doc(member.unitId),sections=[];
 let staffCache;
 const staff=async()=>staffCache??=(await unit.collection('staffRegistry').limit(201).get());
 const base={scope:'Somente unidade autenticada; informações minimizadas; nenhuma ação operacional',day:DAY(),sections,unavailable:[]};
 // Never expose all modules in one prompt; cap the number of consulted modules.
 const requested=Object.keys(intents).filter(k=>intents[k]);
 if(requested.length>4){base.unavailable.push('Pergunta ampla: consulte até quatro assuntos por vez.');return base;}
 for(const kind of requested){
  if(!aiAllowed(member.role,kind)){base.unavailable.push(kind+': permissão insuficiente');continue;}
  if(['stock','production'].includes(kind)){
   // Existing bounded, unit-scoped context includes missing balance markers.
   const result=await operationalContext(db,member.unitId,kind==='stock'?'estoque':'produção');
   sections.push(...result.sections);continue;
  }
  if(kind==='schedules'){
   const period=DAY().slice(0,7);
   const [snap,staffSnap]=await Promise.all([unit.collection('schedules').where('period','==',period).limit(16).get(),staff()]);
   const directory=rosterDirectory(staffSnap.docs);
   sections.push({kind,period,date:DAY(),source:'escala publicada cruzada com cadastro da equipe da própria unidade; horários de disponibilidade habitual são previsão, não ponto real',
    incomplete:snap.size>=16||staffSnap.size>200,
    records:summarizeScheduleDocs(snap.docs,directory,DAY()),
    ...(snap.size===0?{note:'Nenhuma escala do mês encontrada.'}:{})});continue;
  }
  if(kind==='attendance'){
   const [snap,staffSnap]=await Promise.all([unit.collection('attendanceV31').where('day','==',DAY()).limit(61).get(),staff()]);
   const directory=rosterDirectory(staffSnap.docs);
   sections.push({kind,day:DAY(),source:'registros de ponto; não prova presença física ou disponibilidade',
    incomplete:snap.size>=61||staffSnap.size>200,records:snap.docs.slice(0,60).map(d=>{
     const p=directory.get(d.data().uid);
     return {name:str(p?.name||'Colaborador sem identificação confirmada',90),
      status:str(d.data().status,24),updatedAt:iso(d.data().updatedAt)};
    })});continue;
  }
  if(kind==='team'){
   const snap=await staff();
   sections.push({kind,source:'cadastro de equipe; disponibilidade prevista não é aceitação de dobra',
    incomplete:snap.size>200,people:snap.docs.slice(0,60).filter(d=>d.data().status==='active').map(d=>({
      name:str(d.data().name,90),jobTitle:str(d.data().jobTitle,60),
      sector:str(d.data().sector,40),shift:str(d.data().shift,24),
      availability:Array.isArray(d.data().availability)?d.data().availability.slice(0,7).map(a=>({day:str(a.day,4),start:str(a.start,5),end:str(a.end,5)})):[]
    }))});continue;
  }
  if(kind==='receiving'){
   const [ship,orders]=await Promise.all([
    unit.collection('receiptShipments').orderBy('createdAt','desc').limit(21).get(),
    unit.collection('purchaseOrdersV3').limit(21).get()]);
   sections.push({kind,source:'conferências e pedidos registrados; dados parciais',
    incomplete:ship.size>20||orders.size>20,
    shipments:ship.docs.slice(0,20).map(d=>({status:str(d.data().status,24),createdAt:iso(d.data().createdAt),itemCount:Array.isArray(d.data().lines)?d.data().lines.length:0})),
    orders:orders.docs.slice(0,20).map(d=>({status:str(d.data().status,24),itemCount:Array.isArray(d.data().items)?d.data().items.length:0}))});continue;
  }
  if(kind==='checklists'){
   const snap=await unit.collection('checklistRuns').where('day','==',DAY()).limit(31).get();
   sections.push({kind,source:'checklists registrados no dia, sem fotos ou respostas privadas',
    incomplete:snap.size>30,
    runs:snap.docs.slice(0,30).map(d=>({name:str(d.data().model?.name,80),day:DAY(),status:str(d.data().status,24),itemCount:d.data().model?.items?.length||0,answeredCount:Object.keys(d.data().answers||{}).length}))});continue;
  }
  if(kind==='history'){
   const snap=await unit.collection('productionRuns').orderBy('at','desc').limit(21).get();
   sections.push({kind,source:'amostra dos últimos registros de produção, não todo o histórico',
    incomplete:snap.size>20,events:snap.docs.slice(0,20).map(d=>({at:iso(d.data().at),recipeId:str(d.data().recipeId,64),portions:number(d.data().portions)}))});continue;
  }
  if(kind==='sessions'){
   // Do not equate auth, an open session, active terminal and physical presence.
   base.unavailable.push('Sessões ativas: sem fonte de presença online confiável e validada. Não atribuir usuários como online.');continue;
  }
 }
 if(!requested.length)base.unavailable.push('Pergunta sem módulo operacional identificado: não inferir dados da loja.');
 return base;
}
