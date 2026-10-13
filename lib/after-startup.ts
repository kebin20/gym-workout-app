// Optional work must not compete with the first usable logger frame.
export function afterStartup(task: () => void, target = window) {
  let cancelled = false;
  let idle: number | undefined;
  let timer: number | undefined;
  const run = () => {
    if (!cancelled) task();
  };
  const schedule = () => {
    target.removeEventListener('liftline:ready', schedule);
    if (typeof target.requestIdleCallback === 'function')
      idle = target.requestIdleCallback(run, { timeout: 5000 });
    else timer = target.setTimeout(run, 1000);
  };
  if (target.performance.getEntriesByName('liftline:ready').length) schedule();
  else target.addEventListener('liftline:ready', schedule, { once: true });
  return () => {
    cancelled = true;
    target.removeEventListener('liftline:ready', schedule);
    if (idle !== undefined) target.cancelIdleCallback(idle);
    if (timer !== undefined) target.clearTimeout(timer);
  };
}
