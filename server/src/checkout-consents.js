// Server-side enforcement: client checkboxes can be bypassed with HTTP calls.
export function validateCheckoutConsents(buyer){
 if(buyer?.personalConsent!==true||buyer?.marketingConsent!==true)
  throw new Error('Required checkout consents must be confirmed');
 return {personalConsent:true,marketingConsent:true};
}
