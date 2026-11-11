import pg from 'pg';
import nodemailer from 'nodemailer';
import {purchaseMessage} from './email-template.js';
const config={
 host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),
 user:process.env.SMTP_USER,password:process.env.SMTP_PASSWORD,from:process.env.SMTP_FROM,
 secure:process.env.SMTP_SECURE!=='false'
};
const enabled=process.env.EMAIL_ENABLED==='true';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
if(enabled&&(!config.host||!config.user||!config.password||!config.from))throw Error('SMTP config incomplete');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
const transporter=enabled?nodemailer.createTransport({
 host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},
 requireTLS:!config.secure,tls:{rejectUnauthorized:true}
}):null;
async function processOne(){
 const client=await pool.connect();
 let job=null;
 try{
  await client.query('BEGIN');
  const q=await client.query(`SELECT id,order_id FROM email_outbox
   WHERE ((state IN ('queued','failed') AND next_attempt_at<=NOW()) OR
          (state='sending' AND locked_at < NOW()-INTERVAL '15 minutes'))
     AND attempts<8 ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1`);
  if(!q.rowCount){await client.query('COMMIT');return false;}
  job=q.rows[0];
  await client.query(`UPDATE email_outbox SET state='sending',attempts=attempts+1,locked_at=NOW(),last_error=NULL WHERE id=$1`,[job.id]);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}
 finally{client.release()}
 try{
  const r=await pool.query(`SELECT o.id,o.status,o.amount_kopecks,c.email
   FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=$1`,[job.order_id]);
  if(!r.rowCount||r.rows[0].status!=='paid'){
   await pool.query("UPDATE email_outbox SET state='cancelled',last_error='Order not paid' WHERE id=$1",[job.id]);return true;
  }
  const details=await pool.query('SELECT sku,quantity,unit_price_kopecks FROM order_items WHERE order_id=$1',[job.order_id]);
  const message=purchaseMessage({...r.rows[0],amount_kopecks:Number(r.rows[0].amount_kopecks),
   items:details.rows.map(x=>({...x,unit_price_kopecks:Number(x.unit_price_kopecks)}))});
  // Stable Message-ID: retry-safe for clients that deduplicate, but not a
  // guarantee against duplicate delivery after a worker crash.
  message.messageId='<ac-'+job.order_id+'@'+config.from.split('@').at(-1)+'>';
  await transporter.sendMail({from:config.from,...message});
  await pool.query("UPDATE email_outbox SET state='sent',sent_at=NOW(),locked_at=NULL WHERE id=$1",[job.id]);
  console.log('Mail sent for order',job.order_id);
 }catch(e){
  const delay=Math.min(1440,2**Math.min(10,Math.max(0,Number(job.attempts)||1))*5);
  await pool.query(`UPDATE email_outbox SET state='failed',locked_at=NULL,
   last_error=$2,next_attempt_at=NOW()+($3::text||' minutes')::interval WHERE id=$1`,
   [job.id,String(e.message).slice(0,300),delay]);
  console.error('Mail failed for order',job.order_id,e.message);
 }
 return true;
}
async function run(){
 if(!enabled){console.log('Email sending disabled (EMAIL_ENABLED=false)');await pool.end();return;}
 try{
  if(process.argv.includes('--verify')){await transporter.verify();console.log('SMTP authentication and transport verified');return;}
  const single=process.argv.includes('--once');
  do{const found=await processOne();if(single||!found)break;}while(true);
 }finally{await transporter.close();await pool.end()}
}
run().catch(e=>{console.error('Mail worker failed',e);process.exitCode=1});
