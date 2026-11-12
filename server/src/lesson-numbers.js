// Serial numbers are owned by PostgreSQL, never by the browser or email.
// This method must run inside the same SQL transaction as CONFIRMED payment.
export async function assignLessonNumbers(client,orderId,quantity){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100)throw new Error('Invalid lesson quantity');
 // Serialize allocation against other confirmed payment transactions.
 await client.query('SELECT pg_advisory_xact_lock(9500, 2026)');
 const existing=await client.query(
  'SELECT number FROM lesson_number_pool WHERE order_id=$1 ORDER BY number',
  [orderId]);
 if(existing.rowCount){
  if(existing.rowCount!==quantity)throw new Error('Lesson number count conflict');
  return existing.rows.map(r=>r.number);
 }
 const available=await client.query(
  'SELECT number FROM lesson_number_pool WHERE order_id IS NULL ORDER BY random() LIMIT $1 FOR UPDATE',
  [quantity]);
 if(available.rowCount!==quantity)throw new Error('Lesson numbers exhausted: manual payment reconciliation required');
 const numbers=available.rows.map(x=>x.number);
 const updated=await client.query(
  'UPDATE lesson_number_pool SET order_id=$1, assigned_at=NOW() WHERE number=ANY($2::int[]) AND order_id IS NULL RETURNING number',
  [orderId,numbers]);
 if(updated.rowCount!==quantity)throw new Error('Concurrent number allocation conflict');
 return numbers.sort((a,b)=>a-b);
}
export async function voidLessonNumbers(client,orderId){
 await client.query('UPDATE lesson_number_pool SET voided_at=NOW() WHERE order_id=$1 AND voided_at IS NULL',[orderId]);
}
export const formatLessonNumber=n=>String(n).padStart(4,'0');
