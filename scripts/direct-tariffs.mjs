import {pageText} from './public-sources.mjs';
import {priceFresh} from '../src/market-prices.mjs';
export const tariffUrls={
 magti:'https://www.magticom.ge/en/mobile/tariffs/unlimited-cocktails',
 a1:'https://a1.rs/privatni/prepaid/mesecni_planovi',
 ucom:'https://www.ucom.am/en/prepaid-levelup',
 taxi:'https://www.thailand.go.th/useful-information-detail/009_127?hl=en'
};
function quote(amount,currency,source,key,note,now){
 if(!Number.isFinite(amount)||amount<=0||amount>100000)throw new Error('Invalid tariff');
 return {amount:amount.toFixed(2),currency,source,sourceUrl:tariffUrls[key],kind:'official_tariff',samples:1,basis:'person',period:'monthly',sourceDate:null,checkedAt:now.toISOString(),note};
}
export function parseMagti(html,now=new Date()){
 const match=pageText(html).match(/Everything Unlimited \(30 day\)\s+Unlimited\s+50000 MB\s+Unlimited\s+Unlimited\s+(\d+(?:\.\d+)?)\s+30\s+Day/);
 if(!match)throw new Error('Magti plan or allowance changed');
 return quote(Number(match[1]),'GEL','Magti','magti','Everything Unlimited: пакет на 30 дней, 50 ГБ по правилам добросовестного использования. На странице отмечен как Promo; цена продления и доступность проверяются у оператора. SIM и подключение отдельно.',now);
}
export function parseA1(html,now=new Date()){
 const block=html.match(/<h4[^>]*>\s*Mega plan\s*<\/h4>([\s\S]*?)(?:<h4[^>]*>\s*Top plan|$)/i)?.[1];
 if(!block||!pageText(block).includes('Traje 30 dana'))throw new Error('A1 plan or period changed');
 const price=block.match(/<h3[^>]*>\s*([\d.]+)\s*<\/h3>\s*<p[^>]*>\s*dinara\s*<\/p>/i);
 if(!price)throw new Error('A1 renewal price missing');
 return quote(Number(price[1].replaceAll('.','')),'RSD','A1 Serbia','a1','Mega plan: обычная цена пакета на 30 дней, без временной скидки на SIM или перенос номера. Объём трафика и условия — на странице оператора. Требуется регистрация SIM; подключение отдельно.',now);
}
export function parseUcom(html,now=new Date()){
 const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
 const table=tables.find(m=>pageText(m[1]).includes('Level Up+ 3000'))?.[1];
 if(!table||!pageText(html).includes('valid for 30 days'))throw new Error('Ucom plan or period changed');
 const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(cell=>pageText(cell[1])));
 const index=rows[0]?.indexOf('Level Up+ 3000');
 const match=index>=0?rows[1]?.[index]?.match(/^([\d\s]+)\s*֏$/):null;
 if(!match)throw new Error('Ucom price column changed');
 return quote(Number(match[1].replaceAll(' ','')),'AMD','Ucom','ucom','Level Up+ 3000: пакет на 30 дней. Используется обычная цена, без акций со смартфоном. Разовая активация и услуги сверх пакета отдельно; ограничения раздачи интернета и объём трафика проверяйте у оператора.',now);
}
export function bangkokFare(start,perKm,now=new Date()){
 if(start<20||start>200||perKm<1||perKm>50)throw new Error('Implausible meter fare');
 const result=quote(20*(start+4*perKm),'THB','Thailand.go.th / Ministry of Transport','taxi','20 поездок по 5 км на большом такси по счётчику: первый километр уже входит в начальную плату, оплачиваются ещё 4 км. Без пробок, вызова, платных дорог и аэропортовых сборов. Это опубликованная государственная сетка, не цена Grab. Статья обновлена в 2023 году; проверка страницы не подтверждает отсутствие более нового тарифа.',now);
 result.components=[{label:'Первый километр',quantity:20,unitAmount:start.toFixed(2),currency:'THB'},{label:'Дополнительный километр',quantity:80,unitAmount:perKm.toFixed(2),currency:'THB'}];
 return result;
}
export function parseBangkokTaxi(html,now=new Date()){
 const text=pageText(html);
 const large=text.match(/1\. Large taxis[\s\S]*?(?=2\. For small taxis)/)?.[0];
 const first=large?.match(/first 1 kilometer distance is (\d+\.\d+) baht/i);
 const next=large?.match(/over 1 kilometer to the 10th kilometer, the rate is (\d+\.\d+) baht per kilometer/i);
 if(!first||!next)throw new Error('Bangkok fare structure changed');
 const start=Number(first[1]),perKm=Number(next[1]);
 const result=bangkokFare(start,perKm,now);
 result.sourceDate=text.match(/Updated\s+(\d{4}-\d{2}-\d{2})/)?.[1]??null;
 return result;
}
export async function collectDirectTariffs(previous,get,now=new Date()){
 const snapshot=structuredClone(previous),errors=[],warnings=[];
 for(const [city,key,source,parse]of [['tbilisi','phone','magti',parseMagti],['belgrade','phone','a1',parseA1],['yerevan','phone','ucom',parseUcom],['bangkok','transport','taxi',parseBangkokTaxi]]){
  try{const value=parse(await (await get(tariffUrls[source])).text(),now);snapshot.cities[city].items[key]=value;}
  catch(e){
   const old=snapshot.cities[city]?.items?.[key];
   if(source==='taxi'&&old?.verificationMethod==='manual'&&priceFresh(old,now)){
    warnings.push('Bangkok taxi: automatic reading unavailable; manually reviewed fare retained with its ORIGINAL review date and 30-day expiry.');continue;
   }
   if(old&&old.sourceUrl!==tariffUrls[source])old.needsVerification=true;
   errors.push(`${source}: ${e.message}; previous verification date retained.`);
  }
 }
 return {snapshot,errors,warnings};
}
