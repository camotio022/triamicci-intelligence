// One clock per resource; never overlap slow requests or refresh hidden tabs.
export function startVisibleRefresh(refresh, {document, setInterval, clearInterval}, intervalMs = 30000) {
 let stopped = false, pending = false;
 const run = async () => {
  if (stopped || pending || document.visibilityState !== 'visible') return;
  pending = true;
  try { await refresh(); } finally { pending = false; }
 };
 const timer = setInterval(run, intervalMs);
 document.addEventListener('visibilitychange', run);
 return () => {
  stopped = true;
  clearInterval(timer);
  document.removeEventListener('visibilitychange', run);
 };
}
