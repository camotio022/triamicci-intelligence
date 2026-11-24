import {projectCoverage} from '../../src/coverage-board-state.js';
import {evaluateOperationalDay} from './operational.js';
import {monthDates} from '../schedules/rules.js';
import {fiveTwoSundays,validateFiveTwoRoster} from '../schedules/five-two.js';

export function evaluateCoverageMonth({plan,people,requirements,policy,leaves=[],proposals=[]}){
 const sundays=new Set(fiveTwoSundays(plan.period));
 const rosterPeople=people.filter(person=>person.status==='active');
 const complete=plan.status==='published'||Boolean(plan.roster&&
  !validateFiveTwoRoster({period:plan.period,roster:plan.roster,members:rosterPeople,complete:true}).length);
 const grouped=new Map();
 for(const entry of [...(plan.entries||[]),...leaves]){
  if(!grouped.has(entry.date))grouped.set(entry.date,[]);
  grouped.get(entry.date).push(entry);
 }
 const days=monthDates(plan.period).map(date=>{
  const entries=grouped.get(date);
  if(!entries?.length)return {date,sunday:sundays.has(date),unplanned:true,attention:false,extra:0,recurringFees:0,recurringPendingFees:0,recurringUnknownFees:0,recurring:[],shifts:[]};
  const day=evaluateOperationalDay({date,people,requirements,policy,entries});
  const shifts=day.shifts.map(row=>{
   const matches=proposals.filter(p=>p.operational&&p.date===date&&p.sector===row.sector&&p.shift===row.shift);
   const intervals=day.intervals.filter(item=>item.deficit&&(item.sector===row.sector||row.sector==='frente'&&['caixa','apoio','gestao'].includes(item.sector))&&
    (!row.window||item.start<row.window.end&&item.end>row.window.start));
   const recurring=day.recurring.filter(item=>item.sector===row.sector&&item.shift===row.shift);
   const impact=projectCoverage(row,matches,intervals,recurring);
   const intervalGap=impact.remainingIntervals.reduce((max,item)=>Math.max(max,item.deficit||0),0);
   return {sector:row.sector,shift:row.shift,count:impact.count,minimum:row.minimum,headcountGap:impact.headcountGap,roleGap:impact.roleGap,skillGap:impact.skillGap,
    attention:impact.open,uncertain:row.uncertain,intervalGap,confirmedDeficit:!row.uncertain&&Boolean(impact.headcountGap||impact.roleGap||impact.skillGap||intervalGap),extra:row.window&&!row.uncertain&&!row.missingHours?Math.max(impact.headcountGap,impact.roleGap,impact.skillGap,intervalGap):0};
  });
  return {date,sunday:sundays.has(date),holiday:day.holiday,attention:shifts.some(row=>row.attention),extra:shifts.reduce((n,row)=>n+row.extra,0),
   recurringFees:day.recurringFees,recurringPendingFees:day.recurringPendingFees,recurringUnknownFees:day.recurringUnknownFees,recurring:day.recurring,shifts};

 });
 const sum=key=>days.reduce((total,day)=>total+day[key],0);
 return {period:plan.period,complete,days,attention:days.filter(day=>day.attention).length,recurringFees:sum('recurringFees'),recurringPendingFees:sum('recurringPendingFees'),recurringUnknownFees:sum('recurringUnknownFees'),extra:complete?sum('extra'):null};
}
