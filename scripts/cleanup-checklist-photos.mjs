import {getDb} from '../server/_lib.js';
import {cleanupPhoto} from '../server/checklists/cleanup.js';
const apply=process.argv.includes('--apply');
if(!process.env.FIREBASE_EXPECTED_PROJECT_ID)throw Error('FIREBASE_EXPECTED_PROJECT_ID obrigatório.');
const db=getDb(),now=new Date();let cursor=null,total=0,deleted=0;
// Scan bounded pages. Includes interrupted deletions/uploads, but never deletes held evidence.
for(let page=0;page<100;page++){
 let query=db.collectionGroup('checklistPhotos').where('cleanupAt','<=',now).orderBy('cleanupAt').orderBy('__name__').limit(100);if(cursor)query=query.startAfter(cursor);
 const snap=await query.get();
 for(const doc of snap.docs){if(!/^units\/[^/]+\/checklistPhotos\/[^/]+$/.test(doc.ref.path))continue;const result=await cleanupPhoto(db,doc.ref,{apply,now});total+=Number(result.eligible);deleted+=Number(result.deleted);}
 if(snap.size<100)break;cursor=snap.docs.at(-1);
 if(page===99)throw Error('Limite de limpeza atingido. Execute novamente para continuar.');
}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',eligible:total,deleted}));
