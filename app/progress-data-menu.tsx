'use client';

import {
  ChevronDown,
  Database,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
};

export default function ProgressDataMenu(props: ProgressDataMenuProps) {
  const status = props.loadingImport
    ? 'Checking Google Sheet…'
    : props.importingSheet
      ? 'Importing Google Sheet…'
      : props.syncingSheet
        ? 'Sending to Google Sheet…'
        : props.backupBusy
          ? 'Preparing backup…'
          : '';
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" className="h-11 font-sans" />}
        >
          <Database /> Data <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64 max-w-[calc(100vw-2rem)] font-sans"
        >
          {props.activePhase === 1 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Google Sheet</DropdownMenuLabel>
              <DropdownMenuItem
                className="min-h-11 px-3"
                disabled={
                  props.loadingImport || props.importingSheet || props.loading
                }
                onClick={props.previewGoogleSheetImport}
              >
                <Download /> Import from Google Sheet
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11 px-3"
                disabled={props.syncingSheet || props.loading}
                onClick={props.syncGoogleSheet}
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
              onClick={props.downloadBackup}
            >
              <Download /> Download backup
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 px-3"
              disabled={props.backupBusy || props.loading}
              onClick={props.onRestoreBackup}
            >
              <Upload /> Restore backup
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
