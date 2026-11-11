import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseMessage} from '../src/email-template.js';
test('purchase email includes correct quantity and amount',()=>{
 const message=purchaseMessage({id:'12345678-1234-1234-1234-123456789012',email:'customer@example.org',
  amount_kopecks:600000,items:[{sku:'video_lesson',quantity:3,unit_price_kopecks:200000}]});
 assert.match(message.subject,/12345678/);
 assert.match(message.text,/3/);
 assert.match(message.text,/6\s*000 ₽/);
 assert.doesNotMatch(message.text,/уникальный билет/i);
});
test('mail template escapes html and rejects unknown products',()=>{
 assert.throws(()=>purchaseMessage({id:'12345678-1234-1234-1234-123456789012',email:'a@example.org',
 amount_kopecks:100,items:[{sku:'unknown',quantity:1,unit_price_kopecks:100}]}));
});
