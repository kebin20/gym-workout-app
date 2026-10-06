'use client';

import { Fragment } from 'react';
import { Apple, BookOpen, CalendarDays } from 'lucide-react';

type Destination = 'schedule' | 'nutrition' | 'guide';

export function ProgrammeToolsMenu({
  view,
  onSelect,
}: {
  view: string;
  onSelect: (destination: Destination) => void;
}) {
  return (
    <>
      <div className="-mx-1 my-1 h-px bg-border" />
      <p className="px-2 py-1 font-sans text-xs font-medium text-muted-foreground">
        Tools
      </p>
      {(
        [
          ['schedule', CalendarDays, 'Training schedule'],
          ['nutrition', Apple, 'Nutrition'],
          ['guide', BookOpen, 'Training guide'],
        ] as const
      ).map(([destination, Icon, label]) => (
        <Fragment key={destination}>
          {destination === 'guide' && (
            <div className="-mx-1 my-1 h-px bg-border" />
          )}
          <button
            type="button"
            role="menuitem"
            aria-current={view === destination ? 'page' : undefined}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left font-sans text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${view === destination ? 'bg-accent text-primary' : ''}`}
            onClick={() => onSelect(destination)}
          >
            <Icon className="size-4" /> {label}
          </button>
        </Fragment>
      ))}
    </>
  );
}
