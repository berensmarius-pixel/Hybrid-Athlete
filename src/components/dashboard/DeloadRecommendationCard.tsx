"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { usePersistentState } from "@/hooks/usePersistentState";
import { getLocalDateString } from "@/lib/utils";
import {
  applyDeloadWeek,
  detectDeloadNeed,
  DELOAD_THRESHOLDS,
} from "@/lib/coaching/deload-detector";
import type { DeloadStatus } from "@/lib/coaching/deload-detector";
import type { DailyCheckIn } from "@/types";

const CHECKINS_KEY = "hybrid_athlete_checkins";
const DELOAD_APPLIED_KEY = "hybrid_athlete_deload_applied";

function validateCheckIns(raw: unknown): DailyCheckIn[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (c): c is DailyCheckIn =>
      !!c &&
      typeof (c as DailyCheckIn).date === "string" &&
      typeof (c as DailyCheckIn).soreness === "number" &&
      typeof (c as DailyCheckIn).energy === "number"
  );
}

function validateAppliedAt(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}

const STATUS_STYLES: Record<
  Exclude<DeloadStatus, "fresh">,
  { panelBorder: string; glow: string; badgeColor: string; chipColor: string; buttonClass: string }
> = {
  watch: {
    panelBorder: "border-cyan-500/25",
    glow: "bg-cyan-500/10",
    badgeColor: "text-cyan-300 bg-cyan-500/15 border-cyan-500/30",
    chipColor: "text-cyan-200 bg-cyan-500/10 border-cyan-500/25",
    buttonClass: "from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-cyan-500/20",
  },
  deload_recommended: {
    panelBorder: "border-amber-500/25",
    glow: "bg-amber-500/10",
    badgeColor: "text-amber-300 bg-amber-500/15 border-amber-500/30",
    chipColor: "text-amber-200 bg-amber-500/10 border-amber-500/25",
    buttonClass: "from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-amber-500/20",
  },
  non_functional_overreaching: {
    panelBorder: "border-rose-500/30",
    glow: "bg-rose-500/10",
    badgeColor: "text-rose-300 bg-rose-500/15 border-rose-500/30",
    chipColor: "text-rose-200 bg-rose-500/10 border-rose-500/25",
    buttonClass: "from-rose-500 to-red-500 hover:from-rose-400 hover:to-red-400 shadow-rose-500/20",
  },
};

/** Mini-Stepper für subjektive Check-ins (0–10), speichert auf heute. */
function CheckInStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-zinc-400 min-w-[86px]">{label}</span>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/10 text-zinc-300 text-sm font-bold hover:bg-white/[0.12] active:scale-95 transition-all cursor-pointer"
        aria-label={`${label} reduzieren`}
      >
        −
      </button>
      <span className="w-6 text-center text-xs font-black text-zinc-100 font-mono">{value}</span>
      <button
        onClick={() => onChange(Math.min(10, value + 1))}
        className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/10 text-zinc-300 text-sm font-bold hover:bg-white/[0.12] active:scale-95 transition-all cursor-pointer"
        aria-label={`${label} erhöhen`}
      >
        +
      </button>
    </div>
  );
}

