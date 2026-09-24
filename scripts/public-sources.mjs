import {ageDays} from '../src/calculate.mjs';
export const rentUrl='https://danangapartment.net/';
export const phoneUrl='https://vnpt.vn/di-dong/vip199/';
export function pageText(html){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();}
export function listingLinks(html){
 return [...new Set([...html.matchAll(/href="((?:\/en)?\/rentals\/1-bedroom-apartment-[a-z0-9-]+)"/g)].map(m=>new URL(m[1],rentUrl).href))].slice(0,6);
}
export function parseApartment(html,url,now=new Date()){
 const records=[...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m=>{try{return [JSON.parse(m[1])];}catch{return [];}});
 const apartment=records.find(x=>x['@type']==='Apartment'),text=pageText(html);
 if(!apartment)throw new Error('Apartment markup changed');
 const offer=apartment.offers;
 const stamp=text.match(/Last updated\s+([A-Z][a-z]{2} \d{1,2}, \d{4})/);
 if(!stamp)throw new Error('Listing date missing');
 const date=new Date(stamp[1]+' 00:00:00 GMT');if(!Number.isFinite(date.getTime()))throw new Error('Invalid listing date');
 const sourceDate=date.toISOString().slice(0,10);
 if(apartment.numberOfBedrooms!==1||apartment.accommodationCategory!=='APARTMENT'||apartment.address?.addressLocality!=='Da Nang'||apartment.address?.addressCountry!=='VN')return null;
 if(offer?.availability!=='https://schema.org/InStock'||offer.priceCurrency!=='VND'||!Number.isFinite(offer.price)||offer.price<1000000||offer.price>100000000)return null;
 if(ageDays(sourceDate,now)<0||ageDays(sourceDate,now)>45||!/(?:monthly rent|\/month|per month)/i.test(text))return null;
 // A lower bound or a short-stay rate must not be represented as a fixed monthly asking price.
 if(/ranging|\bfrom\s+[\d,]+\s+(?:to|VND)|\d[\d,]*\s*(?:-|–|to)\s*\d[\d,]*\s*VND/i.test(apartment.description??''))return null;
 return {amount:offer.price,sourceDate,url};
}
export function rentQuote(listings,now=new Date()){
 const rows=[...new Map(listings.filter(Boolean).map(x=>[x.url,x])).values()];
 if(rows.length<3)return null;
 const amounts=rows.map(x=>x.amount).sort((a,b)=>a-b),middle=Math.floor(amounts.length/2);
 const median=amounts.length%2?amounts[middle]:(amounts[middle-1]+amounts[middle])/2;
 return {amount:median.toFixed(2),currency:'VND',basis:'household',period:'monthly',kind:'listing_sample',samples:rows.length,
  source:'Da Nang Apartments',sourceUrl:rentUrl,sourceDate:rows.map(x=>x.sourceDate).sort()[0],checkedAt:now.toISOString(),maxCheckAgeDays:7,
  low:amounts[0],high:amounts.at(-1),evidence:rows,
  note:`Медиана небольшой выборки: ${rows.length} объявлений квартир с одной спальней из текущей первой страницы каталога. Не средняя по всему городу. Депозит, срок аренды и дополнительные счета уточняются отдельно; наличие подтвердите у владельца.`};
}
export function parseVnpt(html,now=new Date()){
 const name=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
 const price=html.match(/<p\b[^>]*id="package_price"[^>]*>\s*([\d.]+)\s*Đ\/THÁNG\s*<\/p>/i);
 if(pageText(name?.[1]??'')!=='VIP199'||!price)throw new Error('VNPT plan or billing period changed');
 const amount=Number(price[1].replaceAll('.',''));
 if(!Number.isSafeInteger(amount)||amount<10000||amount>2000000)throw new Error('VNPT price invalid');
 return {amount:amount.toFixed(2),currency:'VND',basis:'person',period:'monthly',kind:'official_tariff',samples:1,
  source:'VNPT / VinaPhone',sourceUrl:phoneUrl,sourceDate:null,checkedAt:now.toISOString(),maxCheckAgeDays:7,
  note:'VIP199: опубликованная цена месячного пакета, с НДС. Это выбранный тариф, не средняя стоимость связи. Новые предоплатные SIM: подключение в первые 30 дней; для действующих есть условия. SIM, активация и услуги сверх пакета отдельно. Ограничение переноса номера — 540 дней. Доступность для вашей SIM уточните у оператора.'};
}

export async function collectPublicPrices(previous,get,now=new Date()){
 const next=structuredClone(previous),errors=[];next.cities??={};
 function put(city,key,value){const record=next.cities[city]??={currency:'VND',items:{}};record.items??={};if(value)record.items[key]=value;else delete record.items[key];record.fetchedAt=now.toISOString();}
 try{
  const plan=parseVnpt(await (await get(phoneUrl)).text(),now);
  for(const city of ['danang','nhatrang'])put(city,'phone',plan);
 }catch{errors.push('VNPT: source fetch or format failed; previous check date retained.');}
 try{
  const links=listingLinks(await (await get(rentUrl)).text());
  if(!links.length)throw new Error('No listing links');
  const rows=[];let failed=0;
  for(const url of links){try{rows.push(parseApartment(await (await get(url)).text(),url,now));}catch{failed++;}}
  if(failed)throw new Error('Incomplete listing sample');
  put('danang','rent',rentQuote(rows,now));
 }catch{errors.push('Da Nang Apartments: source fetch or format failed; previous check date retained.');}
 next.provider='Открытые сайты / доступные API';next.status='partial';
 next.note='Частичное покрытие: аренда Дананга и мобильный тариф Вьетнама. Остальные расходы требуют отдельных источников или ваших сумм. Даты хранятся у каждой цены.';
 return {snapshot:next,errors};
}
