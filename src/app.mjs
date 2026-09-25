import {cities} from './catalog.mjs';
import {scenario,validatePersonal} from './scenarios.mjs';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(value/100);
const number=value=>new Intl.NumberFormat('ru-RU').format(value);
const signed=value=>(value>0?'+':'')+money(value);
const date=value=>value?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)):'не указана';
function link(url,label){try{const u=new URL(url);return u.protocol==='https:'?`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:esc(label);}catch{return esc(label);}}
let data=null,submitted=false;
async function loadData(){
 const responses=await Promise.all(['prices','rates'].map(name=>fetch(`data/${name}.json`,{cache:'no-store'})));
 if(responses.some(r=>!r.ok))throw new Error('Не удалось загрузить цены. Проверьте интернет и повторите расчёт.');
 const [prices,rates]=await Promise.all(responses.map(r=>r.json()));
 if(!prices.cities||!rates.rates)throw new Error('Данные пока недоступны. Повторите позже.');
 return {prices,rates};
}
function sourceDetails(quote){
 const kind=quote.verificationMethod==='manual'?'Тариф · ручная сверка':({city_reference:'Справочный ориентир',listing_sample:'Выборка объявлений',official_tariff:'Тариф источника'}[quote.kind]??'Источник требует проверки');
 const range=quote.kind==='listing_sample'?`<p><strong>Диапазон выборки: ${number(quote.low)}–${number(quote.high)} ${esc(quote.currency)} / месяц · объявлений: ${quote.samples}.</strong></p><p>Выборка сформирована: ${date(quote.cohortStartedAt)}. Исключено по сроку: ${quote.excludedForTerm??0}. Срок не указан: ${quote.unknownTermCount??quote.samples}; пригодность для вашего срока нужно подтвердить.</p>`:'';
 const components=quote.components?.length?`<ul class="components">${quote.components.map(row=>`<li><span>${esc(row.label)} × ${esc(row.quantity)}</span><span>${esc(row.unitAmount)} ${esc(row.currency)} / ед.</span></li>`).join('')}</ul>`:'';
 const evidence=quote.evidence?.length?`<ul>${quote.evidence.map((row,i)=>`<li>${link(row.url,`Объявление ${i+1}`)} · ${number(row.amount)} ${esc(quote.currency)} · ${date(row.sourceDate)}</li>`).join('')}</ul>`:'';
 return `<span class="price-kind ${quote.kind==='city_reference'?'reference':'direct'}">${kind}</span><details class="source-detail"><summary>Источник и состав расходов</summary><div><p>${esc(quote.note)}</p>${quote.verificationMethod==='manual'?`<p><strong>Повторная сверка — не позднее ${date(quote.reviewDueAt)}.</strong> Автоматическая загрузка пока недоступна; дата ручной сверки сохраняется.</p>`:''}${range}<p>${link(quote.sourceUrl,quote.source)} · ${number(quote.amount)} ${esc(quote.currency)} / месяц</p><p class="muted">Страница проверена: ${date(quote.checkedAt)}${quote.sourceDate?` · Дата источника: ${date(quote.sourceDate)}`:''}</p>${quote.kind==='city_reference'?'<p class="muted">Дата страницы; даты отдельных наблюдений и размер выборки не раскрыты.</p>':''}${components}${evidence}</div></details>`;
}
function card(result,index){
 const {city}=result,[name,country]=city.label.split(' · ');
 const head=`<div class="card-heading"><span class="city-index">${String(index+1).padStart(2,'0')}</span><div><p class="country-name">${esc(country)}</p><h3>${esc(name)}</h3></div><span aria-hidden="true">↗</span></div>`;
 if(result.unavailable)return `<article class="country-card unavailable">${head}<p class="status-pill">Нужны свежие данные</p><p>${esc(result.unavailable)}</p><p class="muted">Неполный расчёт не показываем как готовый бюджет.</p></article>`;
 const r=result;
 const referenceCount=[...r.quotes.values()].filter(q=>q.kind==='city_reference').length;
 const quality=`<p class="quality-note">Предварительный расчёт · ${referenceCount} из 6 статей — справочные. Свежесть исходных наблюдений не подтверждена.</p>`;
 const rows=r.breakdown.filter(row=>row.id!=='obligations'||row.rubles>0).map(row=>`<div class="expense-item"><div class="expense-row"><span>${esc(row.label)}</span><strong>${money(row.rubles)}</strong></div>${r.quotes.has(row.id)?sourceDetails(r.quotes.get(row.id)):''}</div>`).join('');
 const timeline=r.schedule.map(row=>`<tr><th scope="row">${row.month}</th><td>${money(row.beforeIncome)}</td><td>${money(row.balance)}</td></tr>`).join('');
 return `<article class="country-card ${r.fits?'fits':''}">${head}<p class="status-pill ${r.fits?'positive':'neutral'}">${r.fits?'Предварительно хватает':'По оценке не хватает'}</p>${quality}<div class="monthly-price"><strong>≈ ${money(r.monthlyPlanned)}</strong><span>расходы в месяц, с запасом 10%</span></div><div class="card-metrics"><div><span>${r.recurringBalance>=0?'Остаётся от дохода':'Из накоплений каждый месяц'}</span><strong class="${r.recurringBalance>=0?'green':''}">${r.recurringBalance>=0?signed(r.recurringBalance):money(-r.recurringBalance)}</strong></div><div><span>Нужно накоплений на ${r.months} мес. + резерв</span><strong>≈ ${money(r.required)}</strong></div></div><p class="verdict">${r.fits?`После выделения суммы на жизнь и резерв у вас остаётся <strong>${money(r.surplus)}</strong>. Из них можно планировать расходы самого переезда.`:`Для этого сценария не хватает <strong>${money(r.gap)}</strong>. Расходы самого переезда потребуют отдельной суммы.`}</p><details class="breakdown"><summary>На что уходят деньги <span aria-hidden="true">＋</span></summary><div class="breakdown-body">${rows}<div class="expense-row buffer"><span>Запас на рост расходов · 10%</span><strong>${money(r.buffer)}</strong></div><div class="expense-row total"><span>Итого за месяц</span><strong>${money(r.monthlyPlanned)}</strong></div><p class="small muted">Суммы показаны с округлением до рубля. Расчёт ведётся до копеек.</p><div class="reserve-box"><span>Неприкосновенный резерв</span><strong>${money(r.reserve)}</strong><p>Ещё один месяц всех расходов. Не расходуется в плане и входит в необходимые накопления.</p></div><details class="cashflow"><summary>Как меняется остаток за ${r.months} мес.</summary><p>Сначала оплачиваются расходы месяца, затем приходит доход. В остатках ниже резерв ещё не вычтен.</p><div class="table-scroll"><table><thead><tr><th>Месяц</th><th>До дохода</th><th>После дохода</th></tr></thead><tbody>${timeline}</tbody></table></div><p>Для сохранения резерва остаток до дохода должен быть не ниже ${money(r.reserve)}.</p></details>${city.id==='danang'?'<a class="rent-link" href="https://t.me/bucazuhome" target="_blank" rel="noopener noreferrer">Жильё в Дананге · BUCAZU HOME ↗</a>':''}</div></details></article>`;
}
function currentPersonal(){return {savings:$('savings').value,income:$('income').value,months:$('months').value,obligations:$('obligations').value};}
$('budget-form').addEventListener('input',()=>{
 $('assumption').innerHTML=`Сценарий: 1 человек · ${esc($('months').value)} ${$('months').value==='3'?'месяца':'месяцев'} по 30 дней<br>+ 10% на колебания расходов · резерв на месяц`;
 if(submitted)$('dirty-notice').hidden=false;
});
$('budget-form').addEventListener('submit',async event=>{
 event.preventDefault();$('form-error').hidden=true;
 const personal=currentPersonal();
 try{validatePersonal(personal);}catch{
  $('form-error').textContent='Введите накопления, доход и обязательства: числа от 0, не больше двух знаков после запятой.';$('form-error').hidden=false;
  const invalid=['savings','income','obligations'].find(id=>!/^\d+(?:[.,]\d{1,2})?$/.test($(id).value.replace(/\s/g,'')));
  if(invalid){if(invalid==='obligations')document.querySelector('.settings').open=true;$(invalid).focus();}return;
 }
 $('calculate').disabled=true;$('calculate').textContent='Считаем…';
 try{
  data=await loadData();
  const results=cities.map(city=>scenario(city,personal,data.prices,data.rates));
  const valid=results.filter(r=>!r.unavailable).sort((a,b)=>a.monthlyPlanned-b.monthlyPlanned);
  const sorted=[...valid,...results.filter(r=>r.unavailable)];
  $('country-grid').innerHTML=sorted.map(card).join('');
  for(const [index,result]of sorted.entries()){
   if(result.unavailable)continue;
   const rent=result.breakdown.find(row=>row.id==='rent').rubles,food=result.breakdown.find(row=>row.id==='food').rubles;
   const preview=document.createElement('div');preview.className='preview-split';
   preview.innerHTML=`<div><span>Жильё</span><strong>${money(rent)}</strong></div><div><span>Питание</span><strong>${money(food)}</strong></div><div><span>Другие расходы и запас</span><strong>${money(result.monthlyPlanned-rent-food)}</strong></div>`;
   $('country-grid').children[index].querySelector('.monthly-price').after(preview);
  }
  $('coverage').textContent=`${valid.length} из 9 направлений`;
  const first=valid[0];
  const rub=value=>new Intl.NumberFormat('ru-RU').format(Number(value.replace(/\s/g,'').replace(',','.'))) + ' ₽';
  $('snapshot').innerHTML=`<div><span>Ваши накопления</span><strong>${esc(rub(personal.savings))}</strong></div><div><span>Доход в месяц</span><strong>${esc(rub(personal.income))}</strong></div><div><span>Срок расчёта</span><strong>${personal.months} мес.</strong></div><div><span>Обязательства в месяц</span><strong>${esc(rub(personal.obligations))}</strong></div>`;
  $('result-status').textContent=valid.length?`От меньших расходов к большим. Самый доступный сценарий: ${first.city.label.split(' · ')[0]}. Курс на ${date(data.rates.effectiveDate)}. Источники и даты — внутри каждой статьи расходов.`:'Свежих данных недостаточно. Ниже указано, что нужно обновить.';
  $('data-status').textContent=`Курсы на ${date(data.rates.effectiveDate)}. Предварительная оценка доступна для ${valid.length} из 9 направлений. Дата каждой цены указана в её источнике.`;
  submitted=true;$('results').hidden=false;$('dirty-notice').hidden=JSON.stringify(personal)===JSON.stringify(currentPersonal());
  $('results-title').focus({preventScroll:true});$('results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 }catch(error){$('form-error').textContent=error.message||'Не удалось выполнить расчёт. Попробуйте ещё раз.';$('form-error').hidden=false;}
 finally{$('calculate').disabled=false;$('calculate').innerHTML='Рассчитать <span aria-hidden="true">↗</span>';}
});
loadData().then(value=>{data=value;$('data-status').textContent=`Курсы на ${date(data.rates.effectiveDate)}. Последняя успешная проверка указана отдельно у каждой цены.`;}).catch(()=>{$('data-status').textContent='Не удалось загрузить данные. Попробуем ещё раз при расчёте.';});
