export const coverageColumns = {needs:'Precisa resolver',waiting:'Aguardando',resolved:'Resolvido'};
export const coverageCardId = row => row.sector+':'+row.shift;
const pending = new Set(['pending_acceptance','pending_approval']);
const approved = new Set(['approved','completed','paid']);

export function projectCoverage(row, matches, intervals, recurring, extraCandidate=null){
 const people=new Set();
 let added=0, roleGap=row.roleGap, skillGap=row.skillGap;
 for(const proposal of matches.filter(item=>approved.has(item.status))){
  const person=row.candidates.find(candidate=>candidate.uid===proposal.staffId);
  const start=proposal.actualStart||proposal.second?.start, end=proposal.actualEnd||proposal.second?.end;
  if(!person||people.has(person.uid)||!row.window||!start||!end||end<row.window.end||
   (start>row.window.start&&(!proposal.coveredStart||proposal.actualStart&&proposal.actualStart>proposal.second?.start)))continue;
  people.add(person.uid);
  if(person.countsForMinimum)added++;
  if(person.matchesRole)roleGap=0;
  if(row.skill&&person.skillConfirmed)skillGap=Math.max(0,skillGap-1);
 }
 if(extraCandidate&&!people.has(extraCandidate.uid)){
  if(extraCandidate.countsForMinimum)added++;
  if(extraCandidate.matchesRole)roleGap=0;
  if(row.skill&&extraCandidate.skillConfirmed)skillGap=Math.max(0,skillGap-1);
 }
 const count=row.count+added, headcountGap=row.minimum===null?0:Math.max(0,row.minimum-count);
 // Interval and station requirements remain open until backed by staffing evidence.
 const open=Boolean(headcountGap||roleGap||skillGap||row.uncertain||intervals.length||recurring.some(item=>!item.available&&!people.has(item.uid)));
 const waiting=matches.filter(item=>pending.has(item.status));
 return {count,headcountGap,roleGap,skillGap,open,waiting,column:open?(waiting.length?'waiting':'needs'):'resolved'};
}

export function moveCoverageCard(order,from,to){
 if(from===to||!order.includes(from)||!order.includes(to))return order;
 const next=order.filter(key=>key!==from);
 next.splice(order.indexOf(to),0,from);
 return next;
}
