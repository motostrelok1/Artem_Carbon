// Shared server-side buyer validation. Never rely solely on HTML checks.
const personName=/^[\p{L}](?:[\p{L}\p{M}'’ -]{0,78}[\p{L}\p{M}])?$/u;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const instagramPattern=/^[A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$/;
export function validateCourseBuyer(data) {
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Укажите данные покупателя');
 const getName=(field,label)=>{
  const value=typeof data[field]==='string'?data[field].trim().replace(/\s+/g,' '):'';
  if(value.length<2||value.length>80||!personName.test(value))throw new Error('Проверьте поле «'+label+'»');
  return value;
 };
 const lastName=getName('lastName','Фамилия');
 const firstName=getName('firstName','Имя');
 const patronymic=getName('patronymic','Отчество');
 const raw=typeof data.phone==='string'?data.phone.trim():'';
 if(!/^\+?[\d\s()\-]{10,24}$/.test(raw))throw new Error('Укажите корректный номер телефона');
 const digits=raw.replace(/\D/g,'');
 let phone;
 if(digits.length===10&&!raw.startsWith('+')&&digits.startsWith('9'))phone='+7'+digits;
 else if(digits.length===11&&digits[0]==='7')phone='+7'+digits.slice(1);
 else if(digits.length===11&&digits[0]==='8'&&!raw.startsWith('+'))phone='+7'+digits.slice(1);
 else throw new Error('Укажите российский номер из 10 цифр с кодом +7 или 8');
 const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
 if(!email||email.length>254||!emailPattern.test(email))throw new Error('Укажите корректный email');
 const rawInstagram=typeof data.instagram==='string'?data.instagram.trim():'';
 const instagram=rawInstagram.replace(/^@/,'');
 if(rawInstagram && (!instagramPattern.test(instagram)||instagram.includes('..')))throw new Error('Проверьте ник Instagram');
 return {lastName,firstName,patronymic,phone,email,instagram:instagram||null};
}
