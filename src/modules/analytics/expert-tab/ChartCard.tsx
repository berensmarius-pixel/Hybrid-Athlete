"use client";

import { useRef, useState, type ReactNode } from "react";
import { ImageDown, FileDown, Loader2 } from "lucide-react";
import {
  downloadCsv,
  exportElementToPng,
} from "./engine/export";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  badge?: ReactNode;
  /** CSV-Zeilen für den Datenexport (optional). */
  csvRows?(): Array<Record<string, string | number | null | undefined>>;
  csvFilename?: string;
  pngFilename?: string;
  children: ReactNode;
}

/**
 * Glassmorphism-Container der Performance-Lab-Karten:
 * dunkles Glas-Panel, Titelzeile mit Icon/Badge und Quick-Export
 * (PNG des Chart-SVGs / CSV der Rohdaten).
 */
export default function ChartCard({
  title,
  subtitle,
  icon,
  badge,
  csvRows,
  csvFilename = "export",
  pngFilename = "chart",
  children,
}: ChartCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"png" | "csv" | null>(null);

  async function handlePng() {
    if (!cardRef.current || busy) return;
    setBusy("png");
    try {
      await exportElementToPng(cardRef.current, pngFilename);
    } catch {}
    setBusy(null);
  }

  function handleCsv() {
    if (!csvRows || busy) return;
    setBusy("csv");
    try {
      downloadCsv(csvRows(), `${csvFilename}-${new Date().toISOString().slice(0, 10)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      ref={cardRef}
      className="glass-card rounded-3xl p-4 sm:p-5 border border-white/[0.07] shadow-lg shadow-black/20 space-y-3 min-w-0"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-zinc-100 truncate">{title}</h3>
            {subtitle && (
              <p className="text-[11px] text-zinc-500 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {badge}
          <button
            onClick={handlePng}
            title="Als PNG exportieren"
            className="p-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors cursor-pointer"
          >
            {busy === "png" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ImageDown size={13} />
            )}
          </button>
          {csvRows && (
            <button
              onClick={handleCsv}
              title="Daten als CSV exportieren"
              className="p-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-zinc-400 hover:text-emerald-300 hover:border-emerald-500/40 transition-colors cursor-pointer"
            >
              {busy === "csv" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <FileDown size={13} />
              )}
            </button>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}

/** Segmentierte Umschalt-Gruppe (z. B. W ⇄ W/kg, Zeiträume). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange(value: T): void;
}) {
  return (
    <div className="inline-flex glass-panel rounded-xl p-0.5 border border-white/10">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={
            "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap " +
            (value === opt.value
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-md shadow-cyan-500/25"
              : "text-zinc-400 hover:text-zinc-200")
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Leerzustand-Box für Karten ohne verwertbare Daten. */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-48 flex flex-col items-center justify-center gap-2 text-center px-6">
      <div className="w-10 h-10 rounded-full bg-zinc-800/80 border border-white/5 flex items-center justify-center text-zinc-600">
        <span className="text-lg">∅</span>
      </div>
      <p className="text-xs text-zinc-500 max-w-[260px] leading-relaxed">{message}</p>
    </div>
  );
}
