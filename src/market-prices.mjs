import {ageDays,decimal} from './calculate.mjs';

export function priceFresh(quote,now=new Date()){
 const direct=['official_tariff','listing_sample','city_reference'].includes(quote.kind);
 const checkedAge=ageDays(quote.checkedAt,now),sourceAge=ageDays(quote.sourceDate,now);
 if(direct&&!(checkedAge>=0&&checkedAge<=7))return false;
 return quote.kind==='official_tariff'||sourceAge>=0&&sourceAge<=45;
}

export function freshPriceEntries(snapshot,city,now=new Date()){
 const record=snapshot?.cities?.[city.id];
 if(!record||record.currency!==city.currency)return [];
 return Object.entries(record.items??{}).filter(([,quote])=>{
  try{
   const reference=quote.kind==='city_reference'&&quote.source==='Nomadlio'&&quote.currency==='USD'&&quote.samples===null;
   return priceFresh(quote,now)&&(reference||quote.currency===city.currency)&&decimal(quote.amount)>0n
    &&(reference||Number.isInteger(quote.samples)&&quote.samples>=(quote.kind==='official_tariff'?1:3))
    &&['household','person'].includes(quote.basis)&&quote.period==='monthly';
  }catch{return false;}
 });
}

// Refresh automatic values only. A deliberate edit, zero or exclusion belongs to the user.
export function applyMarketPrices(lines,snapshot,city,{now=new Date(),fillCleared=false}={}){
 const record=snapshot?.cities?.[city.id];let count=0;
 const entries=freshPriceEntries(snapshot,city,now),ids=new Set(entries.map(([id])=>id));
 for(const line of lines)if(line.origin==='estimate'&&!ids.has(line.id)){line.amount='';line.origin='manual';line.edited=false;}
 for(const [id,quote]of entries){
  const line=lines.find(line=>line.id===id);
  if(!line||line.origin==='example')continue;
  const blank=!String(line.amount).trim();
  if(line.origin!=='estimate'&&(!blank||line.edited&&!fillCleared))continue;
  if(line.origin==='estimate'&&line.sourceDate>quote.sourceDate)continue;
  Object.assign(line,{amount:quote.amount,currency:quote.currency,basis:quote.basis,period:quote.period,
   origin:'estimate',edited:false,sourceDate:quote.sourceDate,samples:quote.samples,
   source:quote.source??record.source,sourceUrl:quote.sourceUrl??record.sourceUrl,priceNote:quote.note??'',fetchedAt:record.fetchedAt,
   kind:quote.kind,checkedAt:quote.checkedAt,evidence:quote.evidence??[]});
  count++;
 }
 return count;
}

export function applyAllDestinations(drafts,cities,snapshot,create,{now=new Date()}={}){
 for(const city of cities){
  const draft=drafts.get(city.id)??create(city);
  applyMarketPrices(draft.lines,snapshot,city,{now});
  drafts.set(city.id,draft);
 }
}
