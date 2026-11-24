export const coverageColumns = {needs:'Precisa resolver',waiting:'Aguardando',resolved:'Resolvido'};
export const coverageCardId = row => row.sector+':'+row.shift;
const pending = new Set(['pending_acceptance','pending_approval']);
const approved = new Set(['approved','completed','paid']);

// Only credit a documented, uninterrupted coverage interval in the matching sector.
// A paid period alone is not proof of availability at every instant.
export function remainingCoverageIntervals(row,matches,intervals){
 const candidates=new Map(row.candidates.map(person=>[person.uid,person]));
 const clock=value=>typeof value==='string'&&/^\d{2}:\d{2}$/.test(value);
 return intervals.map(interval=>{
  if(!interval.deficit||!clock(interval.start)||!clock(interval.end)||interval.start>=interval.end||!Array.isArray(interval.uids))return interval;
  const workers=new Set(interval.uids);
  for(const proposal of matches){
   if(!approved.has(proposal.status)||workers.has(proposal.staffId))continue;
   const person=candidates.get(proposal.staffId);
   if(!person||person.sector!==interval.sector||interval.skill&&!(person.certifications||[]).includes(interval.skill))continue;
   const start=proposal.actualStart||proposal.second?.start,end=proposal.actualEnd||proposal.second?.end;
   if(!clock(start)||!clock(end)||start>interval.start||end<interval.end||start>=end)continue;
   // A recorded break, or an explicit no-break declaration, is necessary for precise interval credit.
   const pause=proposal.second;
   const hasBreak=clock(pause?.breakStart)&&clock(pause?.breakEnd)&&pause.breakStart<pause.breakEnd;
   if(!hasBreak&&pause?.breakRequired!==false)continue;
   if(hasBreak&&interval.start<pause.breakEnd&&interval.end>pause.breakStart)continue;
   // Without a station assignment, competing skill requirements cannot share this reinforcement.
   if(intervals.some(other=>other!==interval&&other.skill&&other.skill!==interval.skill&&other.start<interval.end&&other.end>interval.start))continue;
   workers.add(person.uid);
  }
  return {...interval,uids:[...workers],covered:workers.size,deficit:Math.max(0,interval.minimum-workers.size)};
 }).filter(interval=>interval.deficit);
}

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
 const remainingIntervals=remainingCoverageIntervals(row,matches,intervals);
 const open=Boolean(headcountGap||roleGap||skillGap||row.uncertain||remainingIntervals.length||recurring.some(item=>!item.available&&!people.has(item.uid)));
 const waiting=matches.filter(item=>pending.has(item.status));
 return {count,headcountGap,roleGap,skillGap,remainingIntervals,open,waiting,column:open?(waiting.length?'waiting':'needs'):'resolved'};
}

export function moveCoverageCard(order,from,to){
 if(from===to||!order.includes(from)||!order.includes(to))return order;
 const next=order.filter(key=>key!==from);
 next.splice(order.indexOf(to),0,from);
 return next;
}
