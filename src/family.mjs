import {ageDays,decimal} from './calculate.mjs';
export const extraFields={health:'Страховка и медицина',schoolTransport:'Дорога в школу / сад',supplies:'Одежда, учебники и детские вещи',care:'Няня и продлёнка',relocation:'Билеты, документы и обустройство',deposit:'Депозит за жильё'};
function fail(field,message){const error=new Error(message);error.field=field;throw error;}
function count(value,min,max,field,label){const n=Number(value);if(String(value).trim()===''||!Number.isInteger(n)||n<min||n>max)fail(field,`${label}: от ${min} до ${max}.`);return n;}
function amount(value,field,label){try{decimal(value);}catch(e){fail(field,`${label}: ${e.message}`);}return String(value);}
export function familyInput(personal){
 const adults=count(personal.adults??1,1,6,'adults','Взрослые');
 if(!Array.isArray(personal.children??[])||(personal.children?.length??0)>6)fail('children-count','Не больше 6 детей.');
 const children=(personal.children??[]).map((child,i)=>{
  const prefix=`child-${i}`,age=count(child.age,0,17,`${prefix}-age`,`Возраст ребёнка ${i+1}`);
  const education=child.education??'reference',activity=child.activity??'none';
  if(!['reference','manual','none'].includes(education)||!['reference','manual','none'].includes(activity))fail(`${prefix}-education`,'Выберите способ расчёта детских расходов.');
  const result={age,education,activity};
  if(education==='manual'){
   result.educationAmount=amount(child.educationAmount,`${prefix}-education-amount`,'Обучение');
   result.educationEvery=count(child.educationEvery??1,1,12,`${prefix}-education-every`,'Период оплаты обучения');
   result.educationEntry=amount(child.educationEntry??'0',`${prefix}-education-entry`,'Взнос за зачисление');
  }
  if(activity==='manual')result.activityAmount=amount(child.activityAmount,`${prefix}-activity-amount`,'Секции');
  if(age<3)result.babyAmount=amount(child.babyAmount,`${prefix}-baby-amount`,'Питание и расходники малыша');
  return result;
 });
 const housing=personal.housing??'auto';
 if(!['auto','1','3'].includes(housing))fail('housing','Выберите размер квартиры.');
 const extras=Object.fromEntries(Object.entries(extraFields).map(([key,label])=>[key,amount(personal.extras?.[key]??'0',`extra-${key}`,label)]));
 return {adults,children,people:adults+children.length,housing,bedrooms:housing==='auto'?(adults+children.length>2?3:1):Number(housing),extras};
}
const money=n=>`${n/100n}.${String(n%100n).padStart(2,'0')}`;
export function childFoodQuote(quote){
 const components=quote.components?.filter(row=>row.label!=='Кофе в кафе');
 if(!components?.length)throw new Error('Нет состава детской продуктовой корзины.');
 const amount=components.reduce((n,row)=>n+decimal(row.unitAmount)*BigInt(row.quantity),0n);
 return {...quote,amount:money(amount),components,note:'Та же продуктовая корзина и 20 приёмов пищи в кафе, но без кофе. Не возрастная норма питания. Питание в школе не вычитается: возможен консервативный запас.'};
}
export function referenceFresh(item,now){
 return item&&ageDays(item.checkedAt,now)>=0&&ageDays(item.checkedAt,now)<=90&&Number.isFinite(Date.parse(item.reviewDueAt))&&now.getTime()<=Date.parse(item.reviewDueAt+'T23:59:59Z')&&(!item.validUntil||now.getTime()<=Date.parse(item.validUntil+'T23:59:59Z'));
}
export function familyExpenses(city,family,catalog,now=new Date()){
 const lines=[],sources=[],missing=[],notes=[];
 const add=(id,label,amount,currency='RUB',period='monthly',paymentEvery=1)=>lines.push({id,label,amount,currency,period,paymentEvery,basis:'household',enabled:true});
 const record=catalog?.cities?.[city.id];
 function reference(child,i,kind){
  const service=record?.[kind],prefix=`${kind}-${i}`;
  if(!referenceFresh(service,now)){missing.push(`Ребёнок ${i+1}: ${kind==='education'?'обучение':'секции'} — нет свежего подтверждённого тарифа. Выберите свою сумму.`);return;}
  const tariff=kind==='education'?service.rows.find(r=>child.age>=r.minAge&&child.age<=r.maxAge):service;
  if(!tariff||child.age<tariff.minAge||child.age>tariff.maxAge){missing.push(`Ребёнок ${i+1}: нет примера ${kind==='education'?'обучения':'секции'} для этого возраста. Укажите свою сумму.`);return;}
  sources.push({...service,tariff,child:i+1,kind});
  if(tariff.needsQuote){missing.push(`Ребёнок ${i+1}: ${tariff.needsQuote}`);return;}
  add(prefix,`${kind==='education'?'Обучение':'Секции'} · ребёнок ${i+1}`,tariff.amount,tariff.currency,'monthly',tariff.paymentEvery??1);
  (tariff.fees??[]).forEach((fee,j)=>add(`${prefix}-fee-${j}`,`${fee.label} · ребёнок ${i+1}`,fee.amount,fee.currency,'once'));
 }
 family.children.forEach((child,i)=>{
  if(child.age<3)add(`baby-${i}`,`Питание и расходники · малыш ${i+1}`,child.babyAmount);
  if(child.education==='reference')reference(child,i,'education');
  if(child.education==='manual'){
   add(`education-${i}`,`Обучение · ребёнок ${i+1} (ваша сумма)`,child.educationAmount,'RUB','monthly',child.educationEvery);
   add(`education-${i}-entry`,`Зачисление · ребёнок ${i+1} (ваша сумма)`,child.educationEntry,'RUB','once');
  }
  if(child.education==='none')notes.push(`Обучение ребёнка ${i+1} исключено по вашему выбору. Это не подтверждение бесплатного зачисления.`);
  if(child.activity==='reference')reference(child,i,'activity');
  if(child.activity==='manual')add(`activity-${i}`,`Секции · ребёнок ${i+1} (ваша сумма)`,child.activityAmount);
  if(child.activity==='none')notes.push(`Отдельные платные секции ребёнка ${i+1} не включены.`);
 });
 for(const [key,label] of Object.entries(extraFields)){
  if(key==='deposit')continue;
  if(decimal(family.extras[key])>0n)add(key,label,family.extras[key],'RUB',key==='relocation'?'once':'monthly');
 }
 return {lines,sources,missing,notes,references:record?.references??[]};
}
