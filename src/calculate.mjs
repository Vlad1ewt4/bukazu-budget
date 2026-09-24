// Monetary arithmetic uses integer kopecks and fixed-point exchange rates.
const SCALE=10_000_000_000n;
export function decimal(value, digits=2){
  const s=String(value??'').replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
  if(!new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(s)) throw new Error('Введите неотрицательное число; дробную часть отделите точкой или запятой.');
  const [whole,fraction='']=s.split('.');
  if(whole.length>12) throw new Error('Сумма слишком большая.');
  return BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,'0'));
}
function round(n,d){return (n+d/2n)/d;}
function safe(n){const v=Number(n);if(!Number.isSafeInteger(v)) throw new Error('Итог превышает допустимый размер расчёта.');return v;}
function integer(v,min,max,label){const n=Number(v);if(String(v).trim()===''||!Number.isInteger(n)||n<min||n>max)throw new Error(`${label}: от ${min} до ${max}.`);return n;}
export function ageDays(date,now=new Date()){const t=Date.parse(date);return Number.isFinite(t)?Math.floor((now.getTime()-t)/86400000):Infinity;}
export function rateFresh(snapshot,now=new Date()){
  const age=ageDays(snapshot?.effectiveDate,now);
  return Number.isFinite(age)&&age>=-1&&age<=7&&snapshot?.rates?.RUB==='1';
}
export function toRubles(amount,currency,rates,{quantity=1,spread=0,inflow=false}={}){
  const amountMinor=decimal(amount),rate=decimal(rates[currency],10);
  if(rate<=0n)throw new Error(`Нет корректного курса ${currency}.`);
  const q=BigInt(integer(quantity,1,20,'Количество'));
  const bps=decimal(spread);
  if(bps>5000n)throw new Error('Наценка обмена должна быть от 0 до 50%.');
  const multiplier=currency==='RUB'?10000n:10000n+(inflow?-bps:bps);
  return safe(round(amountMinor*q*rate*multiplier,SCALE*10000n));
}
export function calculate(input,rates){
  const people=integer(input.people,1,20,'Число человек');
  const months=integer(input.months,1,36,'Срок в месяцах');
  const advance=integer(input.advance,1,months,'Предоплата аренды в месяцах');
  const startMonth=integer(input.incomeStart,1,120,'Первый месяц дохода');
  const reserveMonths=integer(input.reserveMonths,0,12,'Месяцы резерва');
  const buffer=decimal(input.buffer);
  if(buffer>10000n)throw new Error('Запас на рост расходов должен быть от 0 до 100%.');
  const plusBuffer=n=>safe(round(BigInt(n)*(10000n+buffer),10000n));
  const convert=(line,inflow=false)=>toRubles(line.amount,line.currency,rates,{quantity:line.basis==='person'?people:1,spread:input.spread,inflow});
  let monthly=0,oneTime=0,rent=0,fixedMonthly=0; const breakdown=[];
  for(const line of input.lines){
    if(!line.enabled)continue;
    let cost;try{cost=convert(line);}catch(e){throw new Error(`${line.label}: ${e.message}`);}
    if(line.period==='monthly'){monthly+=cost;if(line.id==='rent')rent+=cost;if(line.id==='obligations')fixedMonthly+=cost;}else if(line.period==='once')oneTime+=cost;else throw new Error('Неизвестная периодичность расхода.');
    breakdown.push({...line,rubles:cost});
  }
  if(!input.lines.some(x=>x.id==='rent'&&x.enabled))throw new Error('Укажите аренду, даже если она равна нулю.');
  const monthlyPlanned=plusBuffer(monthly-fixedMonthly)+fixedMonthly,rentPlanned=plusBuffer(rent),oncePlanned=plusBuffer(oneTime);
  const deposit=convert(input.deposit),exitReserve=convert(input.exitReserve);
  const reserve=monthlyPlanned*reserveMonths+exitReserve;
  const savings=convert(input.savings,true),income=convert(input.income,true);
  const upfront=oncePlanned+deposit+rentPlanned*advance;
  let net=upfront,peak=upfront,spent=upfront,incomes=0,firstShortfall=null;
  const schedule=[];
  for(let m=1;m<=months;m++){
    const out=monthlyPlanned-(m<=advance?rentPlanned:0);
    net+=out;spent+=out;peak=Math.max(peak,net);
    const beforeIncome=savings-net;
    if(firstShortfall===null&&beforeIncome<reserve)firstShortfall=m;
    const incoming=m>=startMonth?income:0;
    net-=incoming;incomes+=incoming;
    schedule.push({month:m,outflow:out,income:incoming,beforeIncome,balance:savings-net});
  }
  const required=peak+reserve;
  const cost=oncePlanned+monthlyPlanned*months;
  for(const n of [monthly,oneTime,required,cost,reserve,spent,incomes])if(!Number.isSafeInteger(n))throw new Error('Сумма слишком большая.');
  return {people,months,monthly,monthlyPlanned,oneTime,oncePlanned,rentPlanned,deposit,reserve,exitReserve,savings,income,upfront,required,gap:Math.max(0,required-savings),surplus:Math.max(0,savings-required),cost,committed:cost+deposit,totalIncome:incomes,firstShortfall,schedule,breakdown};
}
