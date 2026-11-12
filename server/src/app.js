import express from 'express';
import pg from 'pg';
import {randomUUID,createHmac,scryptSync,timingSafeEqual} from 'node:crypto';
import {catalog,validateCart} from './catalog.js';
import {validateCourseBuyer} from './buyer-validation.js';
import {validateCheckoutConsents} from './checkout-consents.js';
import {buildInit,initPayment,validToken} from './tbank.js';
import {assignLessonNumbers,voidLessonNumbers} from './lesson-numbers.js';

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'64kb'}));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000});
const origin=process.env.PUBLIC_SITE_URL||'https://motostrelok1.github.io';
const basePath=process.env.PUBLIC_BASE_PATH||'/Artem_Carbon/';
const serverOrigin=process.env.API_PUBLIC_URL||'';
const enabled=process.env.PAYMENTS_ENABLED==='true';
const config={terminal:process.env.TBANK_TERMINAL_KEY,password:process.env.TBANK_PASSWORD,endpoint:process.env.TBANK_API_URL||'https://securepay.tinkoff.ru/v2'};
const prices=Object.fromEntries(Object.entries(catalog).map(([sku,item])=>[sku,item.price]));
function reject(res,status,message){return res.status(status).json({error:message})}
function formatPeriod(period){
 if(period==='day')return '1 day';
 if(period==='week')return '7 days';
 if(period==='month')return '30 days';
 if(period==='all')return null;
 throw new Error('Invalid period');
}
app.use((req,res,next)=>{
 res.setHeader('Vary','Origin');
 const requestOrigin=req.headers.origin;
 if(requestOrigin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
 if(req.method==='OPTIONS')return requestOrigin===origin?res.sendStatus(204):res.sendStatus(403);
 next();
});
app.get('/health',(req,res)=>res.json({status:'ok',paymentsEnabled:enabled}));
app.get('/api/public/stats',async(req,res)=>{
 try{
  const r=await pool.query('SELECT sold_lessons FROM public_lesson_sales');
  res.setHeader('Cache-Control','public,max-age=30');
  res.json({soldLessons:Number(r.rows[0].sold_lessons)});
 }catch(err){console.error('public stats failed',err);reject(res,503,'Statistics unavailable')}
});

// Real admin authentication lives exclusively on the API; the GitHub Pages
// demo password must never be used to authorize bank data.
const adminHash=process.env.ADMIN_PASSWORD_HASH||'';
const secret=process.env.SESSION_SECRET||'';
function validPassword(plain){
 const [salt,hash]=adminHash.split(':');
 if(!salt||!hash||!secret)return false;
 try{const expected=Buffer.from(hash,'hex');const actual=scryptSync(plain,salt,expected.length);return actual.length===expected.length&&timingSafeEqual(actual,expected)}catch{return false}
}
function sign(value){return createHmac('sha256',secret).update(value).digest('hex')}
function adminAuth(req,res,next){
 if(!secret)return reject(res,503,'Admin not configured');
 const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('artems_admin='));
 const token=cookie?.split('=')[1]||'';
 const parts=token.split('.');
 if(parts.length!==2)return reject(res,401,'Authentication required');
 const [body,mac]=parts;
 if(!/^[a-zA-Z0-9_-]+$/.test(body)||!/^[0-9a-f]{64}$/.test(mac))return reject(res,401,'Authentication required');
 const expected=Buffer.from(sign(body),'hex'),actual=Buffer.from(mac,'hex');
 if(!timingSafeEqual(expected,actual))return reject(res,401,'Authentication required');
 try{
  const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  if(payload.role!=='admin'||!Number.isSafeInteger(payload.exp)||payload.exp<Date.now())return reject(res,401,'Session expired');
  next();
 }catch{return reject(res,401,'Authentication required')}
}
const attempts=new Map();
app.post('/api/admin/login',(req,res)=>{
 if(req.headers.origin!==serverOrigin)return reject(res,403,'Forbidden origin');
 const ip=req.ip||'unknown';const now=Date.now();
 const state=attempts.get(ip)||{count:0,until:0};
 if(state.until>now)return reject(res,429,'Try later');
 if(typeof req.body?.password!=='string'||!validPassword(req.body.password)){
  state.count++;state.until=state.count>=5?now+15*60*1000:0;attempts.set(ip,state);
  return reject(res,401,'Invalid credentials');
 }
 attempts.delete(ip);
 const payload=Buffer.from(JSON.stringify({role:'admin',exp:now+8*60*60*1000})).toString('base64url');
 res.setHeader('Set-Cookie','artems_admin='+payload+'.'+sign(payload)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');
 res.json({authenticated:true});
});
app.post('/api/admin/logout',(req,res)=>{
 if(req.headers.origin!==serverOrigin)return reject(res,403,'Forbidden origin');
 res.setHeader('Set-Cookie','artems_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
 res.json({ok:true});
});
// All customer details stay server-side and are available only after adminAuth.
// Read-only dashboard: no client-side demo counters or simulated transactions.
app.get('/api/admin/overview',adminAuth,async(req,res)=>{
 try{
  const r=await pool.query(`
   SELECT (SELECT COUNT(*)::int FROM orders WHERE status='paid') AS paid_orders,
          (SELECT COUNT(DISTINCT customer_id)::int FROM orders WHERE status='paid') AS customers,
          (SELECT COALESCE(SUM(amount_kopecks),0)::bigint FROM orders WHERE status='paid') AS revenue_kopecks,
          (SELECT COUNT(*)::int FROM orders WHERE status='pending') AS pending_orders,
          (SELECT COUNT(*)::int FROM orders WHERE status='refunded') AS refunded_orders,
          (SELECT sold_lessons FROM public_lesson_sales) AS sold_lessons,
          (SELECT COUNT(*)::int FROM email_outbox WHERE state IN ('queued','sending','failed')) AS email_pending
  `);
  const x=r.rows[0];res.setHeader('Cache-Control','no-store');
  res.json(Object.fromEntries(Object.entries(x).map(([k,v])=>[k,Number(v)])));
 }catch(err){console.error('overview unavailable',err);reject(res,503,'Overview unavailable')}
});
app.get('/api/admin/orders',adminAuth,async(req,res)=>{
 const status=String(req.query.status||'all');
 if(!['all','pending','paid','cancelled','refunded'].includes(status))return reject(res,400,'Invalid status');
 const page=Number(req.query.page||1);
 if(!Number.isSafeInteger(page)||page<1||page>100000)return reject(res,400,'Invalid page');
 const limit=30;
 try{
  const [total,result]=await Promise.all([
   pool.query("SELECT COUNT(*)::int AS total FROM orders WHERE ($1::text='all' OR status=$1)",[status]),
   pool.query(`
    SELECT o.id::text AS order_id,o.status,o.created_at,o.paid_at,o.refunded_at,
      o.amount_kopecks::text,o.provider_payment_id,c.email,
      o.buyer_last_name,o.buyer_first_name,o.buyer_patronymic,
      o.buyer_phone,o.buyer_instagram,
      o.personal_data_consent_at,o.marketing_email_consent_at,o.consent_policy_version,
      COALESCE((SELECT json_agg(json_build_object('sku',i.sku,'quantity',i.quantity,
      'unitPriceKopecks',i.unit_price_kopecks::text)) FROM order_items i WHERE i.order_id=o.id),'[]'::json) AS items,
      COALESCE((SELECT array_agg(p.number ORDER BY p.number) FROM lesson_number_pool p
      WHERE p.order_id=o.id AND p.voided_at IS NULL),'{}'::int[]) AS active_numbers
    FROM orders o JOIN customers c ON c.id=o.customer_id
    WHERE ($1::text='all' OR o.status=$1)
    ORDER BY o.created_at DESC,o.id DESC LIMIT $2 OFFSET $3
   `,[status,limit,(page-1)*limit])
  ]);
  res.setHeader('Cache-Control','no-store');
  res.json({total:total.rows[0].total,page,pageSize:limit,items:result.rows});
 }catch(err){console.error('orders unavailable',err);reject(res,503,'Orders unavailable')}
});
app.get('/api/admin/catalog',adminAuth,(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.json({items:Object.entries(catalog).map(([sku,p])=>({sku,name:p.name,priceKopecks:p.price}))});
});
app.get('/api/admin/system',adminAuth,(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.json({paymentsEnabled:enabled,emailEnabled:process.env.EMAIL_ENABLED==='true',
  bankConfigured:Boolean(config.terminal&&config.password),apiConfigured:Boolean(serverOrigin),
  fiscalizationConfigured:Boolean(process.env.TBANK_TAXATION&&process.env.TBANK_ITEM_TAX),
  editableSettings:false});
});
app.get('/api/admin/email-status',adminAuth,async(req,res)=>{
 try{
  const r=await pool.query(`SELECT e.id,o.id::text AS order_id,e.state,e.attempts,
   e.sent_at,e.next_attempt_at,e.created_at
   FROM email_outbox e JOIN orders o ON o.id=e.order_id
   ORDER BY e.created_at DESC LIMIT 100`);
  res.setHeader('Cache-Control','no-store');res.json({items:r.rows});
 }catch(err){console.error('email status unavailable',err);reject(res,503,'Email status unavailable')}
});
app.get('/api/admin/analytics',adminAuth,async(req,res)=>{
 let interval;try{interval=formatPeriod(req.query.period||'month')}catch{return reject(res,400,'Invalid period')}
 const since=interval?new Date(Date.now()-({day:1,week:7,month:30}[req.query.period||'month'])*86400000):null;
 try{
  // Period filtering is applied to paid_at, including unique customer count.
  const [aggregate,series,orders]=await Promise.all([
   pool.query(`SELECT COUNT(*)::int AS paid_orders, COUNT(DISTINCT customer_id)::int AS customers,
   COALESCE(SUM(amount_kopecks),0)::bigint AS revenue,
   COALESCE(SUM((SELECT SUM(quantity) FROM order_items oi WHERE oi.order_id=o.id AND sku='video_lesson')),0)::bigint AS lessons
   FROM orders o WHERE status='paid' AND ($1::timestamptz IS NULL OR paid_at >= $1)`,[since]),
   pool.query(`SELECT TO_CHAR(paid_at AT TIME ZONE 'Europe/Moscow','YYYY-MM-DD') AS date,
   SUM(amount_kopecks)::bigint AS amount FROM orders WHERE status='paid'
   AND ($1::timestamptz IS NULL OR paid_at >= $1)
   GROUP BY 1 ORDER BY 1 DESC LIMIT 31`,[since]),
   pool.query(`SELECT o.id::text AS order_id, TO_CHAR(o.paid_at AT TIME ZONE 'Europe/Moscow','YYYY-MM-DD HH24:MI') AS paid_at,
   oi.sku AS product,oi.quantity,o.amount_kopecks
   FROM orders o JOIN order_items oi ON oi.order_id=o.id
   WHERE status='paid' AND ($1::timestamptz IS NULL OR paid_at >= $1)
   ORDER BY o.paid_at DESC LIMIT 20`,[since])
  ]);
  const a=aggregate.rows[0];
  res.setHeader('Cache-Control','no-store');
  res.json({uniquePaidCustomers:Number(a.customers),paidOrders:Number(a.paid_orders),
   soldLessons:Number(a.lessons),netRevenueKopecks:Number(a.revenue),
   dailyRevenue:series.rows.reverse().map(x=>({date:x.date,amountKopecks:Number(x.amount)})),
   orders:orders.rows.map(x=>({orderId:x.order_id,paidAt:x.paid_at,product:x.product,quantity:x.quantity,amountKopecks:Number(x.amount_kopecks)}))});
 }catch(err){console.error('analytics failed',err);reject(res,503,'Analytics unavailable')}
});

app.post('/api/orders',async(req,res)=>{
 if(!enabled)return reject(res,503,'Payments not enabled');
 if(req.headers.origin!==origin)return reject(res,403,'Forbidden origin');
 if(!config.terminal||!config.password||!serverOrigin||!process.env.TBANK_TAXATION||!process.env.TBANK_ITEM_TAX)return reject(res,503,'Payment configuration incomplete');
 let buyer=null;
 if(Array.isArray(req.body?.items)&&req.body.items[0]?.sku==='video_lesson'){
  try{
   buyer=validateCourseBuyer(req.body?.buyer);
   validateCheckoutConsents(req.body?.buyer);
  }catch(err){return reject(res,400,err.message)}
 }
 const email=buyer?.email||String(req.body?.email||'').trim().toLowerCase();
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reject(res,400,'Valid email required');
 let item;try{item=validateCart(req.body.items)}catch{return reject(res,400,'Invalid product or quantity')}
 const orderId=randomUUID();const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const customer=await client.query('INSERT INTO customers(email) VALUES($1) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id',[email]);
  await client.query('INSERT INTO orders(id,customer_id,amount_kopecks) VALUES($1,$2,$3)',[orderId,customer.rows[0].id,item.amount]);
  await client.query('INSERT INTO order_items(order_id,sku,quantity,unit_price_kopecks) VALUES($1,$2,$3,$4)',[orderId,item.sku,item.quantity,item.unitPrice]);
  if(item.sku==='video_lesson'){
   await client.query(`UPDATE orders SET buyer_last_name=$2,buyer_first_name=$3,buyer_patronymic=$4,buyer_phone=$5,buyer_instagram=$6,
      personal_data_consent_at=NOW(),marketing_email_consent_at=NOW(),
      consent_policy_version=$7 WHERE id=$1`,
    [orderId,buyer.lastName,buyer.firstName,buyer.patronymic,buyer.phone,buyer.instagram,'draft-2026-11']);
  }
  await client.query('COMMIT');
 }catch(err){await client.query('ROLLBACK');console.error('order insert failed',err);return reject(res,503,'Order unavailable')}
 finally{client.release()}
 const name=catalog[item.sku].name;
 const receipt={Email:email,Taxation:process.env.TBANK_TAXATION,Items:[{
  Name:name,Quantity:item.quantity,Price:item.unitPrice,Amount:item.amount,
  Tax:process.env.TBANK_ITEM_TAX,PaymentMethod:'full_payment',
  PaymentObject:item.sku==='video_lesson'?'service':'commodity'
 }]};
 try{
  const payload=buildInit({terminalKey:config.terminal,password:config.password,orderId,
   amount:item.amount,description:name,receipt,email,
   notificationUrl:serverOrigin+'/api/payments/tbank/notification',
   successUrl:origin+basePath+'?payment=return',failUrl:origin+basePath+'?payment=failed'});
  const payment=await initPayment(payload,config.endpoint);
  await pool.query('UPDATE orders SET provider_payment_id=$2 WHERE id=$1',[orderId,String(payment.PaymentId)]);
  res.json({orderId,paymentUrl:payment.PaymentURL});
 }catch(err){console.error('payment init failed',err);reject(res,503,'Payment provider unavailable')}
});
app.post('/api/payments/tbank/notification',async(req,res)=>{
 if(!enabled)return reject(res,503,'Payments not enabled');
 const event=req.body||{};
 if(!config.password||event.TerminalKey!==config.terminal||!validToken(event,config.password))return reject(res,403,'Invalid notification');
 const orderId=String(event.OrderId||''),paymentId=String(event.PaymentId||'');
 if(!/^[0-9a-f-]{36}$/i.test(orderId)||!paymentId||!Number.isSafeInteger(Number(event.Amount)))return reject(res,400,'Invalid payment');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const r=await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[orderId]);
  if(!r.rowCount||String(r.rows[0].provider_payment_id)!==paymentId||Number(r.rows[0].amount_kopecks)!==Number(event.Amount)){
   await client.query('ROLLBACK');return reject(res,409,'Payment/order mismatch');
  }
  await client.query('INSERT INTO payment_events(provider_payment_id,status,order_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[paymentId,String(event.Status),orderId,event]);
  if(event.Success===true&&event.Status==='CONFIRMED'&&r.rows[0].status==='pending'){
   // The bank has captured payment; allocate unique numbers before recording it paid.
   const lessons=await client.query("SELECT COALESCE(SUM(quantity),0)::integer AS quantity FROM order_items WHERE order_id=$1 AND sku='video_lesson'",[orderId]);
   if(lessons.rows[0].quantity>0)await assignLessonNumbers(client,orderId,lessons.rows[0].quantity);
   await client.query("UPDATE orders SET status='paid',paid_at=NOW() WHERE id=$1",[orderId]);
   await client.query("INSERT INTO email_outbox(order_id,kind) VALUES($1,'order_confirmation') ON CONFLICT (order_id,kind) DO NOTHING",[orderId]);
  }
  // A full REFUNDED is removed from active paid sales; partial refunds require
  // a dedicated item-level reconciliation workflow before live launch.
  if(event.Success===true&&event.Status==='REFUNDED'&&r.rows[0].status==='paid'){
   await client.query("UPDATE orders SET status='refunded',refunded_at=NOW() WHERE id=$1",[orderId]);
   await voidLessonNumbers(client,orderId);
  }
  await client.query('COMMIT');
  res.type('text/plain').send('OK');
 }catch(err){await client.query('ROLLBACK');console.error('webhook failed',err);reject(res,503,'Temporary processing error')}
 finally{client.release()}
});
const port=Number(process.env.PORT)||3002;
app.listen(port,'127.0.0.1',()=>console.log('ARTEMS CARBON API listening on localhost:'+port+'; payments '+(enabled?'enabled':'disabled')));
