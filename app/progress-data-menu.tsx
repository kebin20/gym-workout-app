'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from 'react';
import { ChevronDown, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ProgressDataMenuProps = {
  activePhase: number;
  loadingImport: boolean;
  importingSheet: boolean;
  loading: boolean;
  syncingSheet: boolean;
  backupBusy: boolean;
  previewGoogleSheetImport: () => void;
  syncGoogleSheet: () => void;
  downloadBackup: () => void;
  onRestoreBackup: () => void;
  onStartupDetails?: () => void;
  onDeviceRecovery?: () => void;
  onProgrammes?: () => void;
  sheetAvailable?: boolean;
};

export type ProgressDataPopupProps = ProgressDataMenuProps & {
  open: boolean;
  menuId: string;
  triggerId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  initialItem: 'first' | 'last';
  onOpenChange: (open: boolean) => void;
};

type DataPopup = ComponentType<ProgressDataPopupProps>;
let popupRequest: Promise<DataPopup> | null = null;

function loadDataPopup() {
  // A failed prefetch must be retryable without reloading the whole app.
  popupRequest ??= import('./progress-data-menu-popup')
    .then((module) => module.default)
    .catch((error) => {
      popupRequest = null;
      throw error;
    });
  return popupRequest;
}

export default function ProgressDataMenu(props: ProgressDataMenuProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const requesting = useRef(false);
  const pendingOpen = useRef(false);
  const [Popup, setPopup] = useState<DataPopup | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingTools, setLoadingTools] = useState(false);
  const [opening, setOpening] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [initialItem, setInitialItem] = useState<'first' | 'last'>('first');

  useEffect(() => {
    mounted.current = true;
    const cancelPendingOpen = () => {
      pendingOpen.current = false;
      setOpening(false);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelPendingOpen();
    };
    window.addEventListener('blur', cancelPendingOpen);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mounted.current = false;
      pendingOpen.current = false;
      window.removeEventListener('blur', cancelPendingOpen);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  function prepareTools() {
    if (Popup || requesting.current) return;
    requesting.current = true;
    setLoadingTools(true);
    void loadDataPopup().then(
      (Component) => {
        requesting.current = false;
        if (!mounted.current) return;
        setPopup(() => Component);
        setLoadingTools(false);
        setOpening(false);
        setLoadFailed(false);
        // Hover/focus may prefetch, but only a still-focused activation opens.
        // In particular, finishing a download after blur must not steal focus.
        if (
          pendingOpen.current &&
          document.activeElement === triggerRef.current &&
          document.visibilityState !== 'hidden'
        )
          setOpen(true);
        pendingOpen.current = false;
      },
      () => {
        requesting.current = false;
        if (!mounted.current) return;
        setLoadingTools(false);
        setOpening(false);
        setLoadFailed(pendingOpen.current);
        pendingOpen.current = false;
      },
    );
  }

  function activate(item: 'first' | 'last' = 'first') {
    setInitialItem(item);
    setLoadFailed(false);
    // iOS does not consistently focus buttons on touch activation.
    triggerRef.current?.focus({ preventScroll: true });
    if (Popup) setOpen(true);
    else {
      pendingOpen.current = true;
      setOpening(true);
      prepareTools();
    }
  }

  const status = props.loadingImport
    ? 'Checking Google Sheet…'
    : props.importingSheet
      ? 'Importing Google Sheet…'
      : props.syncingSheet
        ? 'Sending to Google Sheet…'
        : props.backupBusy
          ? 'Preparing backup…'
          : loadFailed
            ? 'Data tools couldn’t load. Select Data to retry.'
            : loadingTools && opening
              ? 'Loading data tools…'
              : '';
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        ref={triggerRef}
        id={`${id}-trigger`}
        type="button"
        variant="outline"
        className="h-11 font-sans"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={opening || undefined}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-describedby={loadFailed ? `${id}-status` : undefined}
        onPointerEnter={prepareTools}
        onFocus={prepareTools}
        onBlur={() => {
          pendingOpen.current = false;
          setOpening(false);
        }}
        onClick={() => {
          if (open || pendingOpen.current) {
            pendingOpen.current = false;
            setOpening(false);
            setOpen(false);
          } else activate();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            activate(event.key === 'ArrowUp' ? 'last' : 'first');
          } else if (event.key === 'Escape') {
            event.preventDefault();
            pendingOpen.current = false;
            setOpening(false);
            setOpen(false);
          }
        }}
      >
        <Database /> Data <ChevronDown />
      </Button>
      {Popup && (
        <Popup
          {...props}
          open={open}
          menuId={`${id}-menu`}
          triggerId={`${id}-trigger`}
          triggerRef={triggerRef}
          initialItem={initialItem}
          onOpenChange={setOpen}
        />
      )}
      <p
        id={`${id}-status`}
        role="status"
        className="text-sm text-muted-foreground"
      >
        {status}
      </p>
    </div>
  );
}
