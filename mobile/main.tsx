import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { WorkoutApp } from '@/app/workout-app';
import './styles.css';

performance.mark('liftline:bundle-start');
const native = Capacitor.isNativePlatform();
createRoot(document.getElementById('root')!).render(
  native ? (
    <main className="min-h-screen bg-background px-6 py-16 font-sans text-foreground">
      <h1 className="text-2xl font-semibold">Native storage setup pending</h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        This development build is not ready for logging. The local storage or
        private cloud connection must be configured first. Your web app and its
        saved records have not changed.
      </p>
      <a
        className="mt-6 inline-block text-primary underline"
        href="https://liftline-strength-plan.ktanzyl.chatgpt.site/"
        target="_blank"
        rel="noreferrer"
      >
        Open the existing web app
      </a>
    </main>
  ) : (
    <WorkoutApp />
  ),
);

if (native) {
  // Remove this setup guard only once authoritative storage is configured and
  // tested. Never silently queue native saves to a nonexistent local /api route.
  requestAnimationFrame(() => {
    void SplashScreen.hide({ fadeOutDuration: 100 });
  });
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      // Reconcile deadline timers and any queued work on return, not by starting
      // another timer engine or remounting the logger (which would lose focus).
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    }
  });
  const observer = new PerformanceObserver((list) => {
    if (!list.getEntries().some((entry) => entry.name === 'liftline:ready'))
      return;
    observer.disconnect();
    void SplashScreen.hide({ fadeOutDuration: 100 });
  });
  observer.observe({ type: 'mark', buffered: true });
  // Always release the splash, even if storage/network access fails. The UI
  // displays its recoverable error instead of leaving an endless splash screen.
  window.setTimeout(() => {
    observer.disconnect();
    void SplashScreen.hide({ fadeOutDuration: 100 });
  }, 4000);
}
