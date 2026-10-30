// Read-only audit. Never chooses a winner, sums independent balances or writes data.
import {getDb} from '../server/_lib.js';
const unitId=process.argv[2];
if(!unitId||!/^[A-Za-z0-9_-]{1,128}$/.test(unitId))throw Error('Informe o identificador da unidade para a auditoria somente leitura.');
try{
 const unit=getDb().collection('units').doc(unitId);
 const [physical,operational]=await Promise.all([unit.collection('physicalBalances').limit(501).get(),unit.collection('v3PhysicalBalances').limit(501).get()]);
 if(physical.size>500||operational.size>500)throw Error('LIMIT_EXCEEDED: auditar com paginação antes de concluir.');
 const a=new Map(physical.docs.map(d=>[d.id,d.data()])),b=new Map(operational.docs.map(d=>[d.id,d.data()]));
 const report={unitId,physicalOnly:[],operationalOnly:[],matching:[],conflicting:[]};
 for(const id of new Set([...a.keys(),...b.keys()])){
  if(!a.has(id)){report.operationalOnly.push(id);continue;}
  if(!b.has(id)){report.physicalOnly.push(id);continue;}
  const p=a.get(id),v=b.get(id);
  const same=p.unit===v.unit&&p.reserve===v.reserva&&p.rotation===v.giro&&p.total===v.total;
  report[same?'matching':'conflicting'].push(id);
 }
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}catch(e){process.stderr.write('Auditoria não concluída: '+e.message+'\n');process.exitCode=1;}
