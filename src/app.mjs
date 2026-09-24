import {calculate,ageDays,rateFresh,decimal} from './calculate.mjs';
import {assess} from './compare.mjs';
import {cities,currencies,makeLines} from './catalog.mjs';
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}),money=n=>fmt.format(n/100);
const displayDate=d=>d?new Date(d).toLocaleDateString('ru-RU'):'нет данных';
let city=cities[0],lines=makeLines(city.currency),snapshot=null,prices=null,result=null,demo=false;
const drafts=new Map(),overrides={};
const moneyIds=['deposit','exitReserve','savings','income','obligations'];
const destinationMoney=['deposit','exitReserve'];
const moneyDefaults={obligations:{label:'Личные обязательства в месяц',container:'obligations-field'},deposit:{label:'Возвратный депозит',container:'deposit-field'},exitReserve:{label:'Резерв на срочный выезд',container:'exit-field'},savings:{label:'Уже доступно денег',container:'savings-field'},income:{label:'Чистый доход за месяц',container:'income-field'}};
const options=selected=>currencies.map(c=>`<option ${c===selected?'selected':''}>${c}</option>`).join('');
for(const c of cities){const o=document.createElement('option');o.value=c.id;o.textContent=c.label;$('city').append(o);}
for(const id of moneyIds){const def=moneyDefaults[id];$(def.container).innerHTML=`<label>${def.label}<div class="money-pair"><input id="${id}" aria-label="${def.label}: сумма" inputmode="decimal" value="0"><select id="${id}-currency" aria-label="${def.label}: валюта">${options('RUB')}</select></div></label>`;}
function renderLines(){
 $('lines').innerHTML=lines.map(l=>`<article class="expense ${l.enabled?'':'excluded'}" data-line="${l.id}"><label class="expense-title"><input type="checkbox" data-field="enabled" ${l.enabled?'checked':''} ${l.id==='rent'?'disabled':''}>${l.label}</label><div class="expense-controls"><label>Сумма<input data-field="amount" inputmode="decimal" aria-label="${l.label}: сумма" placeholder="Введите цену" ${!l.enabled?'disabled':''}></label><label>Валюта<select data-field="currency" aria-label="${l.label}: валюта" ${!l.enabled?'disabled':''}>${options(l.currency)}</select></label><label>На кого<select data-field="basis" aria-label="${l.label}: на кого" ${!l.enabled||l.id==='rent'?'disabled':''}><option value="household" ${l.basis==='household'?'selected':''}>На всех</option><option value="person" ${l.basis==='person'?'selected':''}>На человека</option></select></label><label>Как часто<select data-field="period" aria-label="${l.label}: периодичность" ${!l.enabled||l.id==='rent'?'disabled':''}><option value="monthly" ${l.period==='monthly'?'selected':''}>В месяц</option><option value="once" ${l.period==='once'?'selected':''}>Один раз</option></select></label></div><p class="hint">${l.hint}</p><p class="source-note" data-origin></p></article>`).join('');
 for(const l of lines){const el=document.querySelector(`[data-line="${l.id}"]`);el.querySelector('[data-field=amount]').value=l.amount;setOrigin(l,el);}
 $('housing-link').href=city.rent;
}
function setOrigin(l,el){el.querySelector('[data-origin]').textContent=l.origin==='estimate'?`Средняя цена Numbeo · месяц данных ${l.sourceDate.slice(0,7)} · ${l.samples} наблюдений. Проверьте условия конкретного предложения.`:l.origin==='example'?'Учебная сумма, не рыночная цена.':l.amount!==''?'Ваша сумма. Проверьте дату и условия предложения.':'';}
$('lines').addEventListener('input',e=>{
 const row=e.target.closest('[data-line]');if(!row)return;const l=lines.find(x=>x.id===row.dataset.line),field=e.target.dataset.field;
 if(field==='enabled'){l.enabled=e.target.checked;renderLines();}else if(field){l[field]=e.target.value;l.origin='manual';l.sourceDate=null;setOrigin(l,row);}
 renderResult();
});
function saveDestination(){const p={lines,advance:$('advance').value};for(const id of destinationMoney)p[id]=readMoney(id);drafts.set(city.id,p);}
function blankDestination(c){return {lines:makeLines(c.currency),advance:'1',deposit:{amount:'0',currency:'RUB',basis:'household'},exitReserve:{amount:'0',currency:'RUB',basis:'household'}};}
function switchDestination(id){
 saveDestination();city=cities.find(c=>c.id===id);$('city').value=id;
 const p=drafts.get(id)??blankDestination(city);lines=p.lines;$('advance').value=p.advance;
 for(const key of destinationMoney){$(key).value=p[key].amount;$(key+'-currency').value=p[key].currency;}
 renderLines();renderPriceState();renderResult();
}
$('city').addEventListener('change',()=>switchDestination($('city').value));
$('country-cards').addEventListener('click',e=>{const button=e.target.closest('[data-destination]');if(button){switchDestination(button.dataset.destination);$('destination-detail').scrollIntoView({behavior:'smooth'});}});
for(const id of ['people','months','advance','buffer','reserveMonths','spread','incomeStart',...moneyIds,...moneyIds.map(x=>x+'-currency')])$(id).addEventListener('input',()=>renderResult());
function readMoney(id){return {amount:$(id).value,currency:$(id+'-currency').value,basis:'household'};}
function getInput(){const input={lines:[...lines,{id:'obligations',label:'Личные обязательства',period:'monthly',enabled:true,...readMoney('obligations')}]};for(const id of ['people','months','advance','buffer','reserveMonths','spread','incomeStart'])input[id]=$(id).value;for(const id of moneyIds)input[id]=readMoney(id);return input;}
function selectedRates(input){
 const used=new Set([...input.lines.filter(x=>x.enabled),...moneyIds.map(id=>input[id])].map(l=>l.currency));
 const rates={RUB:'1',...snapshot?.rates};
 for(const c of used){if(c==='RUB')continue;
  if(overrides[c]){if(decimal(overrides[c],10)<=0n)throw new Error(`Укажите положительный курс ${c}.`);rates[c]=overrides[c];continue;}
  const quote=snapshot?.quotes?.[c];
  const fresh=quote?ageDays(quote.effectiveDate)>=-1&&ageDays(quote.effectiveDate)<=7:rateFresh(snapshot);
  if(!fresh||!rates[c])throw new Error(`Нет свежего курса ${c}. В разделе «Откуда берутся цифры» укажите свой курс или проверьте обновление.`);
 }
 return rates;
}
function renderResult(){
 renderComparison();$('detail-title').textContent=city.label;
 const missing=lines.filter(l=>l.enabled&&!l.amount.trim());
 document.querySelectorAll('[data-field=amount]').forEach(e=>e.removeAttribute('aria-invalid'));
 if(missing.length){hideResult(`Осталось заполнить: ${missing.map(l=>l.label.toLowerCase()).join(', ')}. Ненужные статьи можно исключить.`);return;}
 try{
  for(const l of lines.filter(x=>x.enabled&&x.origin==='estimate'))if(ageDays(l.sourceDate)>45||ageDays(l.sourceDate)<-1)throw new Error(`Ориентир «${l.label}» устарел. Введите новую цену или подставьте свежие данные.`);
  const input=getInput();result=assess(input,selectedRates(input));renderBreakdown(result);
  $('required').textContent=money(result.required);$('monthly').textContent=money(result.monthlyPlanned);$('total').textContent=money(result.cost);$('deposit-total').textContent=money(result.deposit);$('reserve-total').textContent=money(result.reserve);
  $('calc-status').textContent=`На ${result.months} мес. · ${result.people} чел. · ${demo?'учебный пример':'по указанным суммам'}.`;const gap=$('gap');gap.hidden=false;gap.className='gap'+(result.gap?' short':'');gap.textContent=result.gap?`До выбранного плана не хватает ${money(result.gap)}.`:`Доступных денег хватает. Сверх плана: ${money(result.surplus)}.`;
  const rows=[{label:'До заселения',outflow:result.upfront,income:0,beforeIncome:result.savings-result.upfront,balance:result.savings-result.upfront},...result.schedule.map(r=>({...r,label:`Месяц ${r.month}`}))];
  $('schedule').innerHTML=rows.map(r=>`<tr><td>${r.label}</td><td>${money(r.outflow)}</td><td>${money(r.income)}</td><td class="${r.beforeIncome<result.reserve?'negative':''}">${money(r.beforeIncome)}${r.beforeIncome<result.reserve?' *':''}</td><td>${money(r.balance)}</td></tr>`).join('')+`<tr><td colspan="5">* Остаток ниже неприкосновенного резерва ${money(result.reserve)}.</td></tr>`;
 }catch(e){hideResult(e.message);}
}
function hideResult(message){result=null;$('spending-breakdown').replaceChildren();for(const id of ['required','monthly','total','deposit-total','reserve-total'])$(id).textContent='—';$('gap').hidden=true;$('calc-status').textContent=message;$('schedule').innerHTML='<tr><td colspan="5">Расчёт появится после заполнения корректных сумм и курсов.</td></tr>';}
function currentPriceEntries(){const p=prices?.cities?.[city.id];if(!p)return [];return Object.entries(p.items??{}).filter(([,x])=>ageDays(x.sourceDate)>=-1&&ageDays(x.sourceDate)<=45&&x.currency===city.currency);}
function renderPriceState(){const p=prices?.cities?.[city.id],entries=currentPriceEntries();$('apply-prices').disabled=!entries.length;
 $('price-status').textContent=entries.length?`Доступно ${entries.length} ориентиров. Месяц цен: ${p.sourceDate.slice(0,7)}. Получены: ${displayDate(p.fetchedAt)}. Заполняются только пустые поля.`:p?'Сохранённые ориентиры устарели или недостаточно данных. Введите цену из свежего предложения.':'Автоматические цены по городу пока не подключены. Введите свои суммы; старые цены из гайда не подставляются.';
}
$('apply-prices').addEventListener('click',()=>{
 for(const [key,x]of currentPriceEntries()){const l=lines.find(l=>l.id===key);if(l&&!l.amount.trim()){Object.assign(l,{amount:x.amount,currency:x.currency,origin:'estimate',sourceDate:x.sourceDate,samples:x.samples,basis:x.basis,period:x.period,enabled:true});}}
 renderLines();renderResult();
});
function renderRates(){const fresh=rateFresh(snapshot);$('fx-status').textContent=snapshot?.effectiveDate?`Курсы ЦБ на ${displayDate(snapshot.effectiveDate)}. Получены ${displayDate(snapshot.fetchedAt)}.${fresh?'':' Данные устарели — автоматическая конвертация отключена.'}`:'Не удалось получить свежие курсы. Можно указать свои ниже.';$('fx-status').className=fresh?'':'bad-status';
 $('rates').innerHTML='<div class="rate-grid">'+currencies.filter(c=>c!=='RUB').map(c=>{const q=snapshot?.quotes?.[c],d=q?.effectiveDate??snapshot?.effectiveDate;return `<label>1 ${c} в рублях<input data-rate="${c}" aria-label="Курс ${c}: рублей за единицу" inputmode="decimal" placeholder="${snapshot?.rates?.[c]??'Нет курса'}"><small>${displayDate(d)}${c==='MYR'?' · через USD':''}</small></label>`;}).join('')+'</div>';
 for(const e of document.querySelectorAll('[data-rate]')){e.value=overrides[e.dataset.rate]??'';e.addEventListener('input',()=>{overrides[e.dataset.rate]=e.value.trim();renderResult();});}
}
async function reload(){const button=$('refresh');button.disabled=true;button.textContent='Проверяем…';
 try{const [r,p]=await Promise.all([fetch(`./data/rates.json?t=${Date.now()}`,{cache:'no-store'}),fetch(`./data/prices.json?t=${Date.now()}`,{cache:'no-store'})]);if(!r.ok||!p.ok)throw new Error();snapshot=await r.json();prices=await p.json();renderRates();renderPriceState();renderResult();}
 catch{$('fx-status').textContent='Не удалось загрузить обновление. Сохранённые даты не менялись; проверьте соединение или укажите курс вручную.';$('fx-status').className='bad-status';renderPriceState();renderResult();}
 finally{button.disabled=false;button.textContent='Проверить обновления';}
}
$('refresh').addEventListener('click',reload);
let beforeExample=null;
$('example').addEventListener('click',()=>{
 if(!demo){saveDestination();beforeExample={drafts:structuredClone([...drafts]),city:city.id,values:Object.fromEntries(['people','months','buffer','reserveMonths','spread','incomeStart',...moneyIds,...moneyIds.map(x=>x+'-currency')].map(id=>[id,$(id).value]))};}
 drafts.clear();
 cities.forEach((c,i)=>{
  const p=blankDestination(c);p.lines=makeLines('RUB');
  const factor=1+i*.15,values={rent:30000,food:15000,utilities:5000,phone:1000,transport:3000,insurance:2000,flight:40000};
  for(const l of p.lines){l.amount=l.id in values?String(Math.round(values[l.id]*factor)):'';l.enabled=l.id in values;l.origin='example';}
  p.deposit.amount=String(Math.round(30000*factor));p.exitReserve.amount='30000';drafts.set(c.id,p);
 });
 city=cities[0];$('city').value=city.id;lines=drafts.get(city.id).lines;
 for(const [id,value]of Object.entries({people:1,months:3,advance:1,buffer:10,reserveMonths:1,spread:0,incomeStart:2,deposit:30000,exitReserve:30000,savings:400000,income:50000,obligations:0}))$(id).value=value;
 for(const id of moneyIds)$(id+'-currency').value='RUB';demo=true;$('demo-notice').hidden=false;renderLines();renderPriceState();renderResult();$('calculator').scrollIntoView({behavior:'smooth'});
});
$('clear-example').addEventListener('click',()=>{
 if(beforeExample){drafts.clear();for(const [id,p]of beforeExample.drafts)drafts.set(id,p);city=cities.find(c=>c.id===beforeExample.city);$('city').value=city.id;for(const [id,value]of Object.entries(beforeExample.values))$(id).value=value;const p=drafts.get(city.id);lines=p.lines;$('advance').value=p.advance;beforeExample=null;}
 demo=false;$('demo-notice').hidden=true;renderLines();renderPriceState();renderResult();
});
function renderComparison(){
 saveDestination();
 const outcomes=cities.map(c=>{
  const p=drafts.get(c.id)??blankDestination(c),missing=p.lines.filter(l=>l.enabled&&!l.amount.trim());
  if(missing.length)return {c,missing:missing.length};
  try{
   for(const l of p.lines.filter(l=>l.enabled&&l.origin==='estimate'))if(ageDays(l.sourceDate)>45||ageDays(l.sourceDate)<-1)throw new Error('Цены устарели — обновите ориентиры.');
   const input={...getInput(),...p,lines:[...p.lines,{id:'obligations',label:'Личные обязательства',period:'monthly',enabled:true,...readMoney('obligations')}]};
   return {c,r:assess(input,selectedRates(input))};
  }catch(e){return {c,error:e.message};}
 });
 outcomes.sort((a,b)=>a.r&&b.r?a.r.gap-b.r.gap||a.r.required-b.r.required:a.r?-1:b.r?1:0);
 const ready=outcomes.filter(o=>o.r),fits=ready.filter(o=>o.r.fits).length;
 $('comparison-status').textContent=demo?'Учебные цены · не рыночная оценка':ready.length?`Рассчитано ${ready.length} из ${cities.length}. По бюджету подходят: ${fits}.`:'Для сравнения нужны цены направлений. Источник рыночных цен пока не подключён.';
 const escape=t=>String(t).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 $('country-cards').innerHTML=outcomes.map(({c,r,missing,error})=>{
  const [town,country]=c.label.split(' · ');
  return `<article class="country-card ${r?.fits?'fits':''} ${c.id===city.id?'selected':''}"><div class="country-top"><span>${country}</span><span class="country-badge">${demo?'Пример':r?'По указанным ценам':'Нет расчёта'}</span></div><h3>${town}</h3>${r?`<strong class="country-monthly">${money(r.monthlyPlanned)}<small>в месяц, включая запас и обязательства</small></strong><dl><div><dt>Нужно на старте</dt><dd>${money(r.required)}</dd></div><div><dt>Доход − расходы / мес.</dt><dd>${money(r.recurringBalance)}</dd></div><div><dt>Деньги в конце срока</dt><dd>${money(r.endBalance)}</dd></div></dl><p class="country-verdict">${r.fits?`Хватает на выбранные ${r.months} мес.`:`Не хватает ${money(r.gap)}`}</p><p class="country-meta">${r.fits?'Резерв сохранён на всём сроке.':`Без расходования резерва: ${r.fundedMonths} из ${r.months} мес.`}</p>`:`<p class="country-empty">${error?escape(error):`Осталось указать ${missing} статей расходов. Без них нельзя оценить бюджет.`}</p>`}<button class="quiet" data-destination="${c.id}">${r?'Посмотреть расходы':'Указать расходы'} ↗</button></article>`;
 }).join('');
}
function renderBreakdown(r){
 const rows=r.breakdown.filter(x=>x.period==='monthly');
 $('spending-breakdown').innerHTML='<h3>На что уходит месяц</h3>'+rows.map(x=>`<div class="breakdown-row"><span>${x.label}</span><strong>${money(x.rubles)}</strong></div>`).join('')+`<div class="breakdown-row"><span>Запас на рост расходов</span><strong>${money(r.monthlyPlanned-r.monthly)}</strong></div><div class="breakdown-row balance-row"><span>Доход − расходы</span><strong>${money(r.recurringBalance)}</strong></div>`;
}
renderLines();renderResult();reload();
// A tab left open overnight must not keep using a now-expired automatic quote.
document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderPriceState();renderResult();}});
setInterval(()=>{renderPriceState();renderResult();},60000);
