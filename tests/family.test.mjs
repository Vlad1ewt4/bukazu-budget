import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate} from '../src/calculate.mjs';
import {familyInput,familyExpenses,childFoodQuote} from '../src/family.mjs';
import {scenario} from '../src/scenarios.mjs';
import {cities} from '../src/catalog.mjs';
import {loadData} from '../src/load-data.mjs';
const now=new Date('2026-09-28T12:00:00Z');
const rub=amount=>({amount:String(amount),currency:'RUB',basis:'household'});
const line=(id,amount,rest={})=>({id,label:id,...rub(amount),period:'monthly',enabled:true,...rest});
const input={people:1,months:3,advance:1,buffer:'0',reserveMonths:1,spread:'0',incomeStart:1,lines:[line('rent',100),line('school',1200,{paymentEvery:12})],savings:rub(1700),income:rub(0),deposit:rub(0),exitReserve:rub(0)};
test('annual school is prepaid once; three-month stay still funds whole invoice and reserve',()=>{
 const r=calculate(input,{RUB:'1'});
 assert.equal(r.monthlyPlanned,20000);assert.equal(r.cost,150000);assert.equal(r.required,170000);
 assert.equal(r.schedule[0].outflow,120000);assert.equal(r.schedule[1].outflow,10000);
 assert.equal(r.schedule[2].beforeIncome,20000);assert.equal(r.gap,0);
});
test('annual fees are not charged again inside twelve months and high future income cannot fund initial invoice',()=>{
 const r=calculate({...input,months:12},{RUB:'1'});assert.equal(r.cost,240000);assert.equal(r.required,260000);
 const high=calculate({...input,income:rub(10000),savings:rub(0)},{RUB:'1'});assert.equal(high.required,150000);
});
test('quarterly packages repeat in month four; entry fees and refundable deposit are separate',()=>{
 const r=calculate({...input,months:6,deposit:rub(200),lines:[line('rent',100),line('school',300,{paymentEvery:3}),line('entry',50,{period:'once'})]},{RUB:'1'});
 assert.equal(r.cost,125000);assert.equal(r.committed,145000);assert.equal(r.required,165000);
 assert.equal(r.schedule[3].outflow,40000);assert.equal(r.schedule[4].outflow,10000);
});
test('tiny periodic amounts do not produce negative monthly outflows through rounding',()=>{
 const r=calculate({...input,months:12,buffer:'10',lines:[line('rent',0),line('a','0.01',{paymentEvery:3}),line('b','0.01',{paymentEvery:3})]},{RUB:'1'});
 assert.ok(r.schedule.every(x=>x.outflow>=0));assert.equal(r.cost,8);
});
test('counts, child age, infant costs and custom fees are validated with actionable fields',()=>{
 for(const adults of [0,7,'',1.5])assert.throws(()=>familyInput({adults}));
 assert.throws(()=>familyInput({children:[{age:18}]}));
 assert.throws(()=>familyInput({children:[{age:1}]}),e=>e.field==='child-0-baby-amount');
 assert.throws(()=>familyInput({children:[{age:8,education:'manual',educationAmount:''}]}),e=>e.field==='child-0-education-amount');
 assert.equal(familyInput({adults:2,children:[{age:8}]}).bedrooms,3);
 assert.equal(familyInput({adults:2,children:[{age:8}],housing:'1'}).bedrooms,1);
});
test('children basket excludes coffee exactly rather than assuming children are a fraction of an adult',()=>{
 const q=childFoodQuote({components:[{label:'Кофе в кафе',unitAmount:'3',quantity:12},{label:'Рис',unitAmount:'2.50',quantity:4}]});
 assert.equal(q.amount,'10.00');assert.equal(q.components.length,1);
 assert.throws(()=>childFoodQuote({amount:'500'}));
});
// Stable synthetic market snapshot: scheduled production refreshes must not age these tests.
const quote=(currency,amount='100')=>({kind:'city_reference',source:'Nomadlio',currency:'USD',amount,basis:'household',period:'monthly',samples:null,checkedAt:'2026-09-28',sourceDate:'2026-09-27',components:[{label:'Рис',unitAmount:'2',quantity:4},{label:'Кофе в кафе',unitAmount:'3',quantity:12}]});
const prices={cities:Object.fromEntries(cities.map(c=>[c.id,{currency:c.currency,items:Object.fromEntries(['rent','food','utilities','internet','phone','transport'].map(id=>[id,quote(c.currency)])),familyHousing:{rent3:quote(c.currency,'300'),utilities85:quote(c.currency)}}]))};
const rates={effectiveDate:'2026-09-28',rates:Object.fromEntries(['RUB','USD','EUR',...cities.map(c=>c.currency)].map(c=>[c,'1']))};
const catalog=JSON.parse(fs.readFileSync(new URL('../data/family.json',import.meta.url)));
const personal={savings:'2000000',income:'250000',months:'3',obligations:'0',adults:2,children:[{age:6,education:'reference',activity:'none'}]};
test('family scenario uses one larger home, two adult food baskets, one coffee-free child basket and shared taxi',()=>{
 const r=scenario(cities[0],personal,prices,rates,now,catalog);assert.equal(r.unavailable,undefined);assert.equal(r.incomplete,false);
 const row=id=>r.breakdown.find(x=>x.id===id);
 assert.equal(row('rent').quantity,1);assert.equal(row('rent').amount,prices.cities.danang.familyHousing.rent3.amount);
 assert.equal(row('food').quantity,2);assert.equal(row('child-food').quantity,1);assert.equal(row('transport').quantity,1);assert.equal(row('phone').quantity,2);
 assert.equal(row('education-0').paymentEvery,12);
});
test('school fees are charged per child, never multiplied by household size',()=>{
 const one=familyExpenses(cities[0],familyInput(personal),catalog,now);
 const two=familyExpenses(cities[0],familyInput({...personal,children:[personal.children[0],personal.children[0]]}),catalog,now);
 assert.equal(two.lines.length,one.lines.length*2);assert.equal(two.sources.length,2);
});
test('unknown, expired and tax-incomplete school tariffs never become a positive affordability result',()=>{
 for(const [city,children,data] of [[cities.find(c=>c.id==='antalya'),[{age:6}],catalog],[cities[0],[{age:2,babyAmount:'10000'}],catalog],[cities[0],[{age:6}],{cities:{}}]]){
  const r=scenario(city,{...personal,savings:'999999999',children},prices,rates,now,data);assert.equal(r.incomplete,true);assert.equal(r.fits,false);assert.ok(r.additional.missing.length);
 }
 const expired=structuredClone(catalog);expired.cities.danang.education.reviewDueAt='2026-09-01';
 assert.equal(scenario(cities[0],personal,prices,rates,now,expired).incomplete,true);
});
test('custom school amount and payment schedule provide an alternative to missing local tariffs',()=>{
 const r=scenario(cities.find(c=>c.id==='antalya'),{...personal,children:[{age:6,education:'manual',educationAmount:'120 000',educationEvery:3,educationEntry:'5000'}]},prices,rates,now,catalog);
 assert.equal(r.incomplete,false);assert.equal(r.breakdown.find(x=>x.id==='education-0').rubles,4000000);
});
test('missing activity quote is visible; deliberately excluded activities remain excluded',()=>{
 const a=familyExpenses(cities[0],familyInput({...personal,children:[{age:6,activity:'reference'}]}),catalog,now);assert.ok(a.missing.some(s=>s.includes('секции')));
 const b=familyExpenses(cities[0],familyInput(personal),catalog,now);assert.equal(b.missing.length,0);assert.ok(b.notes.length);
});
test('network failure and invalid snapshots yield friendly errors; stalled requests have a deadline',async()=>{
 await assert.rejects(loadData(async()=>{throw new TypeError('Failed to fetch');}),/Проверьте интернет/);
 await assert.rejects(loadData(async()=>({ok:true,json:async()=>null})),/Не удалось загрузить/);
 await assert.rejects(loadData((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')))),5),/слишком много времени/);
});
