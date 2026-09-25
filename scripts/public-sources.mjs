import {ageDays} from '../src/calculate.mjs';
export const rentUrl='https://danangapartment.net/';
export const phoneUrl='https://vnpt.vn/di-dong/vip199/';
export function pageText(html){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();}
export function listingLinks(html){
 return [...new Set([...html.matchAll(/href="((?:\/en)?\/rentals\/(?:1-bedroom-apartment|apartment)-[a-z0-9-]+)"/g)].map(m=>new URL('/en'+m[1].replace(/^\/en/,''),rentUrl).href))].sort().slice(0,24);
}
export function cohortValid(cohort,now){return ageDays(cohort?.createdAt,now)>=0&&ageDays(cohort?.createdAt,now)<7&&Array.isArray(cohort?.urls)&&cohort.urls.length>0&&cohort.urls.length<=24&&cohort.urls.every(url=>/^https:\/\/danangapartment\.net\/en\/rentals\/(?:1-bedroom-apartment|apartment)-[a-z0-9-]+$/.test(url));}
export async function rentalCohort(previous,get,now){
 if(cohortValid(previous.rentalCohort,now))return previous.rentalCohort;
 let url=rentUrl;const visited=new Set(),urls=new Set();
 for(let page=0;page<3&&url;page++){
  visited.add(url);const html=await (await get(url)).text();
  for(const link of listingLinks(html))urls.add(link);
  const pages=[...html.matchAll(/href="([^"<>]+)"/g)].map(m=>{try{return new URL(m[1].replaceAll('&amp;','&'),rentUrl);}catch{return null;}}).filter(u=>u?.origin===new URL(rentUrl).origin&&u.pathname==='/'&&/^[23]$/.test(u.searchParams.get('page')??'')).sort((a,b)=>Number(a.searchParams.get('page'))-Number(b.searchParams.get('page')));
  url=pages.find(u=>!visited.has(u.href))?.href;
 }
 if(!urls.size)throw new Error('No rental cohort candidates');
 return {createdAt:now.toISOString(),urls:[...urls].sort().slice(0,24)};
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
 const term=String(apartment.description??'').match(/(?:minimum (?:rental|lease|stay)(?: period)?|minimum|at least)\s*[:\-]?\s*(\d+)\s*months?/i);
 return {amount:offer.price,sourceDate,url,minimumMonths:term?Number(term[1]):null};
}
export function rentQuote(listings,now=new Date()){
 const rows=[...new Map(listings.filter(Boolean).map(x=>[x.url,x])).values()];
 if(rows.length<3)return null;
 const amounts=rows.map(x=>x.amount).sort((a,b)=>a-b),middle=Math.floor(amounts.length/2);
 const median=amounts.length%2?amounts[middle]:(amounts[middle-1]+amounts[middle])/2;
 return {amount:median.toFixed(2),currency:'VND',basis:'household',period:'monthly',kind:'listing_sample',samples:rows.length,
  source:'Da Nang Apartments',sourceUrl:rentUrl,sourceDate:rows.map(x=>x.sourceDate).sort()[0],checkedAt:now.toISOString(),maxCheckAgeDays:7,
  low:amounts[0],high:amounts.at(-1),evidence:rows,
  note:`Медиана фиксированной выборки квартир с одной спальней в разных районах. Объявлений в выборке: ${rows.length}. Проверяем те же объекты в течение 7 дней, затем пересобираем выборку из первых трёх страниц (до 24 кандидатов). Это не средняя по городу; изменение состава и цены возможно при снятии объявления. Минимальный срок, депозит, включённые счета и наличие подтвердите у владельца. Если срок в объявлении не указан, пригодность для короткой аренды не подтверждена.`};
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
  const cohort=await rentalCohort(previous,get,now),links=cohort.urls;
  const rows=[];let failed=0;
  // Keep requests bounded, with at most three in flight for the same public site.
  for(let offset=0;offset<links.length;offset+=3){
   const batch=await Promise.allSettled(links.slice(offset,offset+3).map(async url=>parseApartment(await (await get(url)).text(),url,now)));
   for(const result of batch)if(result.status==='fulfilled')rows.push(result.value);else failed++;
  }
  if(failed)throw new Error('Incomplete listing sample');
  const value=rentQuote(rows,now);
  if(value)value.cohortStartedAt=cohort.createdAt;
  put('danang','rent',value);next.rentalCohort=cohort;
 }catch{errors.push('Da Nang Apartments: source fetch or format failed; previous check date retained.');}
 next.provider='Открытые сайты / доступные API';next.status='partial';
 next.note='Частичное покрытие: аренда Дананга и мобильный тариф Вьетнама. Остальные расходы требуют отдельных источников или ваших сумм. Даты хранятся у каждой цены.';
 return {snapshot:next,errors};
}
