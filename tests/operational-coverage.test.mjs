import test from 'node:test';
import assert from 'node:assert/strict';
import {carryFiveTwoRoster,effectiveFiveTwoPair,fiveTwoEntries,fiveTwoPair,fiveTwoWeeks} from '../server/schedules/five-two.js';
import {evaluateOperationalDay,forecastPaymentDate,reviewCoverageAssignment,suggestSundayMove,validOperationalPolicy,wholeTurnAssignment} from '../server/coverage/operational.js';

const date='2026-12-13';
const kitchen=(uid,certifications=[],extras={})=>({
 uid,name:uid,status:'active',sector:'cozinha',shift:'noite',jobTitle:'Cozinheiro',
 certifications,availability:[{day:'dom',start:'12:00',end:'20:20',breakStart:'14:00',breakEnd:'15:00'},{day:'seg',start:'14:00',end:'22:20'}],...extras
});
const work=(people,date,type='work')=>people.map(({uid})=>({uid,date,type}));
const policy={holidays:[],peakPeriods:[],strongPeaks:[],frontWeekdayMinimum:null,countManagement:null,managementPaid:null,recurring:[]};

test('fixed 5×2 is inherited from published weeks while Sundays start empty',()=>{
 const past={period:'2026-11',status:'published',roster:{weekly:{'2026-11-23':{a:1},'2026-11-30':{a:2}},sundays:{a:'2026-11-22'}}};
 const draft={period:'2026-11',status:'draft',roster:{weekly:{'2026-11-30':{a:4}},sundays:{}}};
 const roster=carryFiveTwoRoster('2026-12',[draft,past],[{uid:'a'}]);
 assert.deepEqual(roster.sundays,{});
 for(const week of fiveTwoWeeks('2026-12'))assert.equal(fiveTwoPair(roster,week,'a'),2);
 const changed=effectiveFiveTwoPair(roster,'2026-12','2026-12-07','a',3,['2026-12-28']);
 assert.equal(fiveTwoPair(changed,'2026-11-30','a'),2);
 assert.equal(fiveTwoPair(changed,'2026-12-21','a'),3);
 assert.equal(fiveTwoPair(changed,'2026-12-28','a'),2);
});

test('approved leaves have priority over Sunday and can be attached to an account UID',()=>{
 const worker=kitchen('d',[],{accountUid:'account'});
 const roster={weekly:{},sundays:{d:date}};
 const entries=fiveTwoEntries({period:'2026-12',members:[worker],roster,dates:[date],approvedLeaves:[{uid:'account',date}]});
 assert.equal(entries[0].type,'leave');
 const result=evaluateOperationalDay({date,entries:[...work([worker],date),{uid:'account',date,type:'leave'}],people:[worker],policy});
 assert.equal(result.shifts.find(row=>row.sector==='cozinha'&&row.shift==='noite').count,0);
});

test('a holiday uses Sunday hours and cannot double-count a prep station for simultaneous montage',()=>{
 const holiday='2026-12-14';
 const people=[kitchen('Rita',['montagem','chapa']),kitchen('Nina',['montagem']),kitchen('Eva',['montagem']),kitchen('Leo')];
 const result=evaluateOperationalDay({date:holiday,entries:work(people,holiday),people,policy:{...policy,holidays:[holiday],strongPeaks:[holiday]},
  requirements:[{weekday:0,sector:'cozinha',skill:'chapa',minimum:1,start:'17:00',end:'20:00'}]});
 const row=result.shifts.find(x=>x.shift==='noite'&&x.sector==='cozinha');
 assert.deepEqual(row.window,{start:'12:00',end:'20:20'});
 assert.equal(row.minimum,4);
 assert.equal(row.skillCount,2);
 assert.equal(row.shortage,1);
});

