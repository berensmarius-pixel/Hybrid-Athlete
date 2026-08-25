"use client";

import { useRef, useState } from "react";
import { X, Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import {
  exportBackupData,
  importBackupData,
} from "@/lib/persistence/stateStore";
import { BACKUP_KEYS } from "@/lib/persistence/keys";

interface BackupModalProps {
  onClose: () => void;
}

export default function BackupModal({ onClose }: BackupModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle");

  function handleExport() {
    // Zentrale Key-Liste (korrekte Namen, vollständige Abdeckung, ohne Secrets)
    const data = exportBackupData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hybrid-athlete-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("invalid");
        }
        // Lokal schreiben UND an den Server spiegeln (Bulk-Flush nach Reload)
        importBackupData(data);
        setImportStatus("success");
        setTimeout(() => window.location.reload(), 1200);
      } catch {
        setImportStatus("error");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950">
      <div className="flex-1 flex flex-col h-full p-6 space-y-5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">Daten-Backup</h2>
          <button onClick={onClose} className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-zinc-500">
          Alle App-Daten ({BACKUP_KEYS.length} Bereiche: Plan, Sessions, Templates, Coach,
          Ernährung, Garmin, Körperdaten …) als JSON sichern oder wiederherstellen.
          Secrets wie API-Keys sind bewusst nicht enthalten.
        </p>

        {/* Export */}
        <button
          onClick={handleExport}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm transition-colors"
        >
          <Download size={17} />
          Backup exportieren
        </button>

        {/* Import */}
        <div className="space-y-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl border border-zinc-700 hover:border-zinc-500 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm transition-colors"
          >
            <Upload size={17} />
            Backup importieren
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />

          {importStatus === "success" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600/15 border border-green-600/30 text-green-400 text-sm">
              <CheckCircle2 size={15} />
              Import erfolgreich — App wird neu geladen…
            </div>
          )}
          {importStatus === "error" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600/15 border border-red-600/30 text-red-400 text-sm">
              <AlertCircle size={15} />
              Ungültige Datei — bitte eine gültige Backup-JSON wählen.
            </div>
          )}
        </div>

        <p className="text-[11px] text-zinc-600 text-center">
          Nach dem Import wird die App neu geladen und mit dem Server abgeglichen.
        </p>
      </div>
    </div>
  );
}
