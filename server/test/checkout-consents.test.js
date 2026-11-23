import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCheckoutConsents} from '../src/checkout-consents.js';

test('personal consent is mandatory; marketing consent is optional',()=>{
 assert.deepEqual(validateCheckoutConsents({personalConsent:true,marketingConsent:true}),{
  personalConsent:true,marketingConsent:true
 });
 assert.deepEqual(validateCheckoutConsents({personalConsent:true,marketingConsent:false}),{
  personalConsent:true,marketingConsent:false
 });
 assert.deepEqual(validateCheckoutConsents({personalConsent:true}),{
  personalConsent:true,marketingConsent:false
 });
 for(const data of [{},{marketingConsent:true},{personalConsent:1,marketingConsent:true},
  {personalConsent:false,marketingConsent:true},
  {personalConsent:true,marketingConsent:'true'},
  {personalConsent:true,marketingConsent:null}]){
  assert.throws(()=>validateCheckoutConsents(data));
 }
});
