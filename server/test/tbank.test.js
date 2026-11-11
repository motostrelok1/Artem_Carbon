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