test('Sunday move reduces shortage on the original Sunday and honors manual locks',()=>{
 const people=['A','B','C','D','E'].map(uid=>kitchen(uid));
 const from='2026-12-13', to='2026-12-06';
 const entries=[...work(people,to),...work(people.slice(0,3),from),{uid:'D',date:from,type:'monthly_sunday'},{uid:'E',date:from,type:'leave'}];
 const args={period:'2026-12',entries,people,policy,requirements:[]};
 const result=suggestSundayMove({...args,roster:{weekly:{},sundays:{D:from}}});
 assert.deepEqual([result.uid,result.from,result.to,result.improvement],['D',from,to,1]);
 assert.equal(suggestSundayMove({...args,roster:{weekly:{},sundays:{D:from},lockedSundays:['D']}}),null);
 assert.equal(suggestSundayMove({...args,entries:entries.filter(row=>!(row.date===to&&row.uid==='E')),roster:{weekly:{},sundays:{D:from}}}),null);
});

test('coverage keeps normal hours apart from the extra period and leaves unconfigured pay pending',()=>{
 const row={window:{start:'14:00',end:'22:20'},coverageWindow:{start:'16:20',end:'22:20'}};
 const regular={scheduled:true,hours:{start:'08:00',end:'16:20'}};
 assert.deepEqual(wholeTurnAssignment(row,regular),{first:{start:'08:00',end:'16:20'},second:{start:'16:20',end:'22:20'}});
 assert.deepEqual(wholeTurnAssignment(row,{scheduled:false}),{first:null,second:row.coverageWindow});
 assert.equal(wholeTurnAssignment(row,{scheduled:true,hours:{start:'05:00',end:'10:00'}}),null);
 assert.equal(wholeTurnAssignment({...row,coverageWindow:null},regular),null);
 assert.deepEqual(wholeTurnAssignment({...row,coverageWindow:{start:'12:00',end:'20:20'}},regular).second,{start:'16:20',end:'20:20'});
 assert.deepEqual(wholeTurnAssignment({...row,coverageWindow:{start:'12:00',end:'20:20'}},{scheduled:false}).second,{start:'12:00',end:'20:20'});
 assert.equal(reviewCoverageAssignment(wholeTurnAssignment(row,regular)).state,'blocked');
 assert.equal(forecastPaymentDate(date,null),null);
 assert.equal(forecastPaymentDate('2026-12-29',{daysAfter:5}),'2027-01-03');
 assert.equal(validOperationalPolicy(policy),true);
 assert.equal(validOperationalPolicy({...policy,holidays:['2026-02-30']}),false);
});

test('when the night cook is off, rank a cook who works that day above kitchen assistants',()=>{
 const day='2026-12-02';
 const morning=(uid,jobTitle)=>kitchen(uid,[],{jobTitle,shift:'manha',availability:[{day:'qua',start:'08:00',end:'16:20'}]});
 const night=(uid,jobTitle)=>kitchen(uid,[],{jobTitle,availability:[{day:'qua',start:'14:00',end:'22:20'}]});
 const [aux, replacement, scheduledAux, cookOff]=[
  morning('Francisco','Auxiliar de cozinha'),morning('Suberlânio','Cozinheiro'),night('Edileuza','Auxiliar de cozinha'),night('Rodolfo','Cozinheiro')
 ];
 const people=[aux,replacement,scheduledAux,cookOff];
 const entries=[...work(people.slice(0,3),day),...work([cookOff],day,'off')];
 const configured={...policy,peakPeriods:[{start:'2026-12-01',end:'2026-12-31'}]};
 const result=evaluateOperationalDay({date:day,entries,people,policy:configured});
 const row=result.shifts.find(item=>item.sector==='cozinha'&&item.shift==='noite');
 assert.equal(row.minimum,4);
 assert.equal(row.roleGap,1);
 assert.deepEqual(row.people.map(person=>person.name),['Edileuza']);
 assert.deepEqual(row.candidates.map(person=>person.name),['Suberlânio','Rodolfo','Francisco']);
 assert.deepEqual(wholeTurnAssignment(row,row.candidates[0]).second,{start:'16:20',end:'22:20'});
});

