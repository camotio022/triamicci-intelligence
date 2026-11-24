import {monthDates, weekKey} from './rules.js';

export const FIVE_TWO_PAIRS = ['Seg + Ter', 'Ter + Qua', 'Qua + Qui', 'Qui + Sex', 'Sex + Sáb'];

export function shiftScheduleDate(date, days) {
 const value = new Date(date + 'T12:00:00Z');
 value.setUTCDate(value.getUTCDate() + days);
 return value.toISOString().slice(0, 10);
}

export function fiveTwoWeeks(period) {
 return [...new Set(monthDates(period).map(weekKey))];
}

export function fiveTwoSundays(period) {
 return monthDates(period).filter(date => new Date(date + 'T12:00:00Z').getUTCDay() === 0);
}

export function fiveTwoPair(roster, week, uid) {
 return roster.weekly[week]?.[uid] ?? null;
}

export function fiveTwoEntries({period, members, roster, approvedLeaves = [], dates = monthDates(period)}) {
 const approved = new Set(approvedLeaves.map(leave => leave.uid + '|' + leave.date));
 return dates.flatMap(date => {
  const week = weekKey(date);
  const day = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
  return members.map(member => {
   const pair = fiveTwoPair(roster, week, member.uid);
   const off = pair !== null && (day === pair || day === pair + 1);
   const leave = approved.has(member.uid + '|' + date) || approved.has(member.accountUid + '|' + date);
   const type = date === roster.sundays[member.uid] ? 'monthly_sunday' : off ? 'off' : leave ? 'leave' : 'work';
   return {uid: member.uid, date, type};
  });
 });
}

const record = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateFiveTwoRoster({period, roster, members, complete = false}) {
 if(!record(roster) || !record(roster.weekly) || !record(roster.sundays)) return ['Quadro 5×2 inválido.'];
 const weeks = fiveTwoWeeks(period), sundays = fiveTwoSundays(period);
 const ids = new Set(members.map(member => member.uid));
 for(const [week, pairs] of Object.entries(roster.weekly)){
  if(!weeks.includes(week) || !record(pairs) || Object.entries(pairs).some(([uid, pair]) =>
   !ids.has(uid) || !Number.isInteger(pair) || pair < 0 || pair >= FIVE_TWO_PAIRS.length
  )) return ['O quadro contém uma semana, um colaborador ou um par de folgas inválido.'];
 }
 for(const [uid, sunday] of Object.entries(roster.sundays)){
  if(!ids.has(uid) || !sundays.includes(sunday)) return ['O quadro contém um domingo ou colaborador inválido.'];
 }
 if(!complete) return [];
 return members.flatMap(member => {
  const missing = weeks.filter(week => fiveTwoPair(roster, week, member.uid) === null);
  const name = member.name || member.uid;
  return [
   ...missing.map(week => name + ' precisa de dois dias seguidos de folga na semana de ' + week + '.'),
   ...(!roster.sundays[member.uid] ? [name + ' precisa de um domingo adicional.'] : []),
  ];
 }).slice(0, 40);
}

export function fiveTwoBoundaryConflict({roster, otherRoster, week, members}) {
 if(!otherRoster) return false;
 return members.some(({uid}) => {
  const otherPair = fiveTwoPair(otherRoster, week, uid);
  return otherPair !== null && otherPair !== fiveTwoPair(roster, week, uid);
 });
}
