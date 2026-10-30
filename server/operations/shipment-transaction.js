// Some Firestore contention failures arrive as INVALID_ARGUMENT on a closed
// transaction instead of ABORTED. Restart only that specific failed transaction.
// The shipment ID and its committed state remain the idempotency boundary.
export async function shipmentTransaction(db,update){
 for(let attempt=0;;attempt++){
  try{return await db.runTransaction(update)}catch(error){
   if(attempt>=2||Number(error.code)!==3||!/transaction is invalid or closed/i.test(error.message||''))throw error;
  }
 }
}
