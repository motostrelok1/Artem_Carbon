import {formatLessonNumber} from './lesson-numbers.js';
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('ru-RU').format(n/100)+' ₽';
const names={
 video_lesson:'Видеоурок «Изготовление карбоновой детали»',
 carbon_helmet:'Каска карбоновая',carbon_spoon:'Ложка карбоновая',carbon_knife:'Нож карбоновый'
};
export function purchaseMessage(order){
 const id=String(order.id);
 const email=String(order.email);
 if(!/^[0-9a-f-]{36}$/i.test(id)||!Array.isArray(order.items)||!order.items.length)throw Error('Invalid order');
 const rows=order.items.map(i=>{
  if(!Object.hasOwn(names,i.sku)||!Number.isInteger(i.quantity)||i.quantity<1||!Number.isSafeInteger(i.unit_price_kopecks))throw Error('Invalid item');
  return {name:names[i.sku],quantity:i.quantity,price:i.unit_price_kopecks};
 });
 if(!Number.isSafeInteger(order.amount_kopecks)||order.amount_kopecks<0)throw Error('Invalid amount');
 const short=id.slice(0,8).toUpperCase();
 const title='ARTEMS CARBON — подтверждение оплаты заказа '+short;
 const itemsText=rows.map(x=>'- '+x.name+' × '+x.quantity+' — '+fmt(x.price*x.quantity)).join('\n');
 const containsLesson=rows.some(x=>x.name.startsWith('Видеоурок'));
 const lessonCount=order.items.filter(i=>i.sku==='video_lesson').reduce((n,i)=>n+i.quantity,0);
 const lessonNumbers=Array.isArray(order.lessonNumbers)?order.lessonNumbers:[];
 if(containsLesson&&(lessonNumbers.length!==lessonCount||new Set(lessonNumbers).size!==lessonCount||
   lessonNumbers.some(n=>!Number.isInteger(n)||n<1||n>9500)))throw Error('Paid lesson serial numbers missing or invalid');
 const formattedNumbers=lessonNumbers.map(formatLessonNumber);
 const numberText=containsLesson?'\nНомера приобретённых видеоуроков: '+formattedNumbers.join(', ')+'\n':'';
 const numberHtml=containsLesson?'<h3>Номера ваших видеоуроков</h3><p style="font-size:22px;font-weight:bold;color:#ff4555">'+formattedNumbers.map(escapeHtml).join(' · ')+'</p>':'';
 const photoHtml=order.hasLessonPhoto?'<img src="cid:artems-lesson-photo" alt="ARTEMS CARBON — ваш видеоурок" style="display:block;width:100%;max-width:600px;height:auto;margin:15px auto;border:0">':'';
 const note=containsLesson?'Информация о доступе к видеообучению будет направлена отдельно после настройки защищённой выдачи доступа.':'По вопросам заказа свяжитесь с мастерской.';
 const text=`Здравствуйте!\n\nОплата заказа ${short} подтверждена.\n\n${itemsText}\nИтого: ${fmt(order.amount_kopecks)}\n${numberText}\n\n${note}\n\nАртём ответит на вопросы в Instagram: https://www.instagram.com/artems_carbon\n\nARTEMS CARBON\nЭто автоматическое письмо, отвечать на него не нужно.`;
 const tr=rows.map(x=>`<tr><td style="padding:9px;border-bottom:1px solid #ddd">${escapeHtml(x.name)}</td><td style="padding:9px;border-bottom:1px solid #ddd">${x.quantity}</td><td style="padding:9px;border-bottom:1px solid #ddd">${escapeHtml(fmt(x.price*x.quantity))}</td></tr>`).join('');
 const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;background:#101014;color:#fff;padding:24px"><main style="max-width:650px;margin:auto;background:#1c1d22;padding:24px"><h1>ARTEMS <span style="color:#f22532">CARBON</span></h1>${photoHtml}<h2>Оплата подтверждена</h2><p>Номер заказа: <strong>${escapeHtml(short)}</strong></p><table style="width:100%;background:#fff;color:#222;border-collapse:collapse"><thead><tr><th align="left">Товар</th><th>Кол-во</th><th>Сумма</th></tr></thead><tbody>${tr}</tbody></table><h2>Итого: ${escapeHtml(fmt(order.amount_kopecks))}</h2>${numberHtml}<p>${escapeHtml(note)}</p><p>Вопросы Артёму: <a style="color:#ff737c" href="https://www.instagram.com/artems_carbon">Instagram</a></p><p style="color:#aaa;font-size:12px">Автоматическое письмо о покупке. Электронный кассовый чек отправляется через настроенную фискализацию.</p></main></body></html>`;
 return {to:email,subject:title,text,html,messageId:'<order-'+id+'@artems-carbon.example>'};
}
