import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAllDestinations,applyMarketPrices,freshPriceEntries} from '../src/market-prices.mjs';
import {makeLines,cities} from '../src/catalog.mjs';
import {normalizePrices} from '../scripts/providers.mjs';
const now=new Date('2026-09-24T12:00:00Z');
const quote=(currency,amount='100')=>({amount,currency,sourceDate:'2026-09-01',samples:8,basis:'household',period:'monthly'});
const snapshot=()=>({cities:Object.fromEntries(cities.map(c=>[c.id,{currency:c.currency,source:'Test fixture',fetchedAt:now.toISOString(),items:{rent:quote(c.currency),internet:quote(c.currency,'20')}}]))});

test('one snapshot fills all cities before the user opens any of them',()=>{
 const drafts=new Map();applyAllDestinations(drafts,cities,snapshot(),c=>({lines:makeLines(c.currency)}),{now});
 assert.equal(drafts.size,9);
 for(const c of cities){const lines=drafts.get(c.id).lines;assert.equal(lines[0].amount,'100');assert.equal(lines[0].currency,c.currency);assert.equal(lines.find(l=>l.id==='internet').enabled,false);assert.equal(lines.find(l=>l.id==='flight').amount,'');}
});

test('later snapshot refreshes estimates but preserves manual zero, cleared input and exclusion',()=>{
 const c=cities[0],s=snapshot(),lines=makeLines(c.currency);
 applyMarketPrices(lines,s,c,{now});
 s.cities[c.id].items.rent.amount='120';applyMarketPrices(lines,s,c,{now});assert.equal(lines[0].amount,'120');
 Object.assign(lines[0],{amount:'0',origin:'manual',edited:true});applyMarketPrices(lines,s,c,{now});assert.equal(lines[0].amount,'0');
 Object.assign(lines[0],{amount:'',edited:true});applyMarketPrices(lines,s,c,{now});assert.equal(lines[0].amount,'');
 applyMarketPrices(lines,s,c,{now,fillCleared:true});assert.equal(lines[0].amount,'120');
 const internet=lines.find(l=>l.id==='internet');assert.equal(internet.enabled,false);
});

test('old, future, wrong-currency, sparse and invalid prices cannot enter calculations',()=>{
 const c=cities[0];
 for(const patch of [{sourceDate:'2026-01-01'},{sourceDate:'2026-10-01'},{sourceDate:'invalid'},{currency:'USD'},{samples:2},{amount:'-1'},{amount:'NaN'},{amount:'0'},{basis:'room'},{period:'once'}]){
  const s=snapshot();s.cities[c.id].items={rent:{...quote(c.currency),...patch}};
  assert.equal(freshPriceEntries(s,c,now).length,0);
 }
});

test('a failed refresh cannot downgrade an automatic price or replace demo amounts',()=>{
 const c=cities[0],s=snapshot(),lines=makeLines(c.currency);applyMarketPrices(lines,s,c,{now});
 Object.assign(lines[0],{sourceDate:'2026-09-20',amount:'999'});applyMarketPrices(lines,s,c,{now});assert.equal(lines[0].amount,'999');
 Object.assign(lines[0],{sourceDate:null,origin:'example',amount:'123'});applyMarketPrices(lines,s,c,{now});assert.equal(lines[0].amount,'123');
});

test('utilities retain the 85 square metre basis instead of becoming a per-person charge',()=>{
 const c=cities[0],catalog={items:[{item_id:1,name:'Basic (Electricity, Heating, Cooling, Water, Garbage) for 85m2 Apartment'}]};
 const data={name:c.query,currency:c.currency,monthLastUpdate:9,yearLastUpdate:2026,prices:[{item_id:1,average_price:1500,data_points:5}]};
 const result=normalizePrices(data,catalog,c,now);assert.equal(result.items.utilities.amount,'1500.00');assert.equal(result.items.utilities.basis,'household');assert.match(result.items.utilities.note,/85 м²/);
});
