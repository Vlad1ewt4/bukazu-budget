const arrowIcon='<svg class="icon icon-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 19 19 5M5 5h14v14"/></svg>';
const plusIcon='<svg class="icon icon-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
import {cities} from './catalog.mjs';
import {scenario,validatePersonal} from './scenarios.mjs';
import {readFamily,setupFamily,syncFamily} from './family-ui.mjs';
import {loadData} from './load-data.mjs';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(value/100);
const number=value=>new Intl.NumberFormat('ru-RU').format(value);
const signed=value=>(value>0?'+':'')+money(value);
const date=value=>value?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)):'не указана';
function link(url,label){try{const u=new URL(url);return u.protocol==='https:'?`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${arrowIcon}</a>`:esc(label);}catch{return esc(label);}}
let data=null,submitted=false;
function sourceDetails(quote){
 const kind=quote.verificationMethod==='manual'?'Тариф · ручная сверка':({city_reference:'Справочный ориентир',listing_sample:'Выборка объявлений',official_tariff:'Тариф источника'}[quote.kind]??'Источник требует проверки');
 const range=quote.kind==='listing_sample'?`<p><strong>Диапазон выборки: ${number(quote.low)}–${number(quote.high)} ${esc(quote.currency)} / месяц · объявлений: ${quote.samples}.</strong></p><p>Выборка сформирована: ${date(quote.cohortStartedAt)}. Исключено по сроку: ${quote.excludedForTerm??0}. Срок не указан: ${quote.unknownTermCount??quote.samples}; пригодность для вашего срока нужно подтвердить.</p>`:'';
 const components=quote.components?.length?`<ul class="components">${quote.components.map(row=>`<li><span>${esc(row.label)} × ${esc(row.quantity)}</span><span>${esc(row.unitAmount)} ${esc(row.currency)} / ед.</span></li>`).join('')}</ul>`:'';
 const evidence=quote.evidence?.length?`<ul>${quote.evidence.map((row,i)=>`<li>${link(row.url,`Объявление ${i+1}`)} · ${number(row.amount)} ${esc(quote.currency)} · ${date(row.sourceDate)}</li>`).join('')}</ul>`:'';
 return `<span class="price-kind ${quote.kind==='city_reference'?'reference':'direct'}">${kind}</span><details class="source-detail"><summary>Источник и состав расходов</summary><div><p>${esc(quote.note)}</p>${quote.verificationMethod==='manual'?`<p><strong>Повторная сверка — не позднее ${date(quote.reviewDueAt)}.</strong> Автоматическая загрузка пока недоступна; дата ручной сверки сохраняется.</p>`:''}${range}<p>${link(quote.sourceUrl,quote.source)} · ${number(quote.amount)} ${esc(quote.currency)} / месяц</p><p class="muted">Страница проверена: ${date(quote.checkedAt)}${quote.sourceDate?` · Дата источника: ${date(quote.sourceDate)}`:''}</p>${quote.kind==='city_reference'?'<p class="muted">Дата страницы; даты отдельных наблюдений и размер выборки не раскрыты.</p>':''}${components}${evidence}</div></details>`;
}

