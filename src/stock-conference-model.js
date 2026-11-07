import {restaurantDay} from '../server/schedules/restaurant-today.js';
export function timestamp(value){if(!value)return null;if(value instanceof Date)return Number.isNaN(value.getTime())?null:value;if(typeof value==='object'){const seconds=value.seconds??value._seconds;return Number.isFinite(seconds)?new Date(seconds*1000):null;}const date=new Date(value);return Number.isNaN(date.getTime())?null:date;}
export const unitLabel=unit=>({un:'unidades',porcao:'porções',pacote:'pacotes',duzia:'dúzias'})[unit]||unit||'Unidade pendente';
export function conferenceItem(product,area,signals=[],today=restaurantDay()){
 const profile=product.profile,balance=product.v3Balance,unit=profile?.countUnit;
 const compatible=!balance||balance.unit===unit;
 const last=timestamp(balance?.lastCountAtByArea?.[area]);
 const day=last?restaurantDay(last):null;
 const age=day?Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000):null;
 const signal=signals.find(x=>x.productId===product.id&&x.location===area&&x.status!=='resolved'&&x.observation!=='available');
 const configured=!!profile?.locations?.includes(area);
 const quantitative=configured&&profile.controlMode==='quantitative'&&!!unit;
 const checked=quantitative&&compatible&&day===today;
 let reason='Conferir quando necessário',due=false;
 if(!profile)reason='Configuração pendente';
 else if(!compatible){reason='Unidade do saldo precisa de revisão';due=quantitative;}
 else if(signal){reason=signal.observation==='missing'?'Falta comunicada':'Estoque baixo comunicado';due=!checked;}
 else if(quantitative&&!day){reason='Primeira contagem pendente';due=true;}
 else if(quantitative&&product.countFrequency==='daily'&&!checked){reason='Conferência diária';due=true;}
 else if(quantitative&&product.countFrequency==='weekly'&&age>=7){reason='Conferência semanal';due=true;}
 else if(checked)reason='Contado hoje';
 else if(quantitative&&product.countFrequency==='weekly')reason='Conferência semanal em dia';
 return {product,unit,last,checked,due,reason,quantitative,compatible,configured,priority:(signal?0:due?1:2)+(product.critical?-.5:0)};
}
