import pg from 'pg';
import {getPaymentState} from './tbank.js';

// Only these explicit, final bank statuses authorize release. A timeout,
// payment in progress, wrong identifier, or missing PaymentId never does.
const RELEASEABLE=new Set(['CANCELED','REJECTED']);
const limit=Number(process.env.RECONCILIATION_BATCH_SIZE)||20;

export function isSafeTerminalBankState(state,order,terminalKey){
 return state?.Success===true &&
    RELEASEABLE.has(state.Status) &&
    String(state.PaymentId)===String(order.provider_payment_id) &&
    String(state.OrderId)===String(order.id) &&
    Number.isSafeInteger(Number(state.Amount)) &&
    Number(state.Amount)===Number(order.amount_kopecks) &&
    state.TerminalKey===terminalKey;
}

// Take local locks in the same order as /api/payments/tbank/notification:
// order row lock, then pool advisory lock. This prevents double allocation.
export async function releaseReconciledReservation(client,order,state,terminalKey){
 if(!isSafeTerminalBankState(state,order,terminalKey))return {released:0,reason:'bank_state_not_safe'};
 await client.query('BEGIN');
 try{
  const current=await client.query('SELECT id,status,provider_payment_id,amount_kopecks FROM orders WHERE id=$1 FOR UPDATE',[order.id]);
  if(current.rowCount!==1||current.rows[0].status!=='pending'||
      String(current.rows[0].provider_payment_id)!==String(order.provider_payment_id)||
      Number(current.rows[0].amount_kopecks)!==Number(order.amount_kopecks)){
   await client.query('ROLLBACK');
   return {released:0,reason:'local_order_changed'};
  }
  await client.query('SELECT pg_advisory_xact_lock(9500, 2026)');
  const expected=await client.query(
   "SELECT COALESCE(SUM(quantity),0)::integer AS quantity FROM order_items WHERE order_id=$1 AND sku='video_lesson'",
   [order.id]);
  const quantity=Number(expected.rows[0]?.quantity||0);
  const held=await client.query(
   'SELECT number FROM lesson_number_pool WHERE reserved_order_id=$1 AND order_id IS NULL FOR UPDATE',
   [order.id]);
  if(quantity<1||quantity>100||held.rowCount!==quantity){
   await client.query('ROLLBACK');
   return {released:0,reason:'reservation_inconsistent'};
  }
  const released=await client.query(
   `UPDATE lesson_number_pool SET reserved_order_id=NULL,reserved_at=NULL,reservation_expires_at=NULL
    WHERE reserved_order_id=$1 AND order_id IS NULL RETURNING number`,[order.id]);
  if(released.rowCount!==quantity)throw new Error('Reservation release count conflict');
  const changed=await client.query("UPDATE orders SET status='cancelled' WHERE id=$1 AND status='pending' RETURNING id",[order.id]);
  if(changed.rowCount!==1)throw new Error('Order status race');
  await client.query(
   `INSERT INTO lesson_reservation_release_audit(order_id,provider_payment_id,bank_status,released_quantity)
    VALUES($1,$2,$3,$4)`,
   [order.id,String(order.provider_payment_id),state.Status,quantity]);
  await client.query('COMMIT');
  return {released:quantity,reason:'released'};
 }catch(error){
  await client.query('ROLLBACK');
  throw error;
 }
}

export async function reconcileReservations({pool,terminalKey,password,endpoint,fetcher,logger=console}){
 if(!terminalKey||!password||!endpoint)throw new Error('Bank reconciliation is not configured');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid batch size');
 // Only orders with a confirmed PaymentId are eligible. Expiry is a cue
 // for inquiry, not permission to release.
 const pending=await pool.query(
  `SELECT DISTINCT o.id,o.provider_payment_id,o.amount_kopecks
   FROM orders o JOIN lesson_number_pool p ON p.reserved_order_id=o.id
   WHERE o.status='pending' AND o.provider_payment_id IS NOT NULL
     AND p.reservation_expires_at < NOW()
   ORDER BY o.id LIMIT $1`,[limit]);
 const results=[];
 for(const order of pending.rows){
  try{
   const state=await getPaymentState({
    terminalKey,password,paymentId:order.provider_payment_id,endpoint
   },fetcher);
   if(!isSafeTerminalBankState(state,order,terminalKey)){
    results.push({orderId:order.id,released:0,reason:'bank_state_not_safe'});
    continue;
   }
   const client=await pool.connect();
   try{
    const outcome=await releaseReconciledReservation(client,order,state,terminalKey);
    results.push({orderId:order.id,...outcome});
   }finally{client.release()}
  }catch(error){
   // Fail closed: retry on the next explicit invocation. Do not log
   // customer details, tokens, bank response payloads, or credentials.
   logger.error('Reservation reconciliation failed for order',order.id,error.name);
   results.push({orderId:order.id,released:0,reason:'error'});
  }
 }
 return results;
}

if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
 if(process.argv.includes('--once') && process.env.RECONCILIATION_ENABLED==='true'){
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
  try{
   const outcomes=await reconcileReservations({pool,
    terminalKey:process.env.TBANK_TERMINAL_KEY,
    password:process.env.TBANK_PASSWORD,
    endpoint:process.env.TBANK_API_URL||'https://securepay.tinkoff.ru/v2'});
   console.log('Reconciliation done:',outcomes.length,'checked,',
    outcomes.reduce((n,x)=>n+x.released,0),'serials released');
  }finally{await pool.end()}
 }else{
  console.error('Manual reconciliation disabled. Require --once and RECONCILIATION_ENABLED=true.');
  process.exitCode=2;
 }
}
