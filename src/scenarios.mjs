import {assess} from './compare.mjs';
import {rateFresh,ageDays,decimal} from './calculate.mjs';
import {freshPriceEntries,rentalForMonths} from './market-prices.mjs';
export const categories={rent:'Жильё',food:'Питание',utilities:'Коммунальные услуги',internet:'Домашний интернет',phone:'Мобильная связь',transport:'Транспорт'};
export function validatePersonal(personal){
 for(const key of ['savings','income','obligations'])decimal(personal[key]);
 if(![3,6,12].includes(Number(personal.months)))throw new Error('Выберите срок: 3, 6 или 12 месяцев.');
}
export function scenario(city,personal,prices,rates,now=new Date()){
 validatePersonal(personal);
 if(!rateFresh(rates,now))return {city,unavailable:'Курсы валют устарели или недоступны. Ждём обновления.'};
 const entries=new Map(freshPriceEntries(prices,city,now));
 if(entries.has('rent')){
  const rental=rentalForMonths(entries.get('rent'),personal.months);
  if(!rental)return {city,unavailable:'Меньше трёх объявлений после исключения неподходящих сроков аренды.'};
  entries.set('rent',rental);
 }
 const missing=Object.keys(categories).filter(key=>!entries.has(key));
 if(missing.length)return {city,unavailable:`Нет свежих цен: ${missing.map(key=>categories[key].toLowerCase()).join(', ')}.`};
 const lines=Object.entries(categories).map(([id,label])=>({id,label,...entries.get(id),enabled:true}));
 for(const line of lines){
  if(!rates.rates[line.currency])return {city,unavailable:`Нет курса ${line.currency}.`};
  const cross=rates.quotes?.[line.currency];
  if(cross&&(ageDays(cross.effectiveDate,now)<-1||ageDays(cross.effectiveDate,now)>7))return {city,unavailable:`Курс ${line.currency} требует обновления.`};
 }
 const rub=amount=>({amount,currency:'RUB',basis:'household'});
 lines.push({id:'obligations',label:'Ваши обязательства',...rub(personal.obligations),period:'monthly',enabled:true});
 const result=assess({people:1,months:personal.months,advance:1,buffer:'10',reserveMonths:1,spread:'0',incomeStart:1,
  lines,savings:rub(personal.savings),income:rub(personal.income),deposit:rub('0'),exitReserve:rub('0')},rates.rates);
 return {city,...result,buffer:result.monthlyPlanned-result.monthly,quotes:entries};
}
