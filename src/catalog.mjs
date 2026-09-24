export const cities=[
 {id:'danang',label:'Дананг · Вьетнам',query:'Da Nang, Vietnam',currency:'VND',rent:'https://batdongsan.com.vn/'},
 {id:'nhatrang',label:'Нячанг · Вьетнам',query:'Nha Trang, Vietnam',currency:'VND',rent:'https://batdongsan.com.vn/'},
 {id:'bangkok',label:'Бангкок · Таиланд',query:'Bangkok, Thailand',currency:'THB',rent:'https://www.ddproperty.com/en/property-for-rent'},
 {id:'bali',label:'Бали · Индонезия',query:'Bali, Indonesia',currency:'IDR',rent:'https://www.rumah123.com/en/rent/'},
 {id:'kl',label:'Куала-Лумпур · Малайзия',query:'Kuala Lumpur, Malaysia',currency:'MYR',rent:'https://www.propertyguru.com.my/property-for-rent'},
 {id:'tbilisi',label:'Тбилиси · Грузия',query:'Tbilisi, Georgia',currency:'GEL',rent:'https://www.myhome.ge/en/'},
 {id:'yerevan',label:'Ереван · Армения',query:'Yerevan, Armenia',currency:'AMD',rent:'https://www.list.am/en/'},
 {id:'belgrade',label:'Белград · Сербия',query:'Belgrade, Serbia',currency:'RSD',rent:'https://www.4zida.rs/'},
 {id:'antalya',label:'Анталья · Турция',query:'Antalya, Turkey',currency:'TRY',rent:'https://www.hepsiemlak.com/en'}
];
export const currencies=['RUB','USD','EUR','VND','THB','IDR','MYR','GEL','AMD','RSD','TRY'];
export const lineDefinitions=[
 ['rent','Аренда','monthly','household',true,'За квартиру целиком. Первый месяц уже входит в период расчёта.'],
 ['food','Еда','monthly','person',true,'Продукты и кафе на одного человека.'],
 ['utilities','Коммунальные услуги','monthly','household',true,'Свет, вода, отопление, обслуживание дома.'],
 ['internet','Домашний интернет','monthly','household',false,'Если включён в аренду, не добавляйте повторно.'],
 ['phone','Мобильная связь','monthly','person',true,'SIM или eSIM на одного человека.'],
 ['transport','Транспорт','monthly','person',true,'Проездной, такси или аренда транспорта.'],
 ['insurance','Страховка и здоровье','monthly','person',true,'Если полис оплачен на весь период, выберите «Один раз».'],
 ['other','Другие регулярные расходы','monthly','household',false,'Школа, работа, подписки и другие ваши расходы.'],
 ['flight','Билеты и багаж','once','person',true,'Итоговая цена с багажом на одного человека.'],
 ['documents','Документы и виза','once','person',false,'Переводы, апостиль, справки и сборы.'],
 ['temporary','Временное жильё','once','household',false,'Расходы до начала основного периода аренды.'],
 ['arrival','Трансфер и обустройство','once','household',false,'Дорога из аэропорта, вещи для дома, комиссия агента.']
].map(([id,label,period,basis,enabled,hint])=>({id,label,period,basis,enabled,hint}));
export function makeLines(currency){return lineDefinitions.map(x=>({...x,amount:'',currency,origin:'manual',sourceDate:null}));}
