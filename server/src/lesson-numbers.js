// Serial numbers belong to PostgreSQL, never to the client.
// Reservation and payment-confirmation operations use the same advisory lock.
const QUANTITY_LIMIT = 100;
const RESERVATION_MINUTES = 30;

function validateQuantity(quantity) {
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>QUANTITY_LIMIT)
  throw new Error('Invalid lesson quantity');
}

export async function reserveLessonNumbers(client,orderId,quantity) {
 validateQuantity(quantity);
 await client.query('SELECT pg_advisory_xact_lock(9500, 2026)');
 const previouslyReserved = await client.query(
  'SELECT number FROM lesson_number_pool WHERE reserved_order_id=$1 ORDER BY number',
  [orderId]);
 if(previouslyReserved.rowCount){
  if(previouslyReserved.rowCount!==quantity)throw new Error('Reservation count conflict');
  return previouslyReserved.rows.map(row=>row.number);
 }
 const reserved = await client.query(
  `SELECT number FROM lesson_number_pool
   WHERE order_id IS NULL AND reserved_order_id IS NULL
   ORDER BY random() LIMIT $1 FOR UPDATE`,[quantity]);
 if(reserved.rowCount!==quantity)throw new Error('Lesson numbers unavailable');
 const numbers=reserved.rows.map(row=>row.number);
 const result=await client.query(
  `UPDATE lesson_number_pool SET reserved_order_id=$1,reserved_at=NOW(),
   reservation_expires_at=NOW()+($3::integer * INTERVAL '1 minute')
   WHERE number=ANY($2::int[]) AND order_id IS NULL AND reserved_order_id IS NULL
   RETURNING number`,[orderId,numbers,RESERVATION_MINUTES]);
 if(result.rowCount!==quantity)throw new Error('Concurrent reservation conflict');
 return numbers.sort((a,b)=>a-b);
}

// Confirm only a reservation already owned by the paid order.
// Late confirmations need manual reconciliation if the hold was explicitly
// released following bank cancellation; NEVER allocate new numbers post-charge.
export async function assignLessonNumbers(client,orderId,quantity){
 validateQuantity(quantity);
 await client.query('SELECT pg_advisory_xact_lock(9500, 2026)');
 const existing=await client.query(
  'SELECT number FROM lesson_number_pool WHERE order_id=$1 ORDER BY number',
  [orderId]);
 if(existing.rowCount){
  if(existing.rowCount!==quantity)throw new Error('Lesson number count conflict');
  return existing.rows.map(r=>r.number);
 }
 const reserved=await client.query(
  'SELECT number FROM lesson_number_pool WHERE reserved_order_id=$1 ORDER BY number FOR UPDATE',
  [orderId]);
 if(reserved.rowCount!==quantity)
  throw new Error('Missing reservation: bank reconciliation required');
 const numbers=reserved.rows.map(x=>x.number);
 const updated=await client.query(
  `UPDATE lesson_number_pool
   SET order_id=$1, assigned_at=NOW(), reserved_order_id=NULL,
       reserved_at=NULL, reservation_expires_at=NULL
   WHERE reserved_order_id=$1 AND order_id IS NULL
   RETURNING number`,[orderId]);
 if(updated.rowCount!==quantity)throw new Error('Reservation confirmation conflict');
 return numbers.sort((a,b)=>a-b);
}

// Refunded numbers are permanently void and are never reissued.
export async function voidLessonNumbers(client,orderId){
 await client.query('UPDATE lesson_number_pool SET voided_at=NOW() WHERE order_id=$1 AND voided_at IS NULL',[orderId]);
}
export const formatLessonNumber=n=>String(n).padStart(4,'0');
