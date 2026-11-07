import {conferenceProfile} from '../server/operations/conference-profile.js';
import test from 'node:test';import assert from 'node:assert/strict';import {conferenceItem,timestamp} from '../src/stock-conference-model.js';
const product={id:'p',name:'Arroz',countFrequency:'weekly',profile:{controlMode:'quantitative',countUnit:'kg',locations:['giro','reserva']}};
test('conferência: frequência real, área, fuso e unidade preservados',()=>{
 assert.equal(conferenceItem(product,'giro',[],'2026-11-07').reason,'Primeira contagem pendente');
 const p={...product,v3Balance:{unit:'kg',lastCountAtByArea:{giro:'2026-11-01T01:00:00Z'}}};
 assert.equal(conferenceItem(p,'giro',[],'2026-11-07').due,true,'31/10 no Brasil: sete dias');
 const p2={...p,v3Balance:{unit:'kg',lastCountAtByArea:{giro:'2026-11-07T12:00:00Z'}}};assert.equal(conferenceItem(p2,'giro',[],'2026-11-07').checked,true);assert.equal(conferenceItem(p2,'reserva',[],'2026-11-07').checked,false);
 assert.equal(conferenceItem({...p2,v3Balance:{...p2.v3Balance,unit:'un'}},'giro',[],'2026-11-07').checked,false);
 const requestOnly={...p,countFrequency:'on_demand'};assert.equal(conferenceItem(requestOnly,'giro',[],'2026-11-07').due,false);
 assert.equal(conferenceItem(requestOnly,'giro',[{productId:'p',location:'reserva',observation:'missing'}],'2026-11-07').due,false);
 assert.equal(conferenceItem(requestOnly,'giro',[{productId:'p',location:'giro',observation:'missing'}],'2026-11-07').due,true);
 assert.equal(conferenceItem({...product,profile:null},'giro').quantitative,false);
 assert.equal(timestamp(new Date('2026-11-07T12:00:00Z')).toISOString(),'2026-11-07T12:00:00.000Z');
 assert.equal(timestamp({_seconds:1}).getTime(),1000);assert.equal(timestamp('not-a-date'),null);
});

test('conferência aceita perfil preparado válido e preserva a configuração explícita da unidade',()=>{const profile={displayName:'Isca',controlMode:'quantitative',countUnit:'porcao',origin:'internal',locations:['giro']};assert.equal(conferenceProfile({profile},null),profile);assert.equal(conferenceProfile({profile:{...profile,countUnit:null}},null),null);const override={...profile,countUnit:'kg'};assert.equal(conferenceProfile({profile},override),override);});
