import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCourseBuyer} from '../src/buyer-validation.js';
const buyer={lastName:'Иванов',firstName:'Иван',patronymic:'Иванович',phone:'+7 (999) 123-45-67',email:' TEST@EXAMPLE.RU ',instagram:'@artems_carbon'};
test('validates and normalizes course buyer fields',()=>{
 assert.deepEqual(validateCourseBuyer(buyer),{
  lastName:'Иванов',firstName:'Иван',patronymic:'Иванович',phone:'+79991234567',
  email:'test@example.ru',instagram:'artems_carbon'
 });
 assert.equal(validateCourseBuyer({...buyer,phone:'89991234567'}).phone,'+79991234567');
 assert.equal(validateCourseBuyer({...buyer,instagram:''}).instagram,null);
});
test('requires all five mandatory buyer fields',()=>{
 for(const key of ['lastName','firstName','patronymic','phone','email']){
  assert.throws(()=>validateCourseBuyer({...buyer,[key]:''}),key);
 }
});
test('rejects invalid phone, email and instagram handle',()=>{
 for(const phone of ['123','+7999123456','+89991234567','+7 999 ABC 45 67'])
  assert.throws(()=>validateCourseBuyer({...buyer,phone}),phone);
 assert.throws(()=>validateCourseBuyer({...buyer,email:'invalid'}));
 assert.throws(()=>validateCourseBuyer({...buyer,instagram:'bad..nick'}));
});
