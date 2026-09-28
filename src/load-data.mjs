export async function loadData(fetcher=fetch,timeoutMs=15000){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const responses=await Promise.all(['prices','rates','family'].map(name=>fetcher(`data/${name}.json`,{cache:'no-store',signal:controller.signal})));
  if(responses.some(r=>!r.ok))throw new Error('HTTP');
  const [prices,rates,family]=await Promise.all(responses.map(r=>r.json()));
  if(!prices?.cities||!rates?.rates||!family?.cities)throw new Error('Invalid data');
  return {prices,rates,family};
 }catch{
  throw new Error(controller.signal.aborted?'Загрузка заняла слишком много времени. Проверьте интернет и повторите расчёт.':'Не удалось загрузить данные. Проверьте интернет и повторите расчёт.');
 }finally{clearTimeout(timeout);}
}
