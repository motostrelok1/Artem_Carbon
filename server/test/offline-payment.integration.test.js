import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {createToken,validToken} from '../src/tbank.js';
import {purchaseMessage} from '../src/email-template.js';

const dbUrl=process.env.TEST_DATABASE_URL;
test('isolated T-Bank payment: Init, signed CONFIRMED, serials, email queue, duplicate and refund', {
 skip: !dbUrl && 'TEST_DATABASE_URL not configured; integration test only runs against an isolated CI database',
 timeout: 45000
}, async()=>{
 const db=new pg.Pool({connectionString:dbUrl,max:3});
 const bankRequests=[];
 let counter=0;
 const mockBank=createServer(async(req,res)=>{
  try{
   if(req.method!=='POST'||req.url!=='/v2/Init'){res.writeHead(404).end();return}
   const parts=[];
   for await(const chunk of req)parts.push(chunk);
   const payload=JSON.parse(Buffer.concat(parts).toString('utf8'));
   bankRequests.push(payload);
   if(!validToken(payload,'CI-only-secret')){res.writeHead(400).end();return}
   res.setHeader('Content-Type','application/json');
   res.end(JSON.stringify({
    Success:true,PaymentId:'offline-'+(++counter),
    PaymentURL:'https://bank.invalid/offline-payment/'+counter
   }));
  }catch(e){res.writeHead(500).end('mock bank error')}
 });
 let app=null;
 const listen=()=>new Promise(resolve=>mockBank.listen(0,'127.0.0.1',resolve));
 try{
  // This database is provided by GitHub Actions, never the working artems_carbon database.
  await db.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='artems_app') THEN CREATE ROLE artems_app; END IF; END $$");
  for(const file of [
   '001_sales.sql','002_email_outbox.sql','003_course_buyer.sql',
   '004_lesson_numbers.sql','005_checkout_consents.sql'
  ]){
   await db.query(await readFile(new URL('../sql/'+file,import.meta.url),'utf8'));
  }
  await listen();
  const bankPort=mockBank.address().port;
  const port=39771;
  app=spawn(process.execPath,['src/app.js'],{
   cwd:new URL('..',import.meta.url).pathname,
   env:{
    ...process.env,
    DATABASE_URL:dbUrl,
    PAYMENTS_ENABLED:'true',
    EMAIL_ENABLED:'false',
    TBANK_TERMINAL_KEY:'offline-terminal',
    TBANK_PASSWORD:'CI-only-secret',
    TBANK_API_URL:'http://127.0.0.1:'+bankPort+'/v2',
    TBANK_TAXATION:'usn_income',
    TBANK_ITEM_TAX:'none',
    API_PUBLIC_URL:'https://offline.example.invalid',
    PUBLIC_SITE_URL:'https://motostrelok1.github.io',
    PUBLIC_BASE_PATH:'/Artem_Carbon/',
    PORT:String(port)
   },
   stdio:'ignore'
  });
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<70;i++){
   if(app.exitCode!==null)throw Error('API terminated before readiness');
   try{const r=await fetch(base+'/health');if(r.ok){ready=true;break}}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(ready,true,'isolated API starts with temporary database');
  const buyer={
   lastName:'Иванов',firstName:'Иван',patronymic:'Иванович',
   phone:'+7 (999) 123-45-67',email:'buyer@example.org',instagram:'@artems_carbon',
   personalConsent:true,marketingConsent:true
  };
  const create=await fetch(base+'/api/orders',{
   method:'POST',headers:{'Content-Type':'application/json','Origin':'https://motostrelok1.github.io'},
   body:JSON.stringify({email:buyer.email,buyer,items:[{sku:'video_lesson',quantity:2}]})
  });
  assert.equal(create.status,200,'signed Init creates order');
  const {orderId,paymentUrl}=await create.json();
  assert.match(orderId,/^[0-9a-f-]{36}$/i);
  assert.equal(paymentUrl,'https://bank.invalid/offline-payment/1');
  assert.equal(bankRequests.length,1);
  assert.equal(bankRequests[0].Amount,400000,'server owns 2 x 2000 RUB price');
  assert.equal(bankRequests[0].PayType,'O');
  assert.match(bankRequests[0].NotificationURL,/\/api\/payments\/tbank\/notification$/);
  assert.equal(bankRequests[0].Receipt.Taxation,'usn_income');
  assert.equal(bankRequests[0].Receipt.Items[0].Tax,'none');
  const before=await db.query('SELECT COUNT(*)::int AS n FROM lesson_number_pool WHERE order_id IS NOT NULL');
  assert.equal(before.rows[0].n,0,'Init does not allocate serials');
  const pending=await db.query('SELECT status FROM orders WHERE id=$1',[orderId]);
  assert.equal(pending.rows[0].status,'pending');

  const event={
   TerminalKey:'offline-terminal',PaymentId:'offline-1',OrderId:orderId,
   Amount:400000,Success:true,Status:'CONFIRMED'
  };
  const notify=async payload=>fetch(base+'/api/payments/tbank/notification',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
  });
  const invalid=await notify({...event,Amount:1,Token:createToken(event,'CI-only-secret')});
  assert.equal(invalid.status,403,'tampered amount rejected with invalid signature');
  const signed={...event,Token:createToken(event,'CI-only-secret')};
  const accepted=await notify(signed);
  assert.equal(accepted.status,200);assert.equal(await accepted.text(),'OK');
  const paid=await db.query('SELECT status FROM orders WHERE id=$1',[orderId]);
  assert.equal(paid.rows[0].status,'paid');
  const assigned=await db.query('SELECT number FROM lesson_number_pool WHERE order_id=$1 ORDER BY number',[orderId]);
  assert.equal(assigned.rowCount,2);
  assert.notEqual(assigned.rows[0].number,assigned.rows[1].number);
  assert.ok(assigned.rows.every(x=>x.number>=1&&x.number<=9500));
  const count=await db.query('SELECT sold_lessons FROM public_lesson_sales');
  assert.equal(Number(count.rows[0].sold_lessons),2);
  const mail=await db.query('SELECT state FROM email_outbox WHERE order_id=$1',[orderId]);
  assert.equal(mail.rowCount,1);assert.equal(mail.rows[0].state,'queued');
  const rendered=purchaseMessage({
   id:orderId,email:buyer.email,amount_kopecks:400000,
   items:[{sku:'video_lesson',quantity:2,unit_price_kopecks:200000}],
   lessonNumbers:assigned.rows.map(x=>x.number)
  });
  for(const row of assigned.rows)assert.ok(rendered.text.includes(String(row.number).padStart(4,'0')));
  assert.match(rendered.text,/4\s*000 ₽/);

  const duplicate=await notify(signed);
  assert.equal(duplicate.status,200);
  const [serialCount,queuedCount,eventCount]=await Promise.all([
   db.query('SELECT COUNT(*)::int AS n FROM lesson_number_pool WHERE order_id=$1',[orderId]),
   db.query('SELECT COUNT(*)::int AS n FROM email_outbox WHERE order_id=$1',[orderId]),
   db.query('SELECT COUNT(*)::int AS n FROM payment_events WHERE order_id=$1',[orderId])
  ]);
  assert.equal(serialCount.rows[0].n,2,'duplicate webhook does not allocate again');
  assert.equal(queuedCount.rows[0].n,1,'duplicate webhook does not queue again');
  assert.equal(eventCount.rows[0].n,1,'event is idempotent');

  const refund={...event,Status:'REFUNDED'};
  const refunded=await notify({...refund,Token:createToken(refund,'CI-only-secret')});
  assert.equal(refunded.status,200);
  const voided=await db.query('SELECT COUNT(*)::int AS n FROM lesson_number_pool WHERE order_id=$1 AND voided_at IS NOT NULL',[orderId]);
  assert.equal(voided.rows[0].n,2,'refunded serials are void, not reissued');
  const afterRefund=await db.query('SELECT sold_lessons FROM public_lesson_sales');
  assert.equal(Number(afterRefund.rows[0].sold_lessons),0);
  assert.equal(bankRequests.length,1,'only local mock bank was called');
 }finally{
  if(app && app.exitCode===null){app.kill('SIGTERM');await new Promise(resolve=>{app.once('exit',resolve);setTimeout(resolve,1000).unref()})}
  await new Promise(resolve=>mockBank.close(resolve));
  await db.end();
 }
});
