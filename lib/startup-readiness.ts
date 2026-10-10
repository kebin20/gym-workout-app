// Keep startup detection independent of visible labels and accessible wording.
export const startupLoggerSelector = 'input[data-startup-logger]';

export function observeWorkoutLoggerReady(onReady: () => void): () => void {
  let frame: number | undefined;
  let cancelled = false;
  let ready = false;
  const check = () => {
    const input = document.querySelector(startupLoggerSelector);
    if (
      cancelled ||
      ready ||
      !input ||
      input.matches(':disabled') ||
      frame !== undefined
    )
      return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (cancelled) return;
      const current = document.querySelector(startupLoggerSelector);
      if (!current || current.matches(':disabled')) return;
      ready = true;
      observer.disconnect();
      onReady();
    });
  };
  const observer = new MutationObserver(check);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  check();
  return () => {
    cancelled = true;
    observer.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}
