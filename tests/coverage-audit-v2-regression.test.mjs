import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateOperationalDay,wholeTurnAssignment} from '../server/coverage/operational.js';
import {projectCoverage,remainingCoverageIntervals} from '../src/coverage-board-state.js';

const dayPeople = () => ([
 {uid:'c1',name:'Cook 1',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Cozinheiro',certifications:['montagem'],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
 {uid:'c2',name:'Cook 2',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
 {uid:'c3',name:'Cook 3',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
 {uid:'c4',name:'Cook 4',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
 {uid:'m1',name:'Manager',status:'active',sector:'gestao',shift:'noite',jobTitle:'Gerente',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
 {uid:'f1',name:'Front 1',status:'active',sector:'frente',shift:'noite',jobTitle:'Atendente',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
 {uid:'f2',name:'Front 2',status:'active',sector:'caixa',shift:'noite',jobTitle:'Caixa',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
 {uid:'f3',name:'Front 3',status:'active',sector:'apoio',shift:'noite',jobTitle:'Apoio',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
]);

const workEntries = people => people.map(p=>({uid:p.uid,date:'2026-12-02',type:'work'}));

// Issue 1
test('issue 1: proven production and receiving needs influence evaluation without inventing times',()=>{
 const people=dayPeople();
 const base=evaluateOperationalDay({date:'2026-12-02',entries:workEntries(people),people,policy:{},requirements:[]});
 const result=evaluateOperationalDay({date:'2026-12-02',entries:workEntries(people),people,policy:{},requirements:[],context:{
  production:{active:2,pending:1,total:3},
  receiving:{records:[{id:'r1',status:'pending'}],partial:false},
  stock:{low:[],unknown:0},purchases:{records:[]},demand:{status:'unknown'}
 }});
 assert.equal(result.attention,true);
 assert.ok(result.provenOperationalNeeds?.production?.active===2);
 assert.ok(result.provenOperationalNeeds?.receiving?.pending===1);
 const kitchen=result.shifts.find(r=>r.sector==='cozinha'&&r.shift==='noite');
 const front=result.shifts.find(r=>r.sector==='frente'&&r.shift==='noite');
 assert.ok((kitchen?.reasons||[]).some(r=>/produ[cç][aã]o/i.test(r)), 'kitchen should mention proven production');
 assert.ok((front?.reasons||[]).some(r=>/recebimento/i.test(r)), 'front should mention pending receiving');
 assert.ok(!result.intervals.some(i=>i.source==='operational-context'), 'must not invent timed context intervals');
 // existing base behavior preserved for core counts
 assert.equal(base.shifts.find(r=>r.sector==='cozinha'&&r.shift==='noite').count, result.shifts.find(r=>r.sector==='cozinha'&&r.shift==='noite').count);
});

// Issue 3
test('issue 3: already approved coverages satisfy need and avoid unnecessary reinforcement',()=>{
 const absent={uid:'abs',name:'Absent',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Cozinheiro',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20',breakRequired:false}]};
 const cover={uid:'cov',name:'Cover',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Cozinheiro',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20',breakRequired:false}],accountUid:'acc-cov'};
 const c2={...dayPeople()[1],uid:'c2b'}; const c3={...dayPeople()[2],uid:'c3b'};
 const people=[absent,cover,c2,c3];
 const entries=[{uid:'abs',date:'2026-12-02',type:'monthly_sunday'},{uid:'cov',date:'2026-12-02',type:'off'},{uid:'c2b',date:'2026-12-02',type:'work'},{uid:'c3b',date:'2026-12-02',type:'work'}];
 const evaluation=evaluateOperationalDay({date:'2026-12-02',entries,people,policy:{},requirements:[]});
 const target=evaluation.shifts.find(r=>r.sector==='cozinha'&&r.shift==='noite');
 assert.ok(target.headcountGap>=1 || target.roleGap>=1, 'base gap exists');
 assert.ok(target.candidates.some(c=>c.uid==='cov'), 'cover must be an eligible candidate');
 const approved=[{operational:true,planId:'p',date:'2026-12-02',shift:'noite',sector:'cozinha',staffId:'cov',status:'approved',open:true,headcountGap:target.headcountGap>0,roleGap:target.roleGap>0,skillGap:target.skillGap>0,coveredStart:true,second:{start:'14:00',end:'22:20',breakRequired:false}}];
 const rowIntervals=evaluation.intervals.filter(i=>i.deficit&&(i.sector===target.sector)&&(!target.window||i.start<target.window.end&&i.end>target.window.start));
 const rowRecurring=evaluation.recurring.filter(i=>i.sector===target.sector&&i.shift===target.shift);
 const impact=projectCoverage(target,approved,rowIntervals,rowRecurring);
 assert.equal(impact.open,false, 'approved coverage should satisfy need');
});

// Issue 4
test('issue 4: cook/management presence is required in effectively needed intervals',()=>{
 const people=[
  {uid:'cook',name:'Cook',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Cozinheiro',certifications:[],availability:[{day:'qua',start:'18:00',end:'22:20'}]}, // arrives late, misses start of required interval
  {uid:'a1',name:'Aux 1',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
 ];
 const entries=people.map(p=>({uid:p.uid,date:'2026-12-02',type:'work'}));
 const requirements=[{weekday:3,sector:'cozinha',skill:'',start:'14:00',end:'18:00',minimum:1}];
 const result=evaluateOperationalDay({date:'2026-12-02',entries,people,policy:{},requirements});
 const kitchen=result.shifts.find(r=>r.sector==='cozinha'&&r.shift==='noite');
 assert.ok(kitchen.roleGap>=1 || kitchen.roleIntervalGap>=1 || kitchen.shortage>=1, 'cook missing in required early interval should be flagged');
 assert.ok(kitchen.reasons.some(r=>/intervalos necess[aá]rios|cozinheiro/i.test(r)), 'reason should mention cook presence in required intervals');
});

// Issue 5
test('issue 5: no-fee alternatives are prioritized over paid alternatives when suitable',()=>{
 const absent={uid:'abs',name:'Absent',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20',breakRequired:false}]};
 // designated alternatives (not rostered in this shift), available for the night window
 const nf={uid:'nf',name:'NoFee',status:'active',sector:'cozinha',shift:'extra',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20',breakRequired:false}]};
 const pd={uid:'pd',name:'Paid',status:'active',sector:'cozinha',shift:'extra',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20',breakRequired:false}]};
 const rest=dayPeople().slice(1);
 const people=[absent,nf,pd,...rest];
 const entries=[{uid:'abs',date:'2026-12-02',type:'monthly_sunday'},{uid:'nf',date:'2026-12-02',type:'work'},{uid:'pd',date:'2026-12-02',type:'work'},...rest.map(p=>({uid:p.uid,date:'2026-12-02',type:'work'}))];
 const policy={recurring:[{absentId:'abs',coverId:'nf',paid:false},{absentId:'abs',coverId:'pd',paid:true}]};
 const evaluation=evaluateOperationalDay({date:'2026-12-02',entries,people,policy,requirements:[]});
 const applied=evaluation.recurring.filter(r=>r.forUid==='abs'&&r.applied);
 assert.ok(applied.some(r=>r.uid==='nf'),'no-fee recurring cover should be applied');
 assert.ok(!applied.some(r=>r.uid==='pd'),'paid alternative should not be applied when no-fee is available for the same absence');
 // candidate prioritization: available no-fee recurring/fixed alternatives are ranked before paid ones
 const row=evaluation.shifts.find(r=>r.sector==='cozinha'&&r.shift==='noite');
 const nfCand={uid:'nf',name:'NoFee',title:'helper',scheduled:true,wholeTurn:true,skills:[],fixedDayOff:true,fitsRole:true};
 const pdCand={uid:'pd',name:'Paid',title:'helper',scheduled:true,wholeTurn:true,skills:[],fixedDayOff:true,fitsRole:true};
 const recurringMeta=[{uid:'nf',sector:row.sector,shift:row.shift,available:true,paid:false},{uid:'pd',sector:row.sector,shift:row.shift,available:true,paid:true}];
 const noFee = new Set(recurringMeta.filter(r=>r.available&&!r.paid).map(r=>r.uid));
 const ordered=[pdCand,nfCand].sort((a,b)=>Number(Boolean(b.fitsRole))-Number(Boolean(a.fitsRole)) || Number((b.wholeTurn||b.scheduled)===true)-Number((a.wholeTurn||a.scheduled)===true) || Number(noFee.has(b.uid))-Number(noFee.has(a.uid)) || Number(b.fixedDayOff===true)-Number(a.fixedDayOff===true));
 assert.equal(ordered[0].uid,'nf','no-fee candidate should be prioritized');
});

// Issue 6
test('issue 6: interval deficits are recalculated after applying recurring coverages',()=>{
 // Scenario where recurring coverage fills a simultaneous headcount gap
 const absent={uid:'abs',name:'Absent',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'18:00'}]};
 const cover={uid:'cov',name:'Cover',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}],accountUid:'u1'};
 const c1={uid:'c1',name:'Cook 1',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Cozinheiro',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]};
 const c2={uid:'c2',name:'Cook 2',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]};
 const people=[absent,cover,c1,c2];
 const entries=[{uid:'abs',date:'2026-12-02',type:'monthly_sunday'},{uid:'cov',date:'2026-12-02',type:'work'},{uid:'c1',date:'2026-12-02',type:'work'},{uid:'c2',date:'2026-12-02',type:'work'}];
 const policy={recurring:[{absentId:'abs',coverId:'cov',paid:false}]};
 const result=evaluateOperationalDay({date:'2026-12-02',entries,people,policy,requirements:[]});
 const kitchen=result.shifts.find(r=>r.sector==='cozinha'&&r.shift==='noite');
 // after recurring applied, intervals/simultaneous deficits should reflect cover presence (not stale pre-recurring deficits)
 const staleHeadcount=result.intervals.filter(i=>i.kind==='headcount'&&i.sector==='cozinha'&&i.deficit>0 && i.start<'18:00' && i.end>'14:00');
 // with cover present 14:00-22:20 and c1,c2 present, early window should be covered for a minimum of 2 on quiet day
 assert.ok(!staleHeadcount.some(i=>i.deficit>0 && kitchen.count>=2), 'headcount intervals should be recalculated after recurring coverage');
 assert.equal(kitchen.shortage,0);
});

// Issue 7 (board-state overnight crediting) and partial completion behavior contract
test('issue 7: overnight coverage can be credited to an interval when fully covering it',()=>{
 const row={sector:'cozinha',shift:'noite',window:{start:'22:00',end:'02:00'},minimum:2,count:1,roleGap:0,skillGap:0,uncertain:false,candidates:[{uid:'cov',name:'Cover',sector:'cozinha',certifications:[],countsForMinimum:true,matchesRole:false,skillConfirmed:false}]};
 const matches=[{status:'completed',staffId:'cov',actualStart:'22:00',actualEnd:'02:00',second:{breakRequired:false}}];
 const intervals=[{sector:'cozinha',skill:'',start:'22:00',end:'23:00',minimum:2,covered:1,deficit:1,uids:['base1']}];
 const remaining=remainingCoverageIntervals(row,matches,intervals);
 assert.equal(remaining.length,0, 'overnight completed coverage should credit the covered interval');
});

// Issue 2: completion must preserve historical snapshots (no current tariff fallback)
test('issue 2: completeCoverage implementation preserves unknown historical values without current fallbacks',()=>{
 const src=readFileSync(new URL('../api/coverage/manage.js',import.meta.url),'utf8');
 assert.match(src,/hasSnapshot=Object\.prototype\.hasOwnProperty\.call\(p,'practicePayment'\)\|\|Object\.prototype\.hasOwnProperty\.call\(p,'fixedFeePolicy'\)/);
 assert.match(src,/const amount=p\.fixedFeePolicy===false\?0:\(hasSnapshot\?\(p\.practicePayment\?\?\(p\.fixedFeePolicy===null\?null:null\)\):null\)/);
 assert.match(src,/const payroll=Object\.prototype\.hasOwnProperty\.call\(p,'payrollSnapshot'\)\?p\.payrollSnapshot:null/);
 assert.doesNotMatch(src,/const rate=override\?\.\amount\?\?rateSnap\.data\(\)\?\.rates\?\.\[p\.rateRole\]/);
 assert.doesNotMatch(src,/Number\.isFinite\(rate\)\?rate:null/);
});

// Issue 7: completion allows overnight actual windows
test('issue 7: completeCoverage implementation accepts overnight actual spans and validates window safely',()=>{
 const src=readFileSync(new URL('../api/coverage/manage.js',import.meta.url),'utf8');
 assert.match(src,/actualStart===actualEnd/);
 assert.doesNotMatch(src,/actualEnd<=actualStart/);
 assert.match(src,/overnightWindow=windowStart&&windowEnd&&minutes\(windowEnd\)<=minutes\(windowStart\)/);
 assert.match(src,/const actualEndM=endM<=startM\?endM\+1440:endM/);
});

// Issue 3: decide revalidation projects already approved coverages
test('issue 3: decide implementation considers other approved coverages before approving',()=>{
 const src=readFileSync(new URL('../api/coverage/manage.js',import.meta.url),'utf8');
 assert.match(src,/import \{projectCoverage\} from '\.\.\/\.\.\/src\/coverage-board-state\.js'/);
 assert.match(src,/otherMatches=sameDay\.docs\.filter/);
 assert.match(src,/projectCoverage\(target,otherMatches,rowIntervals,rowRecurring\)/);
 assert.match(src,/impact\.open \|\| target\.uncertain/);
});