export default function DeloadRecommendationCard() {
  const {
    loggedSessions,
    garminHealthLogs,
    weeklyPlan,
    updateWeeklyPlan,
    gymTemplates,
    saveGymTemplate,
  } = useApp();
  const [checkIns, setCheckIns] = usePersistentState<DailyCheckIn[]>(
    CHECKINS_KEY,
    [],
    { validate: validateCheckIns }
  );
  const [deloadAppliedAt, setDeloadAppliedAt] = usePersistentState<string | null>(
    DELOAD_APPLIED_KEY,
    null,
    { validate: validateAppliedAt }
  );
  const [applying, setApplying] = useState(false);

  const detection = useMemo(
    () => detectDeloadNeed({ sessions: loggedSessions, garminHealthLogs, checkIns }),
    [loggedSessions, garminHealthLogs, checkIns]
  );

  const alreadyDeload = weeklyPlan.some((d) => d.isDeload) || deloadAppliedAt !== null;

  if (detection.status === "fresh") return null;

  const styles = STATUS_STYLES[detection.status];
  const todayKey = getLocalDateString();
  const todayCheckIn = checkIns.find((c) => c.date === todayKey);

  function upsertTodayCheckIn(field: "soreness" | "energy", next: number) {
    setCheckIns((prev) => {
      const idx = prev.findIndex((c) => c.date === todayKey);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], [field]: next };
        return updated;
      }
      return [...prev, { date: todayKey, soreness: field === "soreness" ? next : 0, energy: field === "energy" ? next : 5 }];
    });
  }

  function handleApplyDeload() {
    if (alreadyDeload || applying) return;
    setApplying(true);
    try {
      const { plan, templatesToSave } = applyDeloadWeek(weeklyPlan, gymTemplates);
      templatesToSave.forEach((t) => saveGymTemplate(t));
      updateWeeklyPlan(plan);
      setDeloadAppliedAt(new Date().toISOString());
      toast.success("Deload-Woche aktiviert", {
        description: "Vorlagen um −40 % Sätze & RPE-Cap 6–7 angepasst, Intervalle zu Z1/Z2-Erholung verschoben.",
      });
    } catch {
      toast.error("Deload konnte nicht angewendet werden.");
    } finally {
      setApplying(false);
    }
  }

  const visibleMarkers = detection.markers.filter(
    (m) => m.currentlyActive || m.longestStreakDays > 0
  );

  return (
    <div className={`p-4 sm:p-5 rounded-3xl glass-panel border ${styles.panelBorder} shadow-lg space-y-3 relative overflow-hidden`}>
      {/* Ambient Glow */}
      <div className={`absolute -top-10 -right-10 w-44 h-44 ${styles.glow} rounded-full blur-3xl pointer-events-none`} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-2 rounded-xl border shrink-0 ${styles.badgeColor}`}>
            <ShieldCheck size={16} />
          </div>
          <div className="min-w-0">
            <span className={`inline-block text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border font-mono ${styles.badgeColor}`}>
              Fatigue Sentinel · {DELOAD_THRESHOLDS.windowDays}-Tage-Analyse
            </span>
            <h4 className="text-sm sm:text-base font-bold text-zinc-100 truncate mt-0.5">
              {detection.status === "deload_recommended"
                ? "Deload Empfohlen"
                : detection.headline}
            </h4>
          </div>
        </div>

        {!alreadyDeload && (
          <button
            onClick={handleApplyDeload}
            disabled={applying}
            title="Wochenplan in eine Regenerationswoche umwandeln (−40 % Sätze, RPE ≤ 7, Rad-Intervalle → Z1/Z2)"
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-linear-to-r text-black text-xs font-bold transition-all shadow-md disabled:opacity-60 cursor-pointer active:scale-95 ${styles.buttonClass}`}
          >
            {applying ? (
              <>
                <span className="animate-spin inline-block w-3 h-3 border-2 border-black/30 border-t-black rounded-full" />
                <span>Wende an…</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                <span>Deload-Woche anwenden</span>
              </>
            )}
          </button>
        )}
        {alreadyDeload && (
          <span className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
            <CheckCircle2 size={14} />
            Deload aktiv
          </span>
        )}
      </div>

      {/* Begründung */}
      <p className="text-xs text-zinc-300 leading-relaxed relative z-10">{detection.explanation}</p>

      {detection.functionalOverreachingLikely && (
        <p className="text-[11px] text-cyan-300/90 leading-relaxed relative z-10 flex items-start gap-1.5">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>
            Muster einer <strong>funktionellen Überreichung</strong>: Die Leistungskennzahlen sinken,
            während HRV/RHR stabil bleiben – jetzt 5–7 Tage reduzieren statt komplett pausieren.
          </span>
        </p>
      )}

      {/* Marker-Chips */}
      <div className="flex flex-wrap gap-1.5 relative z-10">
        {visibleMarkers.map((m) => (
          <span
            key={m.id}
            title={m.detail}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border ${
              m.persistent ? styles.chipColor : "text-zinc-400 bg-white/[0.04] border-white/10"
            }`}
          >
            {m.label}
            {m.longestStreakDays > 0 && (
              <span className="font-mono ml-1 opacity-80">· {m.longestStreakDays}d</span>
            )}
          </span>
        ))}
      </div>

      {/* Schnell-Check-in (nur solange kein Deload läuft) */}
      {!alreadyDeload && (
        <div className="pt-1 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/5 relative z-10">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-500 font-mono w-full sm:w-auto">
            Tages-Check-in:
          </span>
          <CheckInStepper
            label="Muskelkater"
            value={todayCheckIn?.soreness ?? 0}
            onChange={(v) => upsertTodayCheckIn("soreness", v)}
          />
          <CheckInStepper
            label="Energie"
            value={todayCheckIn?.energy ?? 5}
            onChange={(v) => upsertTodayCheckIn("energy", v)}
          />
        </div>
      )}
    </div>
  );
}
