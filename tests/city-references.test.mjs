import test from 'node:test';
import assert from 'node:assert/strict';
import {destinations,foodBasket,parseCityReference,collectCityReferences} from '../scripts/city-references.mjs';
import {cities} from '../src/catalog.mjs';
const now=new Date('2026-09-25T12:00:00Z');
function fixture(city=cities[0]){
 const labels=[...foodBasket.map(row=>row[0]),'1 Bedroom Apartment (Outside Center)','Basic Utilities 85m²','Internet','Phone Plan','Taxi Start','Taxi (per km)'];
 return `<h1>Cost of Living in ${destinations[city.id][1]}</h1><script type="application/ld+json">{"priceCurrency":"USD"}</script><p>Last updated: September 24, 2026</p>${labels.map(label=>`<div><span>${label}</span><span>$1.01</span></div>`).join('')}`;
}
test('all nine city pages map correctly and sum a transparent basket with exact cents',()=>{
 for(const city of cities){const record=parseCityReference(fixture(city),city,now);
  assert.equal(Object.keys(record.items).length,6);assert.equal(record.currency,city.currency);
  assert.equal(record.items.transport.amount,'121.20');
  assert.equal(record.items.food.amount,(foodBasket.reduce((sum,row)=>sum+row[1],0)*101/100).toFixed(2));
  assert.equal(record.items.rent.samples,null);assert.equal(record.items.food.components.length,15);
  assert.match(record.items.utilities.note,/85 м²/);
 }
});
test('wrong city, currency, date, missing price and zero quote fail closed',()=>{
 for(const html of [fixture(cities[1]),fixture().replace('USD','EUR'),fixture().replace('September 24','July 1'),fixture().replace('September 24','September 26'),fixture().replace('Last updated:','Date:'),fixture().replace('Phone Plan','Unknown'),fixture().replace('$1.01','$0.00')])assert.throws(()=>parseCityReference(html,cities[0],now));
});
test('failed source collection preserves both original prices and verification timestamps',async()=>{
 const previous={cities:{danang:parseCityReference(fixture(),cities[0],now)}};
 const result=await collectCityReferences(previous,async()=>{throw new Error('offline');},now);
 assert.deepEqual(result.snapshot.cities,previous.cities);assert.equal(result.errors.length,9);
});
test('direct sources keep priority and their original verification date',async()=>{
 const direct={kind:'official_tariff',amount:'199000',currency:'VND',checkedAt:'2026-09-23'};
 const previous={cities:{danang:{currency:'VND',items:{phone:direct}}}};
 const get=async url=>{const city=cities.find(city=>url.includes(`/${destinations[city.id][0]}/`));return new Response(fixture(city));};
 const result=await collectCityReferences(previous,get,now);
 assert.deepEqual(result.snapshot.cities.danang.items.phone,direct);assert.equal(result.errors.length,0);assert.equal(Object.keys(result.snapshot.cities).length,9);
});
