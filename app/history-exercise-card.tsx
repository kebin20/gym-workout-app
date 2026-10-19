'use client';

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ChevronDown } from 'lucide-react';

const desktopQuery = '(min-width: 768px)';
function desktopSnapshot() {
  return (
    typeof window !== 'undefined' && window.matchMedia(desktopQuery).matches
  );
}
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const serverDesktopSnapshot = () => false;

// One subscription belongs to the Progress screen, not to every history card.
// The mobile server snapshot also makes the first hydration render identical.
export function useHistoryDesktopLayout() {
  return useSyncExternalStore(
    subscribeDesktop,
    desktopSnapshot,
    serverDesktopSnapshot,
  );
}

export default function HistoryExerciseCard({
  order,
  displayName,
  description,
  sessionCount,
  desktop,
  children,
}: {
  order: number;
  displayName: string;
  description: string;
  sessionCount: number;
  desktop: boolean;
  children: () => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasMounted, setHasMounted] = useState(desktop);
  useEffect(() => {
    if (desktop) setHasMounted(true);
  }, [desktop]);
  const shouldMount = desktop || hasMounted;
  // Never-opened mobile details do no rendering work. Once visited, retain the
  // same subtree across collapse/resize so nested week state is not lost.
  const content = useMemo(
    () => (shouldMount ? children() : null),
    [shouldMount, children],
  );
  const contentId = useId();
  const number = (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary font-sans text-xs font-bold">
      {order}
    </span>
  );

  return (
    <article className="workout-history-card flex min-w-0 flex-col rounded-xl border border-border/70 bg-card p-3 sm:p-4 md:min-h-56">
      <h3 className="md:hidden">
        <button
          type="button"
          aria-label={`${displayName} history`}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => {
            setHasMounted(true);
            setExpanded((current) => !current);
          }}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          {number}
          <span className="min-w-0 flex-1 font-sans">
            <span className="block text-sm font-semibold [overflow-wrap:anywhere] sm:text-base">
              {displayName}
            </span>
            <span className="mt-0.5 block text-sm font-normal text-muted-foreground [overflow-wrap:anywhere]">
              {description}
            </span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              {sessionCount === 0
                ? 'No logged sessions yet'
                : `${sessionCount} saved ${sessionCount === 1 ? 'session' : 'sessions'}`}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 text-muted-foreground ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      <div className="hidden items-start gap-3 md:flex">
        {number}
        <div className="min-w-0 flex-1">
          <h3 className="font-sans text-base font-semibold [overflow-wrap:anywhere]">
            {displayName}
          </h3>
          <p className="mt-0.5 font-sans text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </p>
        </div>
      </div>
      <div id={contentId} className={expanded ? 'block' : 'hidden md:block'}>
        {content}
      </div>
    </article>
  );
}
