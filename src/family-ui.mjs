import {extraFields} from './family.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const option=(value,label,selected)=>`<option value="${value}"${String(value)===String(selected)?' selected':''}>${label}</option>`;
const modes=(selected,education=false)=>option('reference',education?'Пример учреждения в каждом городе':'Пример секции в каждом городе',selected)+option('manual','Своя сумма в рублях',selected)+option('none',education?'Не включать обучение':'Без отдельных платных секций',selected);
export function readChildren(){
 return Array.from($('children-fields').children).map((_,i)=>{
  const value=name=>$(`child-${i}-${name}`)?.value;
  return {age:value('age'),education:value('education'),educationAmount:value('education-amount'),educationEvery:value('education-every'),educationEntry:value('education-entry'),activity:value('activity'),activityAmount:value('activity-amount'),babyAmount:value('baby-amount')};
 });
}
export function readFamily(){return {adults:$('adults').value,housing:$('housing').value,children:readChildren(),extras:Object.fromEntries(Object.keys(extraFields).map(key=>[key,$(`extra-${key}`).value]))};}
function renderChildren(){
 const previous=readChildren(),count=Number($('children-count').value);
 $('children-fields').innerHTML=Array.from({length:count},(_,i)=>{
  const c=previous[i]??{age:'6',education:'reference',activity:'none'},id=`child-${i}`;
  return `<fieldset class="child-panel"><legend>Ребёнок ${i+1}</legend><div class="child-grid">
   <label for="${id}-age">Возраст, лет<select id="${id}-age">${Array.from({length:18},(_,n)=>option(n,n===0?'До 1 года':n,c.age)).join('')}</select></label>
   <label for="${id}-education">Сад или школа<select id="${id}-education">${modes(c.education,true)}</select></label>
   <label for="${id}-activity">Секции и кружки<select id="${id}-activity">${modes(c.activity)}</select></label></div>
   <div id="${id}-education-manual" class="child-manual" hidden>
    <label for="${id}-education-amount">Один платёж за обучение, ₽<input id="${id}-education-amount" type="text" inputmode="decimal" value="${esc(c.educationAmount??'')}" placeholder="Включая налоги"></label>
    <label for="${id}-education-every">Как часто платите<select id="${id}-education-every">${[[1,'Каждый месяц'],[3,'Раз в 3 месяца'],[6,'Раз в 6 месяцев'],[12,'Год вперёд']].map(([n,t])=>option(n,t,c.educationEvery??1)).join('')}</select></label>
    <label for="${id}-education-entry">Вступительные взносы, ₽ разово<input id="${id}-education-entry" type="text" inputmode="decimal" value="${esc(c.educationEntry??'0')}"></label></div>
   <div id="${id}-activity-manual" class="child-manual" hidden><label for="${id}-activity-amount">Все секции ребёнка, ₽ / мес.<input id="${id}-activity-amount" type="text" inputmode="decimal" value="${esc(c.activityAmount??'')}"></label></div>
   <div id="${id}-baby" class="child-manual" hidden><label for="${id}-baby-amount">Питание, смеси и подгузники, ₽ / мес.<input id="${id}-baby-amount" type="text" inputmode="decimal" value="${esc(c.babyAmount??'')}" placeholder="Ваша сумма на малыша"></label></div>
  </fieldset>`;
 }).join('');
 syncFamily();
}
export function syncFamily(){
 const children=readChildren();
 children.forEach((c,i)=>{
  $(`child-${i}-education-manual`).hidden=c.education!=='manual';
  $(`child-${i}-activity-manual`).hidden=c.activity!=='manual';
  $(`child-${i}-baby`).hidden=Number(c.age)>=3;
 });
 $('family-help').hidden=children.length===0;
 const adults=Number($('adults').value);
 const label=`${adults} ${adults===1?'взрослый':adults<5?'взрослых':'взрослых'}${children.length?` · детей: ${children.length}`:''}`;
 $('family-tag').textContent=label;
 $('assumption').textContent=`${label} · ${$('months').value} мес. по 30 дней · запас 10% · резерв на месяц`;
}
export function setupFamily(){
 $('children-count').addEventListener('change',renderChildren);
 $('budget-form').addEventListener('change',syncFamily);
 renderChildren();
}
