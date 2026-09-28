import {assess} from './compare.mjs';
import {rateFresh,ageDays,decimal} from './calculate.mjs';
import {freshPriceEntries,rentalForMonths} from './market-prices.mjs';
import {familyInput,familyExpenses,childFoodQuote} from './family.mjs';
export const categories={rent:'Жильё',food:'Питание',utilities:'Коммунальные услуги',internet:'Домашний интернет',phone:'Мобильная связь',transport:'Транспорт'};
export function validatePersonal(personal){
 const labels={savings:'Накопления',income:'Доход',obligations:'Обязательства'};
 for(const [key,label] of Object.entries(labels)){
  try{decimal(personal[key]);}catch(cause){
   const error=new Error(`${label}: ${cause.message}`);error.field=key;throw error;
  }
 }
 if(![3,6,12].includes(Number(personal.months))){const error=new Error('Выберите срок: 3, 6 или 12 месяцев.');error.field='months';throw error;}
 familyInput(personal);
}
export function scenario(city,personal,prices,rates,now=new Date(),familyCatalog=null){
 validatePersonal(personal);
 const family=familyInput(personal);
 if(!rateFresh(rates,now))return {city,unavailable:'Курсы валют устарели или недоступны. Ждём обновления.'};
 const entries=new Map(freshPriceEntries(prices,city,now));
 if(family.bedrooms===3){
  const housing=prices?.cities?.[city.id]?.familyHousing;
  if(!housing?.rent3||!freshPriceEntries({cities:{[city.id]:{currency:city.currency,items:{rent:housing.rent3}}}},city,now).length)return {city,unavailable:'Нет свежего ориентира квартиры с тремя спальнями. Выберите другой размер или дождитесь обновления.'};
  entries.set('rent',housing.rent3);
  if(housing.utilities85&&freshPriceEntries({cities:{[city.id]:{currency:city.currency,items:{utilities:housing.utilities85}}}},city,now).length)entries.set('utilities',housing.utilities85);
 }
 if(entries.has('rent')){
  const rental=rentalForMonths(entries.get('rent'),personal.months);
  if(!rental)return {city,unavailable:'Меньше трёх объявлений после исключения неподходящих сроков аренды.'};
  entries.set('rent',rental);
 }
 const missing=Object.keys(categories).filter(key=>!entries.has(key));
 if(missing.length)return {city,unavailable:`Нет свежих цен: ${missing.map(key=>categories[key].toLowerCase()).join(', ')}.`};
 const lines=Object.entries(categories).map(([id,label])=>({id,label,...entries.get(id),enabled:true}));
 for(const line of lines){
  line.quantity=line.id==='food'?family.adults:line.id==='phone'?family.adults+family.children.filter(c=>c.age>=12).length:line.id==='transport'?Math.ceil(family.people/4):1;
  line.basis='household';
 }
 const olderChildren=family.children.filter(c=>c.age>=3).length;
 if(olderChildren){
  try{const food=childFoodQuote(entries.get('food'));entries.set('child-food',food);lines.push({id:'child-food',label:'Питание детей от 3 лет',...food,quantity:olderChildren,basis:'household',enabled:true});}
  catch{return {city,unavailable:'Не удалось проверить состав продуктовой корзины для детей.'};}
 }
 const additional=familyExpenses(city,family,familyCatalog,now);
 lines.push(...additional.lines);
 for(const line of lines){
  if(!rates.rates[line.currency])return {city,unavailable:`Нет курса ${line.currency}.`};
  const cross=rates.quotes?.[line.currency];
  if(cross&&(ageDays(cross.effectiveDate,now)<-1||ageDays(cross.effectiveDate,now)>7))return {city,unavailable:`Курс ${line.currency} требует обновления.`};
 }
 const rub=amount=>({amount,currency:'RUB',basis:'household'});
 lines.push({id:'obligations',label:'Ваши обязательства',...rub(personal.obligations),period:'monthly',enabled:true});
 try{
  const result=assess({people:family.people,months:personal.months,advance:1,buffer:'10',reserveMonths:1,spread:'0',incomeStart:1,
   lines,savings:rub(personal.savings),income:rub(personal.income),deposit:rub(family.extras.deposit),exitReserve:rub('0')},rates.rates);
  return {city,...result,fits:result.fits&&!additional.missing.length,buffer:result.monthlyPlanned-result.monthly,quotes:entries,family,additional,incomplete:additional.missing.length>0};
 }catch(error){return {city,unavailable:`Не удалось рассчитать выбранные статьи: ${error.message}`};}
}
