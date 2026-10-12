// Imported only when a Data action is requested. UI state stays in WorkoutApp.
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import type { WorkoutEntry } from '@/lib/workout-types';
import { hasPendingOutbox } from '@/lib/workout-outbox';
type SheetSyncResult = {
  ok: boolean;
  configured: boolean;
  synced: number;
  message?: string;
  syncedAt?: string | null;
};

export type BackupSummary = {
  workoutRecords: number;
  newWorkoutRecords: number;
  replacedWorkoutRecords: number;
  sessionChanges: number;
  newSessionChanges: number;
  bodyMeasurements?: number;
  readinessChecks?: number;
  holidayRecords?: number;
  archivedProgrammes?: number;
};

type SheetImportItem = {
  key: string;
  status: 'new' | 'unchanged' | 'protected';
  source: WorkoutEntry;
  liftlineUpdatedAt: string | null;
  sheetCompletedAt: string | null;
};

export type SheetImportPreview = {
  ok: boolean;
  items: SheetImportItem[];
  summary: { new: number; unchanged: number; protected: number };
  message?: string;
};

export type DataActionContext = {
  programmeId: string;
  getCurrentProgrammeId: () => string;
  backupData: unknown;
  selectedImportKeys: string[];
  importPreview: SheetImportPreview | null;
  exerciseDraft: { dirty: boolean };
  saving: boolean;
  programSaving: boolean;
  refreshWorkoutData: () => Promise<unknown>;
  setError: (value: string) => void;
  setNotice: (value: string) => void;
  setSyncingSheet: (value: boolean) => void;
  setImportOpen: (value: boolean) => void;
  setLoadingImport: (value: boolean) => void;
  setImportingSheet: (value: boolean) => void;
  setImportPreview: (value: SheetImportPreview | null) => void;
  setSelectedImportKeys: Dispatch<SetStateAction<string[]>>;
  setSheetImportError: (value: string) => void;
  setBackupBusy: (value: boolean) => void;
  setBackupSummary: (value: BackupSummary | null) => void;
  setBackupFileName: (value: string) => void;
  setBackupData: (value: unknown) => void;
  setBackupOpen: (value: boolean) => void;
};

