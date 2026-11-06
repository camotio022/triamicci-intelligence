import {createHash} from 'node:crypto';
import {scheduledOn} from './rules.js';
import {signalUnitChange} from '../live-signal.js';
export const dailyRunId=(templateId,day)=>createHash('sha256').update(templateId+'|'+day+'|daily').digest('hex').slice(0,40);
// Also used by the optional daily worker so unstarted routines appear in history.
export async function ensureDailyRun(db,unit,templateId,day,{apply=true}={}){
 const templateRef=unit.collection('checklistTemplates').doc(templateId),ref=unit.collection('checklistRuns').doc(dailyRunId(templateId,day));
 return db.runTransaction(async tx=>{
  const [template,old,count]=await Promise.all([tx.get(templateRef),tx.get(ref),tx.get(unit.collection('checklistDays').doc(day))]);
  const data=template.data();if(old.exists||!data?.published||data.archived||!scheduledOn(data.published,day))return false;
  if((count.data()?.runs||0)>=100)throw Error('LIMIT');
  if(!apply)return true;
  const now=new Date();tx.create(ref,{templateId,templateVersion:data.version,model:data.published,day,answers:{},revision:0,createdAt:now,createdBy:'system',unitId:unit.id});
  tx.set(count.ref,{runs:(count.data()?.runs||0)+1},{merge:true});
  signalUnitChange(tx,db,unit.id,['checklists']);return true;
 });
}
