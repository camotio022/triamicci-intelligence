export const coverageColumns = {needs:'Precisa resolver',waiting:'Aguardando',resolved:'Resolvido'};
export const coverageCardId = row => row.sector+':'+row.shift;
const pending = new Set(['pending_acceptance','pending_approval']);
const approved = new Set(['approved','completed','paid']);

// Only credit a documented, uninterrupted coverage interval in the matching sector.
// A paid period alone is not proof of availability at every instant.
export function remainingCoverageIntervals(row,matches,intervals){
 const candidates=new Map(row.candidates.map(person=>[person.uid,person]));
 const clock=value=>typeof value==='string'&&/^\d{2}:\d{2}$/.test(value);
 const toM=value=>{const [h,m]=String(value).split(':').map(Number);return h*60+m;};
 return intervals.map(interval=>{
  if(!interval.deficit||!clock(interval.start)||!clock(interval.end)||interval.start>=interval.end||!Array.isArray(interval.uids))return interval;
  const workers=new Set(interval.uids);
  for(const proposal of matches){
   if(!approved.has(proposal.status)||workers.has(proposal.staffId))continue;
   const person=candidates.get(proposal.staffId);
   if(!person||person.sector!==interval.sector||interval.skill&&!(person.certifications||[]).includes(interval.skill))continue;
   const start=proposal.actualStart||proposal.second?.start,end=proposal.actualEnd||proposal.second?.end;
   if(!clock(start)||!clock(end)||start===end)continue;
   const overnight=toM(end)<=toM(start);
   const startM=toM(start), endM=overnight?toM(end)+1440:toM(end);
   let iStart=toM(interval.start), iEnd=toM(interval.end);
   if(overnight && iEnd<=startM){iStart+=1440;iEnd+=1440;}
   if(startM>iStart||endM<iEnd)continue;
   // A recorded break, or an explicit no-break declaration, is necessary for precise interval credit.
   const pause=proposal.second;
   const hasBreak=clock(pause?.breakStart)&&clock(pause?.breakEnd)&&pause.breakStart<pause.breakEnd;
   if(!hasBreak&&pause?.breakRequired!==false)continue;
   if(hasBreak){
    let bStart=toM(pause.breakStart), bEnd=toM(pause.breakEnd);
    if(bEnd<=bStart)bEnd+=1440;
    if(overnight && bEnd<=startM){bStart+=1440;bEnd+=1440;}
    if(iStart<bEnd&&iEnd>bStart)continue;
   }
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
 const credit=(proposal,person)=>{
  const start=proposal.actualStart||proposal.second?.start, end=proposal.actualEnd||proposal.second?.end;
  if(!person||people.has(person.uid)||!row.window||!start||!end||end<row.window.end||
   (start>row.window.start&&(!proposal.coveredStart||proposal.actualStart&&proposal.actualStart>proposal.second?.start)))return;
  people.add(person.uid);
  const resolvesHeadcount=proposal.headcountGap===undefined?person.countsForMinimum:Boolean(proposal.headcountGap&&person.countsForMinimum);
  const resolvesRole=proposal.roleGap===undefined?person.matchesRole:Boolean(proposal.roleGap&&person.matchesRole);
  const resolvesSkill=proposal.skillGap===undefined?(row.skill&&person.skillConfirmed):Boolean(proposal.skillGap&&person.skillConfirmed&&(!proposal.skill||!row.skill||proposal.skill===row.skill));
  if(resolvesHeadcount)added++;
  if(resolvesRole)roleGap=0;
  if(resolvesSkill)skillGap=Math.max(0,skillGap-1);
 };
 for(const proposal of matches.filter(item=>approved.has(item.status))){
  credit(proposal,row.candidates.find(candidate=>candidate.uid===proposal.staffId));
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
