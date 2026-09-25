import test from 'node:test';
import assert from 'node:assert/strict';
import {scenario,categories,validatePersonal} from '../src/scenarios.mjs';
import {cities} from '../src/catalog.mjs';
const now=new Date('2026-09-25T12:00:00Z');
const prices=()=>({cities:Object.fromEntries(cities.map(city=>[city.id,{currency:city.currency,items:Object.fromEntries(Object.keys(categories).map(id=>[id,{amount:'10.00',currency:'USD',basis:'household',period:'monthly',kind:'city_reference',source:'Nomadlio',samples:null,sourceDate:'2026-09-24',checkedAt:now.toISOString()}]))}]))});
const rates={effectiveDate:'2026-09-25',rates:{RUB:'1',USD:'2'}};
const personal={savings:'300',income:'100',obligations:'10',months:'3'};
test('all destinations use the full personal budget; result includes six categories and fixed obligations',()=>{
 for(const city of cities){const r=scenario(city,personal,prices(),rates,now);
  assert.equal(r.monthlyPlanned,14200);assert.equal(r.buffer,1200);assert.equal(r.recurringBalance,-4200);
  assert.equal(r.required,36800);assert.equal(r.gap,6800);assert.equal(r.savings,30000);
  assert.equal(r.schedule[2].beforeIncome,7400);assert.equal(r.schedule[2].balance,17400);
 }
});
test('zero income funds entire period plus reserve; high income still needs first month and reserve',()=>{
 assert.equal(scenario(cities[0],{...personal,income:'0'},prices(),rates,now).required,56800);
 assert.equal(scenario(cities[0],{...personal,income:'1000'},prices(),rates,now).required,28400);
 assert.equal(scenario(cities[0],{...personal,income:'1000',savings:'0'},prices(),rates,now).fits,false);
});
test('a missing or stale category and stale FX block availability rather than become zero',()=>{
 const p=prices();delete p.cities.danang.items.food;
 assert.match(scenario(cities[0],personal,p,rates,now).unavailable,/питание/);
 const stale=prices();stale.cities.danang.items.rent.checkedAt='2026-09-01';
 assert.match(scenario(cities[0],personal,stale,rates,now).unavailable,/жильё/);
 assert.match(scenario(cities[0],personal,prices(),{...rates,effectiveDate:'2026-09-01'},now).unavailable,/Курсы/);
});
test('blank, negative, unsafe amounts and unsupported horizon cannot be submitted',()=>{
 for(const savings of ['','-10','abc','99999999999999','1.234'])assert.throws(()=>validatePersonal({...personal,savings}));
 assert.throws(()=>validatePersonal({...personal,months:'0'}));
 assert.doesNotThrow(()=>validatePersonal({...personal,savings:'30 000,25',income:'0'}));
});
