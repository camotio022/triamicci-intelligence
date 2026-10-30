// Pacote 04 — cálculo puro e conservador de inventário diário.
// Não altera saldos: apenas consolida eventos confiáveis para apresentação e fechamento futuro.
import {validQuantity} from './logic.js';

const round = value => Math.round((value + Number.EPSILON) * 1000) / 1000;
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const sameUnit = (value, unit) => value?.unit === unit;
const isNonnegative = (value, unit) => validQuantity(value, {allowZero:true, unit});

export function calculateDailyInventory({unit, current, previous=null, entries=[], outflows=[]} = {}) {
  if (!['kg','g','L','ml','mL','un','porcao','pacote','duzia'].includes(unit)) throw new Error('INVALID_UNIT');
  if (!current || !validDate(current.at) || !sameUnit(current,unit) ||
      !isNonnegative(current.reserve,unit) || !isNonnegative(current.rotation,unit))
    throw new Error('INVALID_CURRENT_COUNT');
  const available = round(current.reserve + current.rotation);
  if (!previous) return {unit,available,previousTotal:null,entriesTotal:null,
    latestEntry:null,variation:null,estimatedPhysicalExit:null,divergence:null,
    status:'NO_PREVIOUS_COUNT'};
  if (!validDate(previous.at) || !sameUnit(previous,unit) ||
      !isNonnegative(previous.reserve,unit) || !isNonnegative(previous.rotation,unit) ||
      Date.parse(previous.at) >= Date.parse(current.at)) throw new Error('INVALID_PREVIOUS_COUNT');
  const previousAt = Date.parse(previous.at), currentAt = Date.parse(current.at);
  for (const event of [...entries,...outflows]) {
    if (!sameUnit(event,unit) || !validDate(event.at) ||
        !isNonnegative(event.quantity,unit) ||
        !(Date.parse(event.at)>previousAt && Date.parse(event.at)<=currentAt))
      throw new Error('INCOMPATIBLE_OR_OUT_OF_WINDOW_EVENT');
  }
  const previousTotal=round(previous.reserve+previous.rotation);
  const entriesTotal=round(entries.reduce((n,e)=>n+e.quantity,0));
  const recordedOutflows=round(outflows.reduce((n,e)=>n+e.quantity,0));
  const variation=round(available-previousTotal);
  // Baixas já registradas no Pacote 03 não devem ser duplicadas.
  // O valor abaixo é diferença física bruta, não uma ordem de baixa.
  const estimatedPhysicalExit=round(previousTotal+entriesTotal-available);
  const unexplainedDifference=round(estimatedPhysicalExit-recordedOutflows);
  const latest=entries.length?[...entries].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0]:null;
  return {unit,available,previousTotal,entriesTotal,recordedOutflows,
    latestEntry:latest?{quantity:latest.quantity,at:latest.at}:null,
    variation,estimatedPhysicalExit:estimatedPhysicalExit>=0?estimatedPhysicalExit:null,
    divergence:estimatedPhysicalExit<0?{kind:'POSITIVE_ADJUSTMENT',quantity:-estimatedPhysicalExit}:
      unexplainedDifference!==0?{kind:'UNEXPLAINED_DIFFERENCE',quantity:unexplainedDifference}:null,
    status:estimatedPhysicalExit<0?'REQUIRES_RECONCILIATION':'CALCULATED',
    informationalOnly:true};
}
