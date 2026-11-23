import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseMessage} from '../src/email-template.js';
import {resolveLessonPhotoPath} from '../src/mail-photo.js';
import {basename} from 'node:path';
test('purchase email includes correct quantity and amount',()=>{
 const message=purchaseMessage({id:'12345678-1234-1234-1234-123456789012',email:'customer@example.org',
  amount_kopecks:600000,items:[{sku:'video_lesson',quantity:3,unit_price_kopecks:200000}],lessonNumbers:[147,3821,9076],hasLessonPhoto:true});
 assert.match(message.subject,/12345678/);
 assert.match(message.text,/3/);
 assert.match(message.text,/6\s*000 ₽/);
 assert.match(message.text,/0147, 3821, 9076/);
 assert.match(message.html,/cid:artems-lesson-photo/);
 assert.match(message.html,/0147/);
});
test('mail template escapes html and rejects unknown products',()=>{
 assert.throws(()=>purchaseMessage({id:'12345678-1234-1234-1234-123456789012',email:'a@example.org',
 amount_kopecks:100,items:[{sku:'unknown',quantity:1,unit_price_kopecks:100}]}));
});

test('does not send paid lesson email without complete assigned serials',()=>{
 const base={id:'12345678-1234-1234-1234-123456789012',email:'customer@example.org',
 amount_kopecks:400000,items:[{sku:'video_lesson',quantity:2,unit_price_kopecks:200000}]};
 assert.throws(()=>purchaseMessage({...base,lessonNumbers:[]}),/serial/);
 assert.throws(()=>purchaseMessage({...base,lessonNumbers:[12,12]}),/serial/);
 assert.throws(()=>purchaseMessage({...base,lessonNumbers:[9501,1]}),/serial/);
});
test('physical goods email does not require numbers or include lesson photo',()=>{
 const mail=purchaseMessage({id:'12345678-1234-1234-1234-123456789012',
 email:'customer@example.org',amount_kopecks:1000000,
 items:[{sku:'carbon_knife',quantity:1,unit_price_kopecks:1000000}]});
 assert.doesNotMatch(mail.html,/Номера ваших видеоуроков/);
 assert.doesNotMatch(mail.html,/cid:artems-lesson-photo/);
});

test('lesson photo resolves to existing 5.jpg in repository checkout',()=>{
 const path=resolveLessonPhotoPath({override:null,sitePath:'/no-such-deployed-image/5.jpg'});
 assert.equal(basename(path||''),'5.jpg');
});

test('receipt footer does not promise unavailable fiscalization',()=>{
 const message=purchaseMessage({id:'12345678-1234-1234-1234-123456789012',email:'customer@example.org',
  amount_kopecks:200000,items:[{sku:'video_lesson',quantity:1,unit_price_kopecks:200000}],lessonNumbers:[6362]});
 assert.match(message.html,/6362/);
 assert.doesNotMatch(message.html,/Электронный кассовый чек отправляется через настроенную фискализацию/);
});
