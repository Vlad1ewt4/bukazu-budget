import {decimal} from '../src/calculate.mjs';
export function parseCbr(xml){
 const date=xml.match(/<ValCurs[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/);
 if(!date)throw new Error('CBR: missing date');
 const rates={RUB:'1'};
 for(const m of xml.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g)){
  const get=tag=>m[1].match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1];
  const code=get('CharCode'),nominal=get('Nominal'),value=get('Value');
  if(!/^[A-Z]{3}$/.test(code??'')||!/^\d+$/.test(nominal??'')||!value)throw new Error('CBR: invalid quote');
  const n=BigInt(nominal);if(n<=0n)throw new Error('CBR: invalid nominal');
  const scaled=decimal(value,10)/n;if(scaled<=0n)throw new Error('CBR: invalid value');
  rates[code]=`${scaled/10000000000n}.${String(scaled%10000000000n).padStart(10,'0')}`;
 }
 if(!rates.USD||!rates.EUR)throw new Error('CBR: incomplete response');
 return {source:'Банк России',sourceUrl:'https://www.cbr.ru/development/SXML/',effectiveDate:`${date[3]}-${date[2]}-${date[1]}`,rates};
}
export function crossMyr(cbr,bnm){
 const d=bnm?.data;if(d?.currency_code!=='USD'||d.unit!==1||bnm.meta?.quote!=='rm')throw new Error('BNM: unexpected quote');
 const mid=d.rate?.middle_rate,date=d.rate?.date;
 if(!Number.isFinite(mid)||mid<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date??''))throw new Error('BNM: invalid quote');
 return {value:(Number(cbr.rates.USD)/mid).toFixed(10),effectiveDate:[date,cbr.effectiveDate].sort()[0],source:'Банк России + Bank Negara Malaysia; кросс-курс через USD',sourceUrl:'https://www.bnm.gov.my/exchange-rates',componentDates:{USD_RUB:cbr.effectiveDate,USD_MYR:date}};
}
// Only compatible monthly categories. Never use country or neighbouring-city fallback.
const matches={rent:/Apartment \(1 bedroom\).*Outside of (?:City )?Cent(?:er|re)/i,utilities:/Basic.*Electricity.*(?:85\s*m2|85\s*m²|915\s*sqft)/i,internet:/Internet.*(?:60|Broadband|Unlimited)/i,transport:/Monthly Pass.*Regular Price/i,phone:/Mobile Phone.*Monthly Plan/i};
const notes={rent:'Квартира с одной спальней вне центра. Для семьи и другого района проверьте подходящее жильё.',utilities:'Счета за квартиру 85 м²: электричество, отопление, охлаждение, вода и вывоз мусора. Скорректируйте под своё жильё.',internet:'Домашний интернет. Если он включён в аренду, оставьте статью выключенной.',transport:'Месячный проездной на одного человека. Такси и аренда байка сюда не входят.',phone:'Месячный мобильный тариф на одного человека.'};
export function normalizePrices(data,itemCatalog,city,now=new Date()){
 if(data.currency!==city.currency||!Array.isArray(data.prices))throw new Error('Numbeo: mismatched currency or invalid response');
 const y=data.yearLastUpdate,m=data.monthLastUpdate;
 if(!Number.isInteger(y)||!Number.isInteger(m)||m<1||m>12)throw new Error('Numbeo: missing source date');
 const sourceDate=`${y}-${String(m).padStart(2,'0')}-01`;
 const names=new Map(itemCatalog.items.map(x=>[x.item_id,x.name]));
 const items={};
 for(const [key,rx]of Object.entries(matches)){
  const p=data.prices.find(p=>rx.test(names.get(p.item_id)??''));
  if(!p||!Number.isFinite(p.average_price)||p.average_price<=0||!Number.isFinite(p.data_points)||p.data_points<3)continue;
  items[key]={amount:p.average_price.toFixed(2),low:Number.isFinite(p.lowest_price)?p.lowest_price:null,high:Number.isFinite(p.highest_price)?p.highest_price:null,currency:data.currency,sourceDate,datePrecision:'month',samples:p.data_points,name:names.get(p.item_id),note:notes[key],basis:['rent','internet','utilities'].includes(key)?'household':'person',period:'monthly'};
 }
 return {name:data.name,query:city.query,currency:data.currency,source:'Numbeo',sourceUrl:`https://www.numbeo.com/cost-of-living/in/${encodeURIComponent(city.query.split(',')[0].replaceAll(' ','-'))}`,sourceDate,fetchedAt:now.toISOString(),items};
}
