"use client";

import { useMemo, useState } from "react";
import {
  X,
  Activity,
  Check,
  AlertTriangle,
  Info,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BIOMARKER_FIELDS,
  evaluateBiomarkers,
} from "@/lib/nutrition/micro-calculator";
import type { BiomarkerEntry, BiomarkerFlag } from "@/lib/nutrition/micro-calculator";
import { todayDateString, useBiomarkers } from "./useMicronutrientModule";

interface BiomarkerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FieldKey = (typeof BIOMARKER_FIELDS)[number]["key"];

const EMPTY_VALUES: Record<FieldKey, string> = {
  ferritinNgMl: "",
  vitaminDNgMl: "",
  testosteroneNgDl: "",
};

function parseOptional(value: string): number | undefined {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export default function BiomarkerModal({ isOpen, onClose }: BiomarkerModalProps) {
  const { saveBiomarker } = useBiomarkers();

  const [date, setDate] = useState<string>(todayDateString());
  const [values, setValues] = useState<Record<FieldKey, string>>({ ...EMPTY_VALUES });
  const [notes, setNotes] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Das Modal wird vom Parent nur bei Bedarf gemountet – State startet frisch.

  const draft: BiomarkerEntry = useMemo(
    () => ({
      id: "draft",
      date,
      ferritinNgMl: parseOptional(values.ferritinNgMl),
      vitaminDNgMl: parseOptional(values.vitaminDNgMl),
      testosteroneNgDl: parseOptional(values.testosteroneNgDl),
    }),
    [date, values]
  );

  const flags: BiomarkerFlag[] = useMemo(() => evaluateBiomarkers(draft), [draft]);
  const hasAnyValue = BIOMARKER_FIELDS.some((f) => values[f.key].trim());

  if (!isOpen) return null;

  const handleSave = () => {
    saveBiomarker({
      date,
      ferritinNgMl: draft.ferritinNgMl,
      vitaminDNgMl: draft.vitaminDNgMl,
      testosteroneNgDl: draft.testosteroneNgDl,
      notes: notes.trim() || undefined,
    });
    setSavedSuccess(true);
    setTimeout(onClose, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col max-h-[92vh] shadow-2xl overflow-hidden glass-panel"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 font-mono tracking-tight">
                BLUTWERTE LOGGEN
              </h2>
              <p className="text-xs text-zinc-400">
                Lab-Werte vom Arztblatt eintragen (alle Felder optional)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Datum */}
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={13} className="text-zinc-500" />
              Untersuchungsdatum
            </span>
            <input
              type="date"
              value={date}
              max={todayDateString()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-rose-500/50 outline-none text-sm font-mono text-zinc-100 transition-colors"
            />
          </label>

          {/* Biomarker Inputs */}
          {BIOMARKER_FIELDS.map((field) => (
            <label key={field.key} className="block space-y-1.5">
              <span className="flex items-baseline justify-between">
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  {field.label}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">{field.unit}</span>
              </span>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="—"
                value={values[field.key]}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-rose-500/50 outline-none text-sm font-mono font-bold text-zinc-100 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="block text-[10px] text-zinc-500">{field.hint}</span>
            </label>
          ))}

          {/* Notiz */}
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Notiz (optional)
            </span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="z. B. nüchtern gemessen, nach Infekt …"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-rose-500/50 outline-none text-xs text-zinc-200 resize-none transition-colors"
            />
          </label>

          {/* Live-Bewertung */}
          {hasAnyValue && (
            <div className="space-y-2">
              {flags.length > 0 ? (
                flags.map((flag, i) => (
                  <div
                    key={i}
                    className={cn(
                      "p-3 rounded-2xl border flex items-start gap-2.5",
                      flag.level === "critical" &&
                        "bg-rose-500/10 border-rose-500/30 text-rose-300",
                      flag.level === "warning" &&
                        "bg-amber-500/10 border-amber-500/30 text-amber-300",
                      flag.level === "info" &&
                        "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                    )}
                  >
                    {flag.level === "info" ? (
                      <Info size={16} className="shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold block">{flag.title}</span>
                      <span className="text-[11px] leading-relaxed opacity-90 block">
                        {flag.message}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-start gap-2.5">
                  <Check size={16} className="shrink-0 mt-0.5" />
                  <span className="text-[11px] leading-relaxed">
                    Alle eingetragenen Werte liegen im optimalen Bereich für Athleten.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-zinc-900/90 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasAnyValue || !date}
            className={cn(
              "flex-2 py-3 px-4 rounded-2xl font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95",
              savedSuccess
                ? "bg-emerald-500 text-zinc-950"
                : "bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-400 hover:to-red-400 text-white shadow-rose-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            )}
          >
            {savedSuccess ? (
              <>
                <Check size={16} />
                <span>Gespeichert!</span>
              </>
            ) : (
              <>
                <Activity size={16} />
                <span>Blutwerte speichern</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
