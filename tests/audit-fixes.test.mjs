import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMagti,parseA1,parseUcom,parseBangkokTaxi,bangkokFare,collectDirectTariffs} from '../scripts/direct-tariffs.mjs';
import {rentalCohort,cohortValid,listingLinks,rentQuote} from '../scripts/public-sources.mjs';
import {priceFresh,rentalForMonths,freshPriceEntries} from '../src/market-prices.mjs';
const now=new Date('2026-09-25T12:00:00Z');
const taxi='<p>Updated 2023-07-12</p><p>1. Large taxis The first 1 kilometer distance is 40.00 baht; Distance over 1 kilometer to the 10th kilometer, the rate is 6.50 baht per kilometer; 2. For small taxis</p>';
test('Bangkok five kilometres includes the first kilometre exactly once',()=>{
 const q=parseBangkokTaxi(taxi,now);assert.equal(q.amount,'1320.00');assert.equal(q.currency,'THB');assert.equal(q.components[1].quantity,80);assert.equal(q.sourceDate,'2023-07-12');
 assert.throws(()=>parseBangkokTaxi('<html>Challenge</html>',now));
 assert.throws(()=>parseBangkokTaxi(taxi.replace('first 1 kilometer','first 2 kilometers'),now));
 assert.throws(()=>parseBangkokTaxi(taxi.replace('10th kilometer','5th kilometer'),now));
});
test('manual fare expires even if collectors repeatedly fail; bad legacy estimates cannot return',async()=>{
 const q={...bangkokFare(40,6.5,now),verificationMethod:'manual',reviewDueAt:'2026-10-25T12:00:00Z'};
 assert.equal(priceFresh(q,new Date('2026-10-20')),true);assert.equal(priceFresh(q,new Date('2026-10-25T12:00:01Z')),false);
 const previous={cities:{bangkok:{currency:'THB',items:{transport:q}}}};
 const r=await collectDirectTariffs(previous,async()=>{throw new Error('offline');},new Date('2026-09-26'));
 assert.deepEqual(r.snapshot.cities.bangkok.items.transport,q);assert.equal(r.warnings.length,1);
 const old={...q,kind:'city_reference',verificationMethod:undefined,sourceUrl:'https://nomadlio.com/bangkok/cost-of-living/'};
 previous.cities.bangkok.items.transport=old;
 const failed=await collectDirectTariffs(previous,async()=>{throw new Error('offline');},now);
 assert.equal(failed.snapshot.cities.bangkok.items.transport.needsVerification,true);
 assert.equal(freshPriceEntries(failed.snapshot,{id:'bangkok',currency:'THB'},now).length,0);
});
test('phone parsers read the chosen plan and billing period instead of promotional prices',()=>{
 const magti='<p>Everything Unlimited (30 day) Unlimited 50000 MB Unlimited Unlimited 45 30&nbsp;Day</p>';
 assert.equal(parseMagti(magti,now).amount,'45.00');assert.throws(()=>parseMagti(magti.replace('(30 day)','(7 day)'),now));
 const a1='<h4>Mega plan</h4><p>Traje 30 dana</p><p>400 RSD addon</p><h3>1.000</h3><p>dinara</p><h4>Top plan</h4><h3>700</h3><p>dinara</p>';
 assert.equal(parseA1(a1,now).amount,'1000.00');assert.throws(()=>parseA1(a1.replace('30 dana','7 dana'),now));
 const ucom='<table><tr><th>Level Up+ 2500</th><th>Level Up+ 3000</th></tr><tr><td>2 500 ֏</td><td>3 000&nbsp;֏</td></tr></table><p>valid for 30 days</p>';
 assert.equal(parseUcom(ucom,now).amount,'3000.00');assert.throws(()=>parseUcom(ucom.replace('valid for 30 days','valid for 7 days'),now));
});
test('cohort remains fixed within a week even when the catalog changes; foreign URLs rejected',async()=>{
 const cohort={createdAt:now.toISOString(),urls:['https://danangapartment.net/en/rentals/1-bedroom-apartment-a']};
 const next=await rentalCohort({rentalCohort:cohort},async()=>{throw new Error('Catalog should not be requested');},new Date('2026-09-26'));
 assert.deepEqual(next,cohort);assert.equal(cohortValid(cohort,new Date('2026-10-03')),false);
 assert.equal(cohortValid({...cohort,urls:['https://other.test/']},now),false);
 assert.equal(listingLinks('<a href="/en/rentals/apartment-a">a</a><a href="/rentals/apartment-a">b</a>').length,1);
});
test('cohort discovery follows only three observed catalog pages; listing order cannot select prices',async()=>{
 const calls=[];
 const get=async url=>{calls.push(url);const n=Number(new URL(url).searchParams.get('page')??1);return new Response(`<a href="/en/rentals/1-bedroom-apartment-${n}">x</a><a href="/?page=${n+1}">Next</a>`);};
 const c=await rentalCohort({},get,now);assert.equal(c.urls.length,3);assert.equal(calls.length,3);assert.ok(!calls.some(url=>url.includes('page=4')));
});
test('long-lease offers are excluded by horizon without treating unknown terms as confirmed',()=>{
 const rows=[6,8,10,30].map((price,i)=>({url:`https://example.test/${i}`,amount:price,sourceDate:'2026-09-25',minimumMonths:i===3?12:null}));
 const q=rentQuote(rows,now),short=rentalForMonths(q,3);
 assert.equal(short.amount,'8.00');assert.equal(short.samples,3);assert.equal(short.excludedForTerm,1);assert.equal(short.unknownTermCount,3);
 assert.equal(rentalForMonths({...q,evidence:rows.slice(1)},3),null);
 assert.equal(rentalForMonths(q,12).amount,'9.00');
});