test('management counterpart is visible when the alternate shift overlaps, with payment pending',()=>{
 const day='2026-12-02';
 const person=(uid,jobTitle,shift,start,end)=>kitchen(uid,[],{
  jobTitle,sector:'gestao',shift,availability:[{day:'qua',start,end}]
 });
 const manager=person('Edielson','Gerente','manha','08:00','16:20');
 const deputy=person('Judson','Subgerente','noite','14:00','22:20');
 const people=[manager,deputy];
 const evaluate=(working,away)=>evaluateOperationalDay({date:day,entries:[...work([working],day),...work([away],day,'off')],people,policy});
 const a=evaluate(manager,deputy);
 const b=evaluate(deputy,manager);
 assert.equal(a.recurring[0].name,'Edielson');
 assert.equal(a.recurring[0].paid,null);
 assert.equal(a.recurringFees,0);
 assert.deepEqual(wholeTurnAssignment(a.shifts.find(item=>item.sector==='frente'&&item.shift==='noite'),
  a.shifts.find(item=>item.sector==='frente'&&item.shift==='noite').candidates[0]).second,{start:'16:20',end:'22:20'});
 const morning=b.shifts.find(item=>item.sector==='frente'&&item.shift==='manha');
 assert.equal(b.recurring[0].name,'Judson');
 assert.equal(b.recurring[0].available,false);
 assert.equal(wholeTurnAssignment(morning,morning.candidates.find(item=>item.uid==='Judson')),null);
});

test('a person absent from the Sunday roster cannot make a shared shift window look ambiguous',()=>{
 const standard=kitchen('standard');
 const different=kitchen('different',[],{availability:[{day:'dom',start:'15:00',end:'20:20'}]});
 const result=evaluateOperationalDay({date,people:[standard,different],entries:[...work([standard],date),...work([different],date,'off')],policy});
 const row=result.shifts.find(item=>item.sector==='cozinha'&&item.shift==='noite');
 assert.deepEqual(row.window,{start:'12:00',end:'20:20'});
 assert.deepEqual(wholeTurnAssignment(row,row.candidates[0]).second,row.window);
});

test('recurring remuneration preserves unknown and explicit unpaid states',()=>{
 const absent=kitchen('absent');
 const cover=kitchen('cover');
 const entries=[...work([absent],date,'off'),...work([cover],date)];
 for(const paid of [null,false,true]){
  const configured={...policy,recurring:[{absentId:absent.uid,coverId:cover.uid,paid}]};
  assert.equal(validOperationalPolicy(configured),true);
  const result=evaluateOperationalDay({date,entries,people:[absent,cover],policy:configured});
  assert.equal(result.recurring[0].paid,paid);
  assert.equal(result.recurringFees,paid===true?1:0);
  assert.equal(result.recurringUnknownFees,paid===null?1:0);
 }
});

test('recurring front coverage is associated with the operational front sector',()=>{
 const absent=kitchen('cashier',[],{sector:'caixa',jobTitle:'Caixa'});
 const cover=kitchen('support',[],{sector:'apoio',jobTitle:'Atendente'});
 const result=evaluateOperationalDay({date,entries:[...work([absent],date,'off'),...work([cover],date)],people:[absent,cover],policy:{...policy,recurring:[{absentId:absent.uid,coverId:cover.uid,paid:false}]}});
 assert.equal(result.recurring[0].sector,'frente');
 assert.equal(result.recurring[0].available,true);
 assert.equal(result.recurringFees,0);
});

test('different known schedules in the same shift are evaluated by intervals instead of marked uncertain',()=>{
 const day='2026-12-02';
 const kitchenShift=(uid,start,end)=>({uid,name:uid,status:'active',sector:'cozinha',shift:'noite',jobTitle:'Cozinheiro',certifications:[],availability:[{day:'qua',start,end}]});
 const people=[kitchenShift('Ana','14:00','22:20'),kitchenShift('Bia','16:00','22:20')];
 const entries=people.map(({uid})=>({uid,date:day,type:'work'}));
 const result=evaluateOperationalDay({date:day,entries,people,policy,requirements:[]});
 const row=result.shifts.find(item=>item.sector==='cozinha'&&item.shift==='noite');
 assert.equal(row.uncertain,false);
 assert.equal(row.minimum,2);
 assert.equal(row.count,2);
 assert.ok((row.simultaneousHeadcount||[]).some(item=>item.start==='14:00'&&item.end==='16:00'&&item.deficit===1));
 assert.ok(result.intervals.some(item=>item.sector==='cozinha'&&item.start==='14:00'&&item.end==='16:00'&&item.deficit===1));
});