function familyDetails(r){
 if(!r.additional)return '';
 const notes=r.additional.notes.map(note=>`<p>${esc(note)}</p>`).join('');
 const sources=r.additional.sources.map(source=>{
  const t=source.tariff;
  return `<div class="family-source"><strong>Ребёнок ${source.child}: ${esc(source.name)}</strong><p>${source.language?`Язык: ${esc(source.language)}. `:''}${esc(t.label??'Дополнительные занятия')}</p><p>${number(t.amount)} ${esc(t.currency)} за ${t.paymentEvery===12?'учебный год':t.paymentEvery>1?`${t.paymentEvery} мес.`:'месяц / выбранный пакет'}. ${source.schoolYear?`Учебный год ${esc(source.schoolYear)}.`:''}</p><p>${esc(source.note)}</p>${t.needsQuote?`<p class="billing-note">${esc(t.needsQuote)}</p>`:''}<p>${link(source.sourceUrl,'Официальный тариф')} · проверено ${date(source.checkedAt)} · повторная сверка до ${date(source.reviewDueAt)}</p></div>`;
 }).join('');
 const refs=r.additional.references.map(ref=>`<p>${link(ref.url,ref.name)}: ${esc(ref.note)}</p>`).join('');
 const children=r.family.children.length;
 if(!children&&r.family.people===1)return '';
 return `<details class="source-detail"><summary>Семейный сценарий и учреждения</summary><div><p>${r.family.adults} взр. · ${children} детей · квартира: ${r.family.bedrooms} ${r.family.bedrooms===1?'спальня':'спальни'}. Интернет и аренда общие. Мобильная связь — взрослым и детям от 12 лет. 20 общих поездок на такси на каждые 4 человека; школьная дорога отдельно.</p><p>Возраст подбирает пример ступени. Класс, язык, наличие мест и условия для иностранцев подтвердите в учреждении. Это примеры с разными программами, а не средняя цена города. Питание, уже включённое школой, из продуктовой корзины не вычитается.</p>${notes}${sources}${refs}<p>Годовая оплата в примерах планируется целиком в первом месяце. На следующий учебный год цена не гарантирована. Для своего договора выберите «Своя сумма» и график платежей.</p></div></details>`;
}
function card(result,index){
 const {city}=result,[name,country]=city.label.split(' · ');
 const head=`<div class="card-heading"><span class="city-index">${String(index+1).padStart(2,'0')}</span><div><p class="country-name">${esc(country)}</p><h3>${esc(name)}</h3></div><span aria-hidden="true">${arrowIcon}</span></div>`;
 if(result.unavailable)return `<article class="country-card unavailable">${head}<p class="status-pill">Нужны свежие данные</p><p>${esc(result.unavailable)}</p><p class="muted">Неполный расчёт не показываем как готовый бюджет.</p></article>`;
 const r=result,monthly=r.breakdown.filter(row=>row.period==='monthly'),once=r.breakdown.filter(row=>row.period==='once'&&row.rubles>0);
 const rows=monthly.filter(row=>row.id!=='obligations'||row.rubles>0).map(row=>`<div class="expense-item"><div class="expense-row"><span>${esc(row.label)}${row.quantity>1?` × ${row.quantity}`:''}</span><strong>${money(row.rubles)}</strong></div>${row.paymentEvery>1?`<p class="billing-note">Среднее за месяц. Платёж ${money(row.paymentRubles)} раз в ${row.paymentEvery} мес., первый — в начале. Запас 10% добавлен ниже.</p>`:''}${r.quotes.has(row.id)?sourceDetails(r.quotes.get(row.id)):''}</div>`).join('');
 const timeline=r.schedule.map(row=>`<tr><th scope="row">${row.month}</th><td>${money(row.beforeIncome)}</td><td>${money(row.balance)}</td></tr>`).join('');
 const schoolSummary=r.additional.sources.filter(source=>source.kind==='education').map(source=>`<p class="billing-note"><strong>Ребёнок ${source.child}: ${esc(source.name)}</strong> · ${esc(source.language??'язык уточняется')}. Пример учреждения; не средняя цена города.</p>`).join('');
 const missing=r.incomplete?`<ul class="missing-list">${r.additional.missing.map(message=>`<li>${esc(message)}</li>`).join('')}</ul>`:'';
 const verdict=r.incomplete?'Часть детских расходов ещё не оценена. Ниже только известная часть бюджета; вывод о достаточности денег не делаем.':r.fits?`После выделения суммы на выбранные статьи и резерв остаётся <strong>${money(r.surplus)}</strong>. Неучтённые расходы потребуют отдельной суммы.`:`На выбранные статьи не хватает <strong>${money(r.gap)}</strong>. Неучтённые расходы потребуют отдельной суммы.`;
 const onceHtml=once.length||r.deposit?`<div class="once-list"><h4>Разовые платежи на старте</h4>${once.map(row=>`<div class="expense-row"><span>${esc(row.label)}</span><strong>${money(row.rubles)}</strong></div>`).join('')}${once.length?`<p>Разовые расходы с запасом 10%: <strong>${money(r.oncePlanned)}</strong></p>`:''}${r.deposit?`<p>Возвратный депозит: <strong>${money(r.deposit)}</strong>. Нужен на старте; возврат в плане не предполагается.</p>`:''}</div>`:'';
 return `<article class="country-card ${r.fits?'fits':''}">${head}<p class="status-pill ${r.fits?'positive':'neutral'}">${r.incomplete?'Неполная оценка':r.fits?'Предварительно хватает':'По оценке не хватает'}</p><p class="quality-note">Предварительный сценарий. Цены жилья и части расходов — справочные; условия школы и секций нужно подтвердить.</p><div class="monthly-price"><strong>${r.incomplete?'от':'≈'} ${money(r.monthlyPlanned)}</strong><span>${r.incomplete?'известные расходы':'расходы'} в среднем за месяц, с запасом 10%</span></div><div class="card-metrics"><div><span>${r.recurringBalance>=0?'Остаётся от дохода в среднем':'Средний дефицит за месяц'}</span><strong class="${r.recurringBalance>=0?'green':''}">${r.recurringBalance>=0?signed(r.recurringBalance):money(-r.recurringBalance)}</strong></div><div><span>${r.incomplete?'Не меньше накоплений':'Нужно накоплений'} на ${r.months} мес. + резерв</span><strong>≈ ${money(r.required)}</strong></div><div><span>Платежи до первого дохода</span><strong>${money(r.upfront+r.schedule[0].outflow)}</strong></div></div><p class="verdict">${verdict}</p>${missing}${schoolSummary}${familyDetails(r)}<details class="breakdown"><summary>На что уходят деньги <span aria-hidden="true">${plusIcon}</span></summary><div class="breakdown-body">${rows}<div class="expense-row buffer"><span>Запас на рост расходов · 10%</span><strong>${money(r.buffer)}</strong></div><div class="expense-row total"><span>Среднее за месяц</span><strong>${money(r.monthlyPlanned)}</strong></div><p class="small muted">Округляем до рубля; расчёт до копеек. Годовые и пакетные платежи показаны в среднем, но оплачиваются авансом по графику ниже.</p>${onceHtml}<div class="reserve-box"><span>Неприкосновенный резерв</span><strong>${money(r.reserve)}</strong><p>Ещё один средний месяц всех включённых расходов. Входит в необходимые накопления.</p></div><details class="cashflow"><summary>Как меняется остаток за ${r.months} мес.</summary><p>Расходы и предоплаты — до дохода. Разовые платежи уже вычтены. Резерв включён в показанные остатки.</p><div class="table-scroll"><table><thead><tr><th>Месяц</th><th>До дохода</th><th>После дохода</th></tr></thead><tbody>${timeline}</tbody></table></div><p>До дохода должно оставаться не ниже ${money(r.reserve)}.</p></details>${city.id==='danang'?`<a class="rent-link" href="https://t.me/bucazuhome" target="_blank" rel="noopener noreferrer">Жильё в Дананге · BUCAZU HOME ${arrowIcon}</a>`:''}</div></details></article>`;
}
function currentPersonal(){return {savings:$('savings').value,income:$('income').value,months:$('months').value,obligations:$('obligations').value,...readFamily()};}
$('budget-form').addEventListener('input',()=>{
 syncFamily();
 if(submitted)$('dirty-notice').hidden=false;
});
$('budget-form').addEventListener('submit',async event=>{
 event.preventDefault();$('form-error').hidden=true;
 const personal=currentPersonal();
 try{validatePersonal(personal);}catch(error){
  $('form-error').textContent=error.message;$('form-error').hidden=false;
  const invalid=error.field;
  if(invalid&&$(invalid)){const details=$(invalid).closest('details');if(details)details.open=true;$(invalid).focus();}return;
 }
 $('calculate').disabled=true;$('calculate').textContent='Считаем…';
 try{
  data=await loadData();
  const results=cities.map(city=>scenario(city,personal,data.prices,data.rates,new Date(),data.family));
  const valid=results.filter(r=>!r.unavailable).sort((a,b)=>Number(a.incomplete)-Number(b.incomplete)||a.monthlyPlanned-b.monthlyPlanned);
  const sorted=[...valid,...results.filter(r=>r.unavailable)];
  $('country-grid').innerHTML=sorted.map(card).join('');
  for(const [index,result]of sorted.entries()){
   if(result.unavailable)continue;
   const rent=result.breakdown.find(row=>row.id==='rent').rubles,food=result.breakdown.filter(row=>['food','child-food'].includes(row.id)||row.id.startsWith('baby-')).reduce((n,row)=>n+row.rubles,0);
   const education=result.breakdown.filter(row=>row.period==='monthly'&&row.id.startsWith('education-')).reduce((n,row)=>n+row.rubles,0);
   const activity=result.breakdown.filter(row=>row.period==='monthly'&&row.id.startsWith('activity-')).reduce((n,row)=>n+row.rubles,0);
   const preview=document.createElement('div');preview.className='preview-split';
   preview.innerHTML=`<div><span>Жильё</span><strong>${money(rent)}</strong></div><div><span>Питание</span><strong>${money(food)}</strong></div>${education?`<div><span>Сад / школа · среднее</span><strong>${money(education)}</strong></div>`:''}${activity?`<div><span>Секции · среднее</span><strong>${money(activity)}</strong></div>`:''}<div><span>Другие расходы и запас</span><strong>${money(result.monthlyPlanned-rent-food-education-activity)}</strong></div>`;
   $('country-grid').children[index].querySelector('.monthly-price').after(preview);
  }
  $('coverage').textContent=`${valid.filter(r=>!r.incomplete).length} оценок выбранных статей из 9`;
  const first=valid.find(r=>!r.incomplete);
  const rub=value=>new Intl.NumberFormat('ru-RU').format(Number(value.replace(/\s/g,'').replace(',','.'))) + ' ₽';
  $('snapshot').innerHTML=`<div><span>Ваши накопления</span><strong>${esc(rub(personal.savings))}</strong></div><div><span>Доход в месяц</span><strong>${esc(rub(personal.income))}</strong></div><div><span>Срок расчёта</span><strong>${personal.months} мес.</strong></div><div><span>Обязательства в месяц</span><strong>${esc(rub(personal.obligations))}</strong></div><div><span>Состав семьи</span><strong>${personal.adults} взр. · ${personal.children.length} дет.</strong></div><div><span>Квартира</span><strong>${personal.housing==='auto'?'Авто':`${personal.housing} сп.`}</strong></div>`;
  $('result-status').textContent=first?`Полные оценки отсортированы по средним месячным расходам; неполные — после них. Наименьшая оценка выбранных статей: ${first.city.label.split(' · ')[0]}. Курс на ${date(data.rates.effectiveDate)}. Сравните также накопления: годовая школа может оплачиваться сразу.`:'Полных оценок пока нет. Проверьте недостающие статьи в карточках и укажите свои суммы.';
  $('data-status').textContent=`Курсы на ${date(data.rates.effectiveDate)}. Предварительная оценка доступна для ${valid.length} из 9 направлений. Дата каждой цены указана в её источнике.`;
  submitted=true;$('results').hidden=false;$('dirty-notice').hidden=JSON.stringify(personal)===JSON.stringify(currentPersonal());
  $('results-title').focus({preventScroll:true});$('results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 }catch(error){$('form-error').textContent=error.message||'Не удалось выполнить расчёт. Попробуйте ещё раз.';$('form-error').hidden=false;}
 finally{$('calculate').disabled=false;$('calculate').innerHTML=`Рассчитать <span aria-hidden="true">${arrowIcon}</span>`;}
});
setupFamily();
loadData().then(value=>{data=value;$('data-status').textContent=`Курсы на ${date(data.rates.effectiveDate)}. Последняя успешная проверка указана отдельно у каждой цены.`;}).catch(()=>{$('data-status').textContent='Не удалось загрузить данные. Попробуем ещё раз при расчёте.';});
