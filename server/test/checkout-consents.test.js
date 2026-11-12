import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCheckoutConsents} from '../src/checkout-consents.js';

test('both consents are required for a lesson purchase',()=>{
 assert.deepEqual(validateCheckoutConsents({personalConsent:true,marketingConsent:true}),{
  personalConsent:true,marketingConsent:true
 });
 for(const data of [{},{personalConsent:true},{marketingConsent:true},
  {personalConsent:true,marketingConsent:'true'},
  {personalConsent:1,marketingConsent:true},
  {personalConsent:false,marketingConsent:true}]){
  assert.throws(()=>validateCheckoutConsents(data));
 }
});
