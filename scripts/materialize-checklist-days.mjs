import {getDb} from '../server/_lib.js';
import {unitDay} from '../server/schedules/temporal-policy.js';
import {ensureDailyRun} from '../server/checklists/routine.js';
if(!process.env.FIREBASE_EXPECTED_PROJECT_ID)throw Error('FIREBASE_EXPECTED_PROJECT_ID obrigatório.');
const db=getDb(),day=unitDay(),apply=process.argv.includes('--apply');let cursor=null,created=0;
for(let page=0;page<100;page++){
 let query=db.collectionGroup('checklistTemplates').orderBy('__name__').limit(100);if(cursor)query=query.startAfter(cursor);
 const snap=await query.get();
 for(const doc of snap.docs){if(!/^units\/[^/]+\/checklistTemplates\/[^/]+$/.test(doc.ref.path))continue;created+=Number(await ensureDailyRun(db,doc.ref.parent.parent,doc.id,day,{apply}));}
 if(snap.size<100)break;cursor=snap.docs.at(-1);if(page===99)throw Error('Limite de 10.000 modelos atingido; revisar paginação do worker.');
}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',day,created}));
