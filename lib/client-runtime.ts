// Kept independent of Capacitor so the web app adds no native runtime bytes.
export function isBundledApp() {
  return (
    typeof document !== 'undefined' &&
    document
      .querySelector('meta[name="liftline-runtime"]')
      ?.getAttribute('content') === 'bundled'
  );
}
