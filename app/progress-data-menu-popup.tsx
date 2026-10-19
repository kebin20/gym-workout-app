'use client';

import { useRef } from 'react';
import { Menu } from '@base-ui/react/menu';
import {
  Database,
  Download,
  FileSpreadsheet,
  Timer,
  Upload,
} from 'lucide-react';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { ProgressDataPopupProps } from './progress-data-menu';

// Only this intent-loaded module imports Base UI's menu/floating infrastructure.
// Its supported external anchor keeps the eager button mounted and focus-stable.
export default function ProgressDataMenuPopup(props: ProgressDataPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const actionClosing = useRef(false);
  const run = (action: () => void) => () => {
    actionClosing.current = true;
    props.onOpenChange(false);
    // Restore before invoking the action, never in a later microtask that could
    // steal focus from the import/restore dialog the action has just opened.
    props.triggerRef.current?.focus({ preventScroll: true });
    action();
  };
  return (
    <Menu.Root
      open={props.open}
      modal={false}
      onOpenChange={(nextOpen, details) => {
        // This external trigger owns toggling. Do not dismiss on pointerdown
        // over it and then accidentally reopen again on the following click.
        if (
          !nextOpen &&
          details.reason === 'outside-press' &&
          details.event.target &&
          props.triggerRef.current?.contains(details.event.target as Node)
        ) {
          details.cancel();
          return;
        }
        props.onOpenChange(nextOpen);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen || !props.open) return;
        actionClosing.current = false;
        const popup = popupRef.current;
        if (!popup) return;
        const active = document.activeElement;
        // If the user already navigated an item while the open animation ran,
        // do not reset their selection (or take focus back from an outside tap).
        if (
          active &&
          active !== document.body &&
          active !== props.triggerRef.current &&
          active !== popup
        )
          return;
        const items = popup.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([aria-disabled="true"]):not([data-disabled])',
        );
        const item =
          props.initialItem === 'last' ? items?.[items.length - 1] : items?.[0];
        item?.focus({ preventScroll: true });
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          anchor={props.triggerRef}
          align="end"
          sideOffset={4}
          className="isolate z-50 outline-none"
        >
          <Menu.Popup
            ref={popupRef}
            id={props.menuId}
            aria-labelledby={props.triggerId}
            finalFocus={() => {
              if (actionClosing.current) return false;
              const active = document.activeElement;
              // Escape returns to Data, but an outside click/tab or a newly
              // opened dialog keeps the focus it has already received.
              return !active ||
                active === document.body ||
                active === props.triggerRef.current ||
                popupRef.current?.contains(active)
                ? props.triggerRef.current
                : false;
            }}
            data-slot="dropdown-menu-content"
            className="z-50 max-h-(--available-height) w-64 max-w-[calc(100vw-2rem)] min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 font-sans text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {props.activePhase === 1 && props.sheetAvailable !== false && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Google Sheet</DropdownMenuLabel>
                <DropdownMenuItem
                  className="min-h-11 px-3"
                  disabled={
                    props.loadingImport || props.importingSheet || props.loading
                  }
                  onClick={run(props.previewGoogleSheetImport)}
                >
                  <Download /> Import from Google Sheet
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11 px-3"
                  disabled={props.syncingSheet || props.loading}
                  onClick={run(props.syncGoogleSheet)}
                >
                  <FileSpreadsheet /> Send to Google Sheet
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </DropdownMenuGroup>
            )}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Backup &amp; restore</DropdownMenuLabel>
              <DropdownMenuItem
                className="min-h-11 px-3"
                disabled={props.backupBusy || props.loading}
                onClick={run(props.downloadBackup)}
              >
                <Download /> Download backup
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11 px-3"
                disabled={props.backupBusy || props.loading}
                onClick={run(props.onRestoreBackup)}
              >
                <Upload /> Restore backup
              </DropdownMenuItem>
              {props.onDeviceRecovery && (
                <DropdownMenuItem
                  className="min-h-11 px-3"
                  onClick={run(props.onDeviceRecovery)}
                >
                  <Download /> Export device recovery
                </DropdownMenuItem>
              )}
              {props.onProgrammes && (
                <DropdownMenuItem
                  className="min-h-11 px-3"
                  onClick={run(props.onProgrammes)}
                >
                  <Database /> Programme history &amp; restart
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {props.onStartupDetails && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="min-h-11 px-3"
                  onClick={run(props.onStartupDetails)}
                >
                  <Timer /> Startup details
                </DropdownMenuItem>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