export function createDataActions(context: DataActionContext) {
  const {
    programmeId,
    backupData,
    selectedImportKeys,
    importPreview,
    exerciseDraft,
    saving,
    programSaving,
    refreshWorkoutData,
    setError,
    setNotice,
    setSyncingSheet,
    setImportOpen,
    setLoadingImport,
    setImportingSheet,
    setImportPreview,
    setSelectedImportKeys,
    setSheetImportError,
    setBackupBusy,
    setBackupSummary,
    setBackupFileName,
    setBackupData,
    setBackupOpen,
  } = context;
  async function syncGoogleSheet() {
    setSyncingSheet(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/workouts/sync-sheet', {
        method: 'POST',
      });
      const result = (await response.json()) as SheetSyncResult;
      if (!response.ok || !result.ok)
        throw new Error(result.message ?? 'Unable to sync the Google Sheet.');
      await refreshWorkoutData();
      setNotice(
        `${result.synced} workout ${result.synced === 1 ? 'entry' : 'entries'} sent to Google Sheet.`,
      );
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : 'Unable to sync the Google Sheet.',
      );
    } finally {
      setSyncingSheet(false);
    }
  }

  async function previewGoogleSheetImport() {
    setImportOpen(true);
    setLoadingImport(true);
    setImportPreview(null);
    setSelectedImportKeys([]);
    setSheetImportError('');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/workouts/import-sheet');
      const result = (await response.json()) as SheetImportPreview;
      if (!response.ok || !result.ok)
        throw new Error(
          result.message ?? 'Unable to preview the Google Sheet.',
        );
      setImportPreview(result);
      setSelectedImportKeys(
        result.items
          .filter((item) => item.status === 'new')
          .map((item) => item.key),
      );
    } catch (previewError) {
      setSheetImportError(
        previewError instanceof Error
          ? previewError.message
          : 'Unable to preview the Google Sheet.',
      );
    } finally {
      setLoadingImport(false);
    }
  }

  function toggleImportItem(key: string, checked: boolean) {
    setSelectedImportKeys((current) =>
      checked
        ? [...new Set([...current, key])]
        : current.filter((currentKey) => currentKey !== key),
    );
  }

  async function importSelectedSheetEntries() {
    if (selectedImportKeys.length === 0) return;
    setImportingSheet(true);
    setSheetImportError('');
    try {
      const protectedKeys = new Set(
        importPreview?.items
          .filter((item) => item.status === 'protected')
          .map((item) => item.key) ?? [],
      );
      const response = await fetch('/api/workouts/import-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keys: selectedImportKeys,
          overwriteKeys: selectedImportKeys.filter((key) =>
            protectedKeys.has(key),
          ),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        imported?: number;
        protected?: number;
        message?: string;
      };
      if (!response.ok || !result.ok)
        throw new Error(result.message ?? 'Unable to import the Google Sheet.');

      await refreshWorkoutData();
      setImportOpen(false);
      const imported = result.imported ?? 0;
      setNotice(
        imported > 0
          ? `${imported} workout ${imported === 1 ? 'entry' : 'entries'} imported from Google Sheet`
          : 'No Liftline records needed updating.',
      );
    } catch (importError) {
      setSheetImportError(
        importError instanceof Error
          ? importError.message
          : 'Unable to import the Google Sheet.',
      );
    } finally {
      setImportingSheet(false);
    }
  }

  async function downloadBackup() {
    setBackupBusy(true);
    setError('');
    try {
      if (hasPendingOutbox(window.localStorage))
        throw new Error(
          'Sync your pending main and Holiday workouts before downloading a complete backup. Drafts saved only on this device are not included.',
        );
      const response = await fetch('/api/workouts/backup');
      if (!response.ok) throw new Error('Unable to create a Liftline backup.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `liftline-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 120000);
      setNotice(
        'Backup downloaded, including Holiday workouts. Unsaved device drafts are not included.',
      );
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : 'Unable to create a backup.',
      );
    } finally {
      setBackupBusy(false);
    }
  }

  async function previewBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBackupBusy(true);
    setBackupSummary(null);
    setBackupFileName(file.name);
    setError('');
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const response = await fetch('/api/workouts/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', backup: parsed, programmeId }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        summary?: BackupSummary;
        error?: string;
      };
      if (!response.ok || !result.ok || !result.summary)
        throw new Error(result.error ?? 'Unable to read this backup.');
      setBackupData(parsed);
      setBackupSummary(result.summary);
    } catch (backupError) {
      setBackupData(null);
      setError(
        backupError instanceof Error
          ? backupError.message
          : 'Unable to read this backup.',
      );
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreBackup() {
    if (!backupData) return;
    if (context.getCurrentProgrammeId() !== programmeId) {
      setError('The programme changed. Reload before restoring.');
      return;
    }
    if (
      hasPendingOutbox(window.localStorage) ||
      exerciseDraft.dirty ||
      saving ||
      programSaving
    ) {
      setError(
        'Sync queued saves and save or discard the current draft before restoring. Export device recovery first if a record needs review.',
      );
      return;
    }
    setBackupBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workouts/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'restore',
          backup: backupData,
          programmeId,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok)
        throw new Error(result.error ?? 'Unable to restore this backup.');
      await refreshWorkoutData();
      setBackupOpen(false);
      setBackupData(null);
      setBackupSummary(null);
      setNotice(
        'Backup restored. Existing records not included in the file were kept.',
      );
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : 'Unable to restore this backup.',
      );
    } finally {
      setBackupBusy(false);
    }
  }

  return {
    syncGoogleSheet,
    previewGoogleSheetImport,
    toggleImportItem,
    importSelectedSheetEntries,
    downloadBackup,
    previewBackupFile,
    restoreBackup,
  };
}
export type DataActionName = Exclude<
  keyof ReturnType<typeof createDataActions>,
  'toggleImportItem'
>;
