import {evaluateOperationalDay} from './operational.js';
import {projectCoverage} from '../../src/coverage-board-state.js';
import {queuePush} from '../push/delivery.js';

const place={cozinha:'Cozinha',frente:'Frente'};
const shift={manha:'Manhã',noite:'Noite'};
export const alertStaff=doc=>({uid:doc.id,...doc.data()});

export function writeCoverageAlerts({tx,db,unit,unitId,planId,dates,entries,people,requirements,policy,prior,proposals=[],now,reference,notify=true,affected=null}){
 const existing=new Map(prior.docs.map(doc=>[doc.id,doc.data()]));
 const changed=[];
 for(const date of dates){
  const day=evaluateOperationalDay({date,entries,people,requirements,policy});
  for(const row of day.shifts){
   if(affected&&(row.shift!==affected.shift||row.sector!==affected.sector))continue;
   const id=[planId,date,row.shift,row.sector].join('_');
   const previous=existing.get(id);
   const matching=proposals.filter(p=>p.planId===planId&&p.date===date&&p.shift===row.shift&&p.sector===row.sector);
   const intervals=day.intervals.filter(item=>item.deficit&&(item.sector===row.sector||row.sector==='frente'&&['caixa','apoio','gestao'].includes(item.sector))&&
    row.window&&item.start<row.window.end&&item.end>row.window.start);
   const recurring=day.recurring.filter(item=>item.sector===row.sector&&item.shift===row.shift);
   const impact=projectCoverage(row,matching,intervals,recurring);
   const reason=[impact.headcountGap?impact.headcountGap+' vaga(s)':'',
    impact.roleGap?(row.sector==='cozinha'?'Falta cozinheiro':'Falta gestão'):'',
    impact.skillGap?'Montagem insuficiente':'',intervals.length?'Mínimo por horário em falta':'',
    recurring.some(item=>!item.available&&!matching.some(p=>p.staffId===item.uid&&['approved','completed','paid'].includes(p.status)))?'Cobertura fixa indisponível':''].filter(Boolean).join(' · ');
   const open=(Boolean(row.window)&&Boolean(reason))||(!row.window&&previous?.status==='open');
   if(!open&&previous?.status!=='open')continue;
   const state=open?'open':'resolved';
   const message=reason||previous?.reason||'';
   if(previous?.status===state&&previous.reason===message)continue;
   const alert={planId,date,shift:row.shift,sector:row.sector,reason:message,status:state,updatedAt:now};
   tx.set(unit.collection('coverageAlerts').doc(id),alert,{merge:true});
   if(open)changed.push(alert);
  }
 }
 if(notify&&changed.length){
  const first=changed[0];
  queuePush(tx,db,unitId,'coverage_alert_'+reference,{audience:'managers',title:'Cobertura precisa de atenção',page:'coverage',
   message:first.date.split('-').reverse().join('/')+' · '+place[first.sector]+' · '+shift[first.shift]+' · '+first.reason+
    (changed.length>1?' · Veja também os outros turnos sinalizados.':''),
   coverage:{planId,date:first.date,shift:first.shift,sector:first.sector}});
 }
 return changed.length>0&&notify?'coverage_alert_'+reference:null;
}
