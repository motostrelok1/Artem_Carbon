// Only the personal-data acknowledgement is required for checkout.
// Marketing/email updates are a separate, voluntary opt-in.
export function validateCheckoutConsents(buyer){
 if(buyer?.personalConsent!==true)throw new Error('Подтвердите согласие с обработкой персональных данных');
 if(buyer.marketingConsent!==undefined&&typeof buyer.marketingConsent!=='boolean')
  throw new Error('Invalid marketing consent');
 return {personalConsent:true,marketingConsent:buyer.marketingConsent===true};
}
