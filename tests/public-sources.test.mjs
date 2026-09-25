import test from 'node:test';
import assert from 'node:assert/strict';
import {parseApartment,parseVnpt,rentQuote,collectPublicPrices,listingLinks} from '../scripts/public-sources.mjs';
import {freshPriceEntries,priceFresh} from '../src/market-prices.mjs';
const now=new Date('2026-09-24T12:00:00Z');
const apartment=(patch={},date='Sep 23, 2026')=>`<script type="application/ld+json">${JSON.stringify({'@type':'Apartment',numberOfBedrooms:1,accommodationCategory:'APARTMENT',address:{addressLocality:'Da Nang',addressCountry:'VN'},offers:{price:10000000,priceCurrency:'VND',availability:'https://schema.org/InStock'},description:'Monthly rent for an apartment.',...patch})}</script><p>Last updated ${date} Available</p><p>100 /month</p>`;
const tariff='<h1>VIP199</h1><p id="package_price">199.000 Đ/THÁNG</p>';
test('apartment requires matching city, bedrooms, availability, period, date and fixed price',()=>{
 assert.equal(parseApartment(apartment(),'https://example.com/1',now).amount,10000000);
 for(const patch of [{numberOfBedrooms:2},{address:{addressLocality:'Hoi An',addressCountry:'VN'}},{offers:{price:10000000,priceCurrency:'USD',availability:'https://schema.org/InStock'}},{offers:{price:10000000,priceCurrency:'VND',availability:'https://schema.org/OutOfStock'}},{description:'monthly rent ranging from 13,000,000 to 15,000,000 VND'}])assert.equal(parseApartment(apartment(patch),'x',now),null);
 assert.equal(parseApartment(apartment({},'Jan 01, 2026'),'x',now),null);
 assert.equal(parseApartment(apartment({},'Sep 25, 2026'),'x',now),null);
 assert.throws(()=>parseApartment('<html>Unexpected layout</html>','x',now));
});
test('median requires three independent URLs and ignores duplicate URLs',()=>{
 const rows=[10000000,5000000,12000000,6000000].map((amount,i)=>({url:`https://example.com/${i}`,amount,sourceDate:'2026-09-23'}));
 assert.equal(rentQuote(rows.slice(0,2),now),null);
 assert.equal(rentQuote([...rows,rows[0]],now).amount,'8000000.00');
 assert.equal(rentQuote(rows,now).samples,4);
});
test('official tariff has a verification date, not an invented source modification date',()=>{
 const plan=parseVnpt(tariff,now);assert.equal(plan.amount,'199000.00');assert.equal(plan.sourceDate,null);assert.equal(plan.checkedAt,now.toISOString());
 assert.throws(()=>parseVnpt(tariff.replace('THÁNG','NGÀY'),now));
 assert.throws(()=>parseVnpt(tariff.replace('VIP199','OTHER'),now));
 assert.equal(priceFresh(plan,new Date('2026-10-03')),false);
 assert.equal(freshPriceEntries({cities:{danang:{currency:'VND',items:{phone:plan}}}},{id:'danang',currency:'VND'},now).length,1);
});
test('crawler is bounded to 24 canonical apartment URLs on its configured domain',()=>{
 const html=Array.from({length:40},(_,i)=>`<a href="/en/rentals/1-bedroom-apartment-test-${i}">Stay</a>`).join('')+'<a href="https://other.test/rentals/1-bedroom-apartment-x">Wrong site</a>';
 assert.equal(listingLinks(html).length,24);assert.ok(listingLinks(html).every(x=>x.startsWith('https://danangapartment.net/')));
});
test('upstream failures preserve old prices and check dates',async()=>{
 const previous={cities:{danang:{currency:'VND',items:{phone:{amount:'1',checkedAt:'2026-01-01'}}}}};
 const result=await collectPublicPrices(previous,async()=>{throw new Error('offline');},now);
 assert.deepEqual(result.snapshot.cities,previous.cities);assert.equal(result.errors.length,2);
});
test('successful scan with unavailable listings removes old rent rather than refreshing it',async()=>{
 const previous={cities:{danang:{currency:'VND',items:{rent:{amount:'1'}}}}};
 const get=async url=>new Response(url.includes('vip199')?tariff:url.endsWith('.net/')?'<a href="/en/rentals/1-bedroom-apartment-test">Stay</a>':apartment({offers:{price:10000000,priceCurrency:'VND',availability:'https://schema.org/OutOfStock'}}));
 const result=await collectPublicPrices(previous,get,now);assert.equal(result.snapshot.cities.danang.items.rent,undefined);assert.equal(result.errors.length,0);assert.equal(result.snapshot.cities.nhatrang.items.phone.amount,'199000.00');
});
