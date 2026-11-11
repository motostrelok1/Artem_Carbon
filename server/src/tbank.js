import {createHash,timingSafeEqual} from 'node:crypto';
export function createToken(fields,password){
 const pairs=Object.entries({...fields,Password:password})
  .filter(([key,value])=>key!=='Token' && value!==null && value!==undefined && (typeof value==='string'||typeof value==='number'||typeof value==='boolean'))
  .sort(([a],[b])=>a.localeCompare(b,'en'));
 return createHash('sha256').update(pairs.map(([,v])=>String(v)).join(''),'utf8').digest('hex');
}
export function validToken(fields,password){
 if(typeof fields?.Token!=='string'||!/^[0-9a-f]{64}$/i.test(fields.Token))return false;
 const expected=Buffer.from(createToken(fields,password),'hex'),received=Buffer.from(fields.Token,'hex');
 return timingSafeEqual(expected,received);
}
export function buildInit({terminalKey,password,orderId,amount,description,notificationUrl,successUrl,failUrl,email,receipt}){
 const payload={
  TerminalKey:terminalKey,Amount:amount,OrderId:orderId,PayType:'O',Description:description,
  NotificationURL:notificationUrl,SuccessURL:successUrl,FailURL:failUrl,
  DATA:{Email:email},
  Receipt:receipt
 };
 payload.Token=createToken(payload,password);
 return payload;
}
export async function initPayment(payload,baseUrl,fetcher=fetch){
 const response=await fetcher(baseUrl.replace(/\/$/,'')+'/Init',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw new Error('T-Bank endpoint unavailable');
 const result=await response.json();
 if(result.Success!==true||typeof result.PaymentURL!=='string'||!/^https:\/\//.test(result.PaymentURL)||!result.PaymentId)throw new Error('T-Bank Init failed');
 return result;
}
