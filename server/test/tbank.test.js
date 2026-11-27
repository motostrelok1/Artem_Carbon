import test from 'node:test';
import assert from 'node:assert/strict';
import {createToken,validToken,buildInit} from '../src/tbank.js';
import {validateCart} from '../src/catalog.js';
test('token excludes nested data, matches verification and rejects edits',()=>{
 const data={TerminalKey:'123',Amount:200000,OrderId:'abc',Success:true,DATA:{Email:'a@b.c'}};
 const token=createToken(data,'secret');
 assert.equal(validToken({...data,Token:token},'secret'),true);
 assert.equal(validToken({...data,Amount:100000,Token:token},'secret'),false);
 assert.equal(createToken(data,'secret'),createToken({...data,DATA:{Email:'x@y.z'}},'secret'));
});
test('Init signs only flat fields and uses single-stage payment',()=>{
 const x=buildInit({terminalKey:'t',password:'secret',orderId:'o',amount:200000,description:'lesson',notificationUrl:'https://api.example/notify',successUrl:'https://site.example',failUrl:'https://site.example',email:'test@example.ru',receipt:{Taxation:'osn'}});
 assert.equal(x.PayType,'O');assert.equal(validToken(x,'secret'),true);
});
test('cart price always uses server amount',()=>{
 assert.equal(validateCart([{sku:'video_lesson',quantity:5,price:1}]).amount,1000000);
 assert.throws(()=>validateCart([{sku:'video_lesson',quantity:0}]));
 assert.throws(()=>validateCart([{sku:'other',quantity:1}]));
});

test('Init preserves fiscal receipt payload for T-Bank to forward to CloudKassir',()=>{
 const receipt={Email:'buyer@example.ru',Taxation:'usn_income',Items:[{
  Name:'Ложка карбоновая',Quantity:1,Price:2500000,Amount:2500000,
  Tax:'none',PaymentMethod:'full_payment',PaymentObject:'commodity'
 }]};
 const payload=buildInit({
  terminalKey:'test-terminal',password:'CI-only-secret',orderId:'order-1',
  amount:2500000,description:'Ложка карбоновая',
  notificationUrl:'https://api.example.ru/notify',
  successUrl:'https://site.example.ru/ok',
  failUrl:'https://site.example.ru/fail',email:'buyer@example.ru',receipt
 });
 assert.deepEqual(payload.Receipt,receipt);
 assert.equal(payload.Receipt.Items[0].Amount,payload.Amount);
 assert.ok(validToken(payload,'CI-only-secret'));
});
