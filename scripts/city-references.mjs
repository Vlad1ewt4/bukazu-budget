import {ageDays,decimal} from '../src/calculate.mjs';
import {cities} from '../src/catalog.mjs';
import {pageText} from './public-sources.mjs';

export const destinations={danang:['da-nang','Da Nang'],nhatrang:['nha-trang','Nha Trang'],bangkok:['bangkok','Bangkok'],bali:['bali-island','Bali Island'],kl:['kuala-lumpur','Kuala Lumpur'],tbilisi:['tbilisi','Tbilisi'],yerevan:['yerevan','Yerevan'],belgrade:['belgrade','Belgrade'],antalya:['antalya','Antalya']};
// An explicit common shopping basket, not the publisher's opaque total cost estimate.
export const foodBasket=[
 ['Milk 1L',8,'Молоко, 1 л'],['Bread 500g',8,'Хлеб, 500 г'],['Rice 1kg',3,'Рис, 1 кг'],
 ['Eggs (12)',3,'Яйца, 12 шт.'],['Chicken Breast 1kg',4,'Куриное филе, 1 кг'],['Beef 1kg',1,'Говядина, 1 кг'],
 ['Local Cheese 1kg',1,'Сыр, 1 кг'],['Apples 1kg',3,'Яблоки, 1 кг'],['Bananas 1kg',3,'Бананы, 1 кг'],
 ['Tomatoes 1kg',4,'Помидоры, 1 кг'],['Potatoes 1kg',3,'Картофель, 1 кг'],['Onions 1kg',1,'Лук, 1 кг'],
 ['Water 1.5L',20,'Вода, 1,5 л'],['Inexpensive Meal',20,'Приём пищи в недорогом кафе'],['Coffee',12,'Кофе в кафе']
];
const money=n=>`${n/100n}.${String(n%100n).padStart(2,'0')}`;
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function parseCityReference(html,city,now=new Date()){
 const [slug,name]=destinations[city.id]??[];
 const heading=pageText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??'');
 if(!slug||heading!==`Cost of Living in ${name}`||!html.includes('"priceCurrency":"USD"'))throw new Error('City or currency changed');
 const text=pageText(html),stamp=text.match(/Last updated:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/);
 if(!stamp)throw new Error('Source date missing');
 const parsed=new Date(stamp[1]+' 00:00:00 GMT');
 if(!Number.isFinite(parsed.getTime()))throw new Error('Invalid date');
 const sourceDate=parsed.toISOString().slice(0,10);
 if(ageDays(sourceDate,now)<0||ageDays(sourceDate,now)>45)throw new Error('Source date outside freshness window');
 function price(label){
  const match=text.match(new RegExp(`(?:^|\\s)${escape(label)}\\s+\\$([\\d,]+\\.\\d{2})(?=\\s|$)`));
  if(!match)throw new Error(`Missing price: ${label}`);
  const value=decimal(match[1].replaceAll(',',''));
  if(value<=0n||value>10000000n)throw new Error('Invalid price');
  return value;
 }
 function quote(amount,basis,note,components=[]){return {amount:money(amount),currency:'USD',basis,period:'monthly',kind:'city_reference',samples:null,source:'Nomadlio',sourceUrl:`https://nomadlio.com/${slug}/cost-of-living/`,sourceDate,checkedAt:now.toISOString(),note,components};}
 const food=foodBasket.map(([key,quantity,label])=>({label,quantity,unitAmount:money(price(key)),currency:'USD'}));
 const foodTotal=food.reduce((sum,row)=>sum+decimal(row.unitAmount)*BigInt(row.quantity),0n);
 const small=text.includes('Basic Utilities (Small Apartment)');
 const start=price('Taxi Start'),km=price('Taxi (per km)');
 const items={
  rent:quote(price('1 Bedroom Apartment (Outside Center)'),'household','Квартира с одной спальней вне центра. Рыночный ориентир, не предложение конкретного владельца. Депозит отдельно.'),
  food:quote(foodTotal,'person','Одинаковая корзина для сравнения: продукты, 20 приёмов пищи в недорогом кафе и 12 кофе в месяц. Это выбранный сценарий питания, не универсальная норма.',food),
  utilities:quote(price(small?'Basic Utilities (Small Apartment)':'Basic Utilities 85m²'),'household',small?'Коммунальные услуги небольшой квартиры по данным источника. Площадь не указана.':'Источник публикует коммунальные услуги для 85 м². Это ориентир для этой площади; фактический счёт небольшой квартиры может отличаться.'),
  internet:quote(price('Internet'),'household','Отдельный домашний интернет. В этом сценарии не включён в аренду.'),
  phone:quote(price('Phone Plan'),'person','Ориентир стоимости мобильного пакета. Оператор, объём трафика и условия подключения зависят от выбранного тарифа.'),
  transport:quote(20n*(start+5n*km),'person','20 поездок на такси по 5 км в месяц: посадка + расстояние. Без ожидания, повышенного спроса и аэропортовых сборов.',[
   {label:'Посадка в такси',quantity:20,unitAmount:money(start),currency:'USD'},
   {label:'Расстояние, 1 км',quantity:100,unitAmount:money(km),currency:'USD'}])
 };
 return {currency:city.currency,fetchedAt:now.toISOString(),items};
}

export async function collectCityReferences(previous,get,now=new Date()){
 const snapshot=structuredClone(previous),errors=[];snapshot.cities??={};
 // Nine bounded public pages. No accounts, user data, or access-control workarounds.
 for(const city of cities){try{
  const url=`https://nomadlio.com/${destinations[city.id][0]}/cost-of-living/`;
  const record=parseCityReference(await (await get(url)).text(),city,now);
  const existing=snapshot.cities[city.id];
  // Direct listings and official tariffs take precedence, preserving their own dates.
  for(const [key,value]of Object.entries(existing?.items??{}))if(value.kind!=='city_reference')record.items[key]=value;
  snapshot.cities[city.id]=record;
 }catch(e){errors.push(`Nomadlio ${city.id}: ${e.message}; previous dates retained.`);}}
 snapshot.provider='Открытые сайты';snapshot.status=errors.length?'partial':'connected';
 snapshot.note='Рыночные ориентиры из открытых страниц, дополненные прямыми объявлениями и тарифами. Дата страницы не подтверждает свежесть каждого исходного наблюдения. Точные предложения проверяйте перед оплатой.';
 return {snapshot,errors};
}