test('absence of cook in kitchen shift creates a confirmed role deficit',()=>{
 const day='2026-12-02';
 const people=[
  {uid:'a1',name:'A1',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
  {uid:'a2',name:'A2',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]}
 ];
 const result=evaluateOperationalDay({date:day,entries:people.map(({uid})=>({uid,date:day,type:'work'})),people,policy,requirements:[]});
 const row=result.shifts.find(item=>item.sector==='cozinha'&&item.shift==='noite');
 assert.equal(row.uncertain,false);
 assert.equal(row.roleGap,1);
 assert.ok(row.shortage>=1);
 assert.ok(row.reasons.some(reason=>/cozinheiro/i.test(reason)));
});

test('absence of manager or submanager in front shift creates a confirmed role deficit on busy days',()=>{
 const day='2026-12-13'; // Sunday/busy day, minimum 3
 const people=[
  {uid:'f1',name:'F1',status:'active',sector:'frente',shift:'noite',jobTitle:'Atendente',certifications:[],availability:[{day:'dom',start:'12:00',end:'20:20'}]},
  {uid:'f2',name:'F2',status:'active',sector:'caixa',shift:'noite',jobTitle:'Caixa',certifications:[],availability:[{day:'dom',start:'12:00',end:'20:20'}]},
  {uid:'f3',name:'F3',status:'active',sector:'apoio',shift:'noite',jobTitle:'Apoio de balcão',certifications:[],availability:[{day:'dom',start:'12:00',end:'20:20'}]}
 ];
 const result=evaluateOperationalDay({date:day,entries:people.map(({uid})=>({uid,date:day,type:'work'})),people,policy,requirements:[]});
 const row=result.shifts.find(item=>item.sector==='frente'&&item.shift==='noite');
 assert.equal(row.uncertain,false);
 assert.equal(row.minimum,3);
 assert.equal(row.roleGap,1);
 assert.ok(row.shortage>=1);
 assert.ok(row.reasons.some(reason=>/gerente|subgerente/i.test(reason)));
});

test('quiet weekday with two kitchen collaborators is tolerable but carries an operational alert note',()=>{
 const day='2026-12-02';
 const people=[
  {uid:'c1',name:'C1',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Cozinheiro',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]},
  {uid:'c2',name:'C2',status:'active',sector:'cozinha',shift:'noite',jobTitle:'Auxiliar de cozinha',certifications:[],availability:[{day:'qua',start:'14:00',end:'22:20'}]}
 ];
 const result=evaluateOperationalDay({date:day,entries:people.map(({uid})=>({uid,date:day,type:'work'})),people,policy,requirements:[]});
 const row=result.shifts.find(item=>item.sector==='cozinha'&&item.shift==='noite');
 assert.equal(row.minimum,2);
 assert.equal(row.count,2);
 assert.equal(row.shortage,0);
 assert.equal(row.uncertain,false);
 assert.ok(row.reasons.some(reason=>/duas pessoas podem dar conta/i.test(reason)));
});

test('weekend with four kitchen collaborators meets the minimum when a cook is present',()=>{
 const day='2026-12-13';
 const people=['c1','c2','c3','c4'].map((uid,i)=>({uid,name:uid,status:'active',sector:'cozinha',shift:'noite',jobTitle:i===0?'Cozinheiro':'Auxiliar de cozinha',certifications:[],availability:[{day:'dom',start:'12:00','end':'20:20'}]}));
 const result=evaluateOperationalDay({date:day,entries:people.map(({uid})=>({uid,date:day,type:'work'})),people,policy,requirements:[]});
 const row=result.shifts.find(item=>item.sector==='cozinha'&&item.shift==='noite');
 assert.equal(row.minimum,4);
 assert.equal(row.count,4);
 assert.equal(row.roleGap,0);
 assert.equal(row.shortage,0);
 assert.equal(row.uncertain,false);
});
