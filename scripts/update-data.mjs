import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import https from 'node:https';
import {cities} from '../src/catalog.mjs';
import {parseCbr,crossMyr,normalizePrices} from './providers.mjs';
import {collectPublicPrices} from './public-sources.mjs';
import {collectCityReferences} from './city-references.mjs';
import {collectDirectTariffs} from './direct-tariffs.mjs';
const root=new URL('../data/',import.meta.url),now=new Date();
async function read(name){return JSON.parse(await readFile(new URL(name,root),'utf8'));}
async function save(name,data){const target=fileURLToPath(new URL(name,root));await writeFile(target+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(target+'.tmp',target);}
async function get(url,headers={}){
 // VNPT's server offers an undersized finite-field DH group. Negotiate strong ECDHE
 // instead; certificate verification and TLS security levels remain enabled.
 if(new URL(url).hostname==='vnpt.vn')return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers,ciphers:'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',signal:AbortSignal.timeout(25000)},res=>{
   if(res.statusCode!==200){res.resume();reject(new Error(`Source returned HTTP ${res.statusCode}`));return;}
   let bytes=0;const chunks=[];
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>2000000){req.destroy(new Error('Page too large'));return;}chunks.push(chunk);});
   res.on('end',()=>resolve(new Response(Buffer.concat(chunks))));res.on('error',reject);
  });req.on('error',reject);
 });
 const r=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`Source returned HTTP ${r.status}`);return r;
}
let failures=0;
try{
 const date=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric'}).format(now);
 const cbr=parseCbr(await (await get(`https://www.cbr.ru/scripts/XML_daily_eng.asp?date_req=${encodeURIComponent(date)}`)).text());
 const quotes={};
 try{const bnm=await (await get('https://api.bnm.gov.my/public/exchange-rate/USD?session=1200&quote=rm',{Accept:'application/vnd.BNM.API.v1+json'})).json();const q=crossMyr(cbr,bnm);cbr.rates.MYR=q.value;quotes.MYR=q;}
 catch{const previous=await read('rates.json');if(previous.quotes?.MYR){quotes.MYR=previous.quotes.MYR;cbr.rates.MYR=previous.rates.MYR;}failures++;console.error('MYR refresh failed; previous source date preserved.');}
 await save('rates.json',{...cbr,quotes,status:'loaded',fetchedAt:now.toISOString()});
 console.log(`Currencies: source date ${cbr.effectiveDate}; refreshed ${now.toISOString()}.`);
}catch{failures++;console.error('Currency refresh failed. Existing amounts and source dates were preserved.');}
// The owner must have a license covering display/publication of the selected data.
const key=process.env.NUMBEO_API_KEY;
if(key&&process.env.NUMBEO_DISPLAY_LICENSE_CONFIRMED==='true'){
 const previous=await read('prices.json');const results={...previous.cities};let success=0;
 try{
  const catalog=await (await get('https://www.numbeo.com/api/items',{'X-Api-Key':key})).json();
  if(!Array.isArray(catalog.items))throw new Error('Invalid item catalog');
  for(const city of cities){try{
   const params=new URLSearchParams({query:city.query,currency:city.currency,strict_matching:'true',use_estimated:'false'});
   const data=await (await get(`https://www.numbeo.com/api/city_prices?${params}`,{'X-Api-Key':key})).json();
   results[city.id]=normalizePrices(data,catalog,city,now);success++;
  }catch{failures++;console.error(`Price refresh failed for ${city.id}; existing source dates were preserved.`);}}
  await save('prices.json',{provider:'Numbeo',status:success===cities.length?'connected':'partial',fetchedAt:success?now.toISOString():previous.fetchedAt,cities:results});
 }catch{failures++;console.error('Price provider unavailable; existing data were preserved.');}
}else console.log('Numbeo not connected; collecting the configured public websites.');
try{
 const publicResult=await collectPublicPrices(await read('prices.json'),get,now);
 const references=await collectCityReferences(publicResult.snapshot,get,now);
 const direct=await collectDirectTariffs(references.snapshot,get,now);
 await save('prices.json',direct.snapshot);
 for(const message of direct.warnings)console.warn(message);
 for(const message of [...publicResult.errors,...references.errors,...direct.errors]){failures++;console.error(message);}
 console.log('Public websites checked. Each price retains its own source and verification date.');
}catch{failures++;console.error('Public source update failed; previous data retained.');}
if(failures)process.exitCode=1;
