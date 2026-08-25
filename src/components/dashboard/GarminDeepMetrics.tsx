"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Moon,
  Gauge,
  Footprints,
  ChevronRight,
  Battery,
  Heart,
  Wind,
  Waves,
  TrendingUp,
  Flame,
  Building2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import { motion } from "motion/react";
import { getLocalDateString, cn } from "@/lib/utils";
import type { GarminDailyHealth } from "@/types";

const GarminAnalyticsModal = dynamic(
  () => import("@/components/garmin/GarminAnalyticsModal"),
  { ssr: false }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtHM(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function statusColor(status?: string): string {
  switch (status) {
    case "productive":
    case "peaking":
      return "text-emerald-400";
    case "maintaining":
      return "text-cyan-400";
    case "recovery":
      return "text-blue-400";
    case "unproductive":
      return "text-rose-400";
    case "overreaching":
      return "text-amber-400";
    default:
      return "text-zinc-300";
  }
}

const STATUS_LABELS: Record<string, string> = {
  productive: "Produktiv",
  peaking: "Peak",
  maintaining: "Erhaltend",
  recovery: "Erholung",
  unproductive: "Unproduktiv",
  overreaching: "Überreizt",
};

/** Progress-Ring (SVG) – z.B. für Schrittziel */
function ProgressRing({
  pct,
  color,
  size = 74,
  stroke = 7,
  children,
}: {
  pct: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (clamped / 100) * c }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Balken mit Zielbereich (Zonen-Fokus) */
function TargetBar({
  label,
  dot,
  value,
  min,
  max,
  color,
}: {
  label: string;
  dot: string;
  value: number;
  min: number;
  max: number;
  color: string;
}) {
  const scaleMax = Math.max(max * 1.25, value * 1.05, 1);
  const inRange = value >= min && value <= max;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold flex items-center gap-1" style={{ color }}>
          {dot} {label}
        </span>
        <span className="font-mono text-zinc-400">
          {value} / <span className="text-zinc-600">{min}–{max}</span>
        </span>
      </div>
      <div className="relative h-2 w-full bg-black/50 rounded-full overflow-hidden">
        {/* Zielband */}
        <div
          className="absolute h-full bg-white/10 border-x border-white/20"
          style={{ left: `${(min / scaleMax) * 100}%`, width: `${((max - min) / scaleMax) * 100}%` }}
        />
        {/* Ist-Balken */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (value / scaleMax) * 100)}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className={cn("absolute h-full rounded-full", inRange ? "opacity-100" : "opacity-70")}
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

// ─── Karte 1: Schlaf-Architektur ─────────────────────────────────────────────

function SleepCard({ health }: { health: GarminDailyHealth }) {
  const deep = health.deepSleepSeconds || 0;
  const rem = health.remSleepSeconds || 0;
  const light = health.lightSleepSeconds || 0;
  const awake = health.awakeSleepSeconds || 0;
  const hasDetail = deep + rem + light > 0;
  const total = Math.max(1, deep + rem + light + awake);

  const pcts = hasDetail
    ? {
        deep: (deep / total) * 100,
        rem: (rem / total) * 100,
        light: (light / total) * 100,
        awake: Math.max(1, (awake / total) * 100),
      }
    : { deep: 18, rem: 22, light: 55, awake: 5 };

  // Garmin-Referenz: ~15-20% Tief, ~20-25% REM
  const deepOk = !hasDetail || pcts.deep >= 13;
  const remOk = !hasDetail || pcts.rem >= 17;

  return (
    <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
            <Moon size={15} />
          </div>
          <div>
            <h3 className="text-xs font-black text-zinc-100 font-mono tracking-tight">SCHLAF-ARCHITEKTUR</h3>
            <p className="text-[10px] text-zinc-500">Phasenverteilung letzte Nacht</p>
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-black font-mono text-indigo-300">{health.sleepScore}</span>
          <span className="text-[10px] text-zinc-500 font-mono">/100</span>
        </div>
      </div>

      {/* Gestapelte Phasen-Leiste */}
      <div className="h-6 w-full rounded-2xl overflow-hidden flex gap-px bg-black/60 p-1 border border-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pcts.deep}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="bg-blue-600 rounded-l-xl"
          title={`Tiefschlaf ${fmtHM(deep)} (${Math.round(pcts.deep)}%)`}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pcts.rem}%` }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="bg-purple-500"
          title={`REM ${fmtHM(rem)} (${Math.round(pcts.rem)}%)`}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pcts.light}%` }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="bg-cyan-400"
          title={`Leichtschlaf ${fmtHM(light)} (${Math.round(pcts.light)}%)`}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pcts.awake}%` }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="bg-zinc-700 rounded-r-xl"
          title={`Wach ${fmtHM(awake)}`}
        />
      </div>

      {/* Phasen-Detail */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: "Tief", val: deep, color: deepOk ? "text-blue-400" : "text-amber-400", bg: "bg-blue-500" },
          { label: "REM", val: rem, color: remOk ? "text-purple-400" : "text-amber-400", bg: "bg-purple-500" },
          { label: "Leicht", val: light, color: "text-cyan-300", bg: "bg-cyan-400" },
          { label: "Wach", val: awake, color: "text-zinc-400", bg: "bg-zinc-600" },
        ].map((p) => (
          <div key={p.label} className="p-2 rounded-xl bg-black/40 border border-white/5">
            <div className="flex items-center gap-1 text-[9px] font-bold text-zinc-500 uppercase">
              <span className={cn("w-1.5 h-1.5 rounded-full", p.bg)} />
              {p.label}
            </div>
            <span className={cn("text-[11px] font-mono font-bold block mt-0.5", p.color)}>
              {fmtHM(p.val)}
            </span>
          </div>
        ))}
      </div>

      {(health.avgSleepRespiration || health.spO2AvgPct) && (
        <div className="flex items-center gap-3 pt-1 border-t border-white/5 text-[10px] font-mono text-zinc-500">
          {health.avgSleepRespiration && (
            <span className="flex items-center gap-1">
              <Wind size={10} className="text-emerald-500" /> Atmung {health.avgSleepRespiration}/min
            </span>
          )}
          {health.spO2AvgPct && (
            <span className="flex items-center gap-1">
              <Waves size={10} className="text-sky-400" /> SpO₂ {health.spO2AvgPct}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Karte 2: Load-Tunnel & Belastungsfokus ──────────────────────────────────

function LoadCard({ health }: { health: GarminDailyHealth }) {
  const acute = health.acuteTrainingLoad || 0;
  const minT = health.minChronicLoad;
  const maxT = health.maxChronicLoad;
  const chronic = health.chronicLoad;
  const acwr = health.acwrRatio;
  const hasTunnel = minT != null && maxT != null && maxT > 0;

  const tunnelState = !hasTunnel
    ? { label: "Keine Daten", color: "text-zinc-400", hint: "Sync für Belastungsdaten ausführen." }
    : acute === 0
      ? { label: "Ruhetag", color: "text-zinc-400", hint: "Akute Last bei 0 — volle Regeneration." }
      : acute > maxT!
        ? { label: "Über Ziel", color: "text-amber-400", hint: "Akute Last über dem optimalen Tunnel." }
        : acute < minT!
          ? { label: "Unter Ziel", color: "text-blue-400", hint: "Reiz unterhalb des Optimums — steigern möglich." }
          : { label: "Im Tunnel", color: "text-emerald-400", hint: "Optimale Trainingsbelastung für Formaufbau." };

  const scaleMax = Math.max((maxT ?? acute ?? 100) * 1.35, acute * 1.15, 100);

  const focusRows =
    health.loadLowAerobic != null
      ? [
          { label: "Niedrig Aerob", dot: "🟢", value: health.loadLowAerobic, min: health.loadLowAerobicTargetMin ?? 0, max: health.loadLowAerobicTargetMax ?? 0, color: "#34d399" },
          { label: "Hoch Aerob", dot: "🟠", value: health.loadHighAerobic ?? 0, min: health.loadHighAerobicTargetMin ?? 0, max: health.loadHighAerobicTargetMax ?? 0, color: "#fb923c" },
          { label: "Anaerob", dot: "🟣", value: health.loadAnaerobic ?? 0, min: health.loadAnaerobicTargetMin ?? 0, max: health.loadAnaerobicTargetMax ?? 0, color: "#a78bfa" },
        ]
      : [];

  return (
    <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300">
            <Gauge size={15} />
          </div>
          <div>
            <h3 className="text-xs font-black text-zinc-100 font-mono tracking-tight">TRAINING LOAD</h3>
            <p className="text-[10px] text-zinc-500">7-Tage Akut vs. Chronisch (4 Wochen)</p>
          </div>
        </div>
        {health.trainingStatus && (
          <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border font-mono", statusColor(health.trainingStatus), "border-current/30")}>
            {STATUS_LABELS[health.trainingStatus] || health.trainingStatus}
          </span>
        )}
      </div>

      {/* Tunnel-Visualisierung */}
      <div className="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-cyan-300 font-bold">Akut {acute}</span>
          <span className="text-zinc-500">
            {chronic ? `Chronisch ${chronic}` : ""}
            {acwr ? ` · ACWR ${acwr.toFixed(2)}` : ""}
          </span>
        </div>
        <div className="relative h-4 w-full bg-black/60 rounded-full overflow-hidden flex border border-white/5">
          {hasTunnel && (
            <div
              className="absolute h-full bg-emerald-500/20 border-x border-emerald-500/40"
              style={{ left: `${(minT! / scaleMax) * 100}%`, width: `${((maxT! - minT!) / scaleMax) * 100}%` }}
            />
          )}
          <motion.div
            initial={{ left: 0 }}
            animate={{ left: `${Math.min(96, (acute / scaleMax) * 100)}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="absolute h-full w-1.5 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)]"
          />
        </div>
        <div className="flex items-center justify-between">
          <p className={cn("text-[10px] font-semibold", tunnelState.color)}>
            {tunnelState.label} — {tunnelState.hint}
          </p>
        </div>
      </div>

      {/* Zonen-Fokus mit Zielbändern */}
      {focusRows.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <span className="text-[9px] uppercase font-black tracking-wider text-zinc-500 block">
            Belastungsfokus (4 Wochen)
          </span>
          {focusRows.map((r) => (
            <TargetBar key={r.label} {...r} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Karte 3: Tages-Aktivität & Vitals ───────────────────────────────────────

function ActivityVitalsCard({ health }: { health: GarminDailyHealth }) {
  const steps = health.steps ?? 0;
  const goal = health.dailyStepGoal ?? 8000;
  const stepPct = goal > 0 ? (steps / goal) * 100 : 0;

  const stress = health.avgStressLevel;
  const stressPct = stress != null ? Math.min(100, stress) : null;
  const stressLabel =
    stress == null ? null : stress < 25 ? "Entspannt" : stress < 50 ? "Moderat" : stress < 75 ? "Erhöht" : "Hoch";

  const stressDist =
    health.stressDurationRestMinutes != null
      ? (() => {
          const rest = health.stressDurationRestMinutes || 0;
          const low = health.stressDurationLowMinutes || 0;
          const med = health.stressDurationMediumMinutes || 0;
          const high = health.stressDurationHighMinutes || 0;
          const total = Math.max(1, rest + low + med + high);
          return { rest: (rest / total) * 100, low: (low / total) * 100, med: (med / total) * 100, high: (high / total) * 100 };
        })()
      : null;

  return (
    <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
            <Footprints size={15} />
          </div>
          <div>
            <h3 className="text-xs font-black text-zinc-100 font-mono tracking-tight">TAGESAKTIVITÄT</h3>
            <p className="text-[10px] text-zinc-500">Schritte · Stress · Kardio-Vitals</p>
          </div>
        </div>
        {health.vo2MaxRunning && (
          <div className="text-right">
            <span className="block text-[9px] uppercase font-black text-zinc-500 font-mono">VO₂ Max</span>
            <span className="text-sm font-black font-mono text-purple-300 leading-none">{health.vo2MaxRunning}</span>
            {health.vo2MaxCycling && (
              <span className="text-[9px] text-zinc-500 font-mono block">Bike: {health.vo2MaxCycling}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 flex-nowrap">
        {/* Steps Ring */}
        <ProgressRing pct={stepPct} color="#34d399" size={88}>
          <Footprints size={14} className="text-emerald-400 mb-1" />
          <span className="text-base font-black font-mono text-zinc-100 leading-none">
            {steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : steps}
          </span>
          <span className="text-[9px] font-mono text-zinc-500 mt-0.5">von {goal >= 1000 ? `${(goal / 1000).toFixed(1)}k` : goal}</span>
        </ProgressRing>

        <div className="grid grid-cols-2 flex-1 min-w-0 gap-1.5">
          <div className="p-2 rounded-xl bg-black/40 border border-white/5 min-w-0">
            <span className="text-[9px] text-zinc-500 uppercase font-black flex items-center gap-1">
              <Building2 size={9} /> Etagen
            </span>
            <span className="text-xs font-mono font-bold text-orange-300">{health.floorsClimbed ?? "–"}</span>
          </div>
          <div className="p-2 rounded-xl bg-black/40 border border-white/5 min-w-0">
            <span className="text-[9px] text-zinc-500 uppercase font-black">Distanz</span>
            <span className="text-xs font-mono font-bold text-cyan-300">
              {health.totalDistanceMeters ? `${(health.totalDistanceMeters / 1000).toFixed(1)} km` : "–"}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-black/40 border border-white/5 min-w-0">
            <span className="text-[9px] text-zinc-500 uppercase font-black flex items-center gap-1">
              <Flame size={9} className="text-red-400" /> Aktiv
            </span>
            <span className="text-xs font-mono font-bold text-red-300">{health.activeCaloriesBurned} kcal</span>
          </div>
          <div className="p-2 rounded-xl bg-black/40 border border-white/5 min-w-0">
            <span className="text-[9px] text-zinc-500 uppercase font-black flex items-center gap-1">
              <Battery size={9} className="text-emerald-500" /> BMR
            </span>
            <span className="text-xs font-mono font-bold text-zinc-300">{health.bmrCalories ?? "–"}</span>
          </div>
        </div>
      </div>

      {/* Ruhepuls-Bereich */}
      <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
        <span className="text-[9px] text-zinc-500 uppercase font-black flex items-center gap-1">
          <Heart size={9} className="text-rose-400" /> Ruhepuls-Bereich
        </span>
        <span className="text-xs font-mono font-bold text-rose-300">
          {health.restingHeartRate} bpm
          {health.minHeartRate ? <span className="text-zinc-500 font-normal"> (Tag: {health.minHeartRate}–{health.maxHeartRate ?? "?"})</span> : null}
        </span>
      </div>

      {/* Stress-Meter */}
      {stressPct != null && (
        <div className="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-zinc-300 flex items-center gap-1">
              <TrendingUp size={11} className="text-amber-400" /> Tages-Stress
            </span>
            <span className="font-mono text-zinc-400">
              Ø {stress} {health.maxStressLevel != null && <span className="text-zinc-600">(max {health.maxStressLevel})</span>}
            </span>
          </div>
          <div className="relative h-2 w-full bg-black/60 rounded-full overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-r from-emerald-500 via-amber-500 to-rose-500 opacity-20" />
            <motion.div
              initial={{ left: 0 }}
              animate={{ left: `calc(${stressPct}% - 6px)` }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="absolute top-0 h-full w-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-amber-400">{stressLabel}</span>
            <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-500">
              <Waves size={9} className="text-sky-400" /> SpO₂ {health.spO2AvgPct ?? "–"}%
              <Wind size={9} className="text-emerald-500" /> {health.avgWakingRespiration ?? "–"}/min
            </div>
          </div>
          {/* Stress-Verteilung */}
          {stressDist && (
            <>
              <div className="h-1.5 w-full rounded-full overflow-hidden flex gap-px pt-0.5">
                <div style={{ width: `${stressDist.rest}%` }} className="bg-blue-400" title="Rest" />
                <div style={{ width: `${stressDist.low}%` }} className="bg-emerald-400" title="Niedrig" />
                <div style={{ width: `${stressDist.med}%` }} className="bg-amber-400" title="Mittel" />
                <div style={{ width: `${stressDist.high}%` }} className="bg-rose-400" title="Hoch" />
              </div>
              <div className="flex justify-between text-[8px] uppercase font-bold text-zinc-600 tracking-wider">
                <span>Rest</span><span>Niedrig</span><span>Mittel</span><span>Hoch</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Wrapper ─────────────────────────────────────────────────────────────────

export default function GarminDeepMetrics({ selectedDate }: { selectedDate?: string }) {
  const { garminHealthLogs } = useApp();
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const activeDate = selectedDate || getLocalDateString();
  const health = garminHealthLogs[activeDate] || getDefaultGarminHealth(activeDate);

  return (
    <>
      <div className="space-y-4 sm:space-y-5">
        {/* Klickbare Karten öffnen den Analytics-Hub */}
        <button onClick={() => setAnalyticsOpen(true)} className="w-full text-left cursor-pointer active:scale-[0.99] transition-transform">
          <SleepCard health={health} />
        </button>
        <button onClick={() => setAnalyticsOpen(true)} className="w-full text-left cursor-pointer active:scale-[0.99] transition-transform">
          <LoadCard health={health} />
        </button>
        <button onClick={() => setAnalyticsOpen(true)} className="w-full text-left cursor-pointer active:scale-[0.99] transition-transform">
          <ActivityVitalsCard health={health} />
        </button>

        <p className="text-[10px] text-zinc-600 text-center flex items-center justify-center gap-1">
          Quelle: Garmin Connect Sync
          {health.lastSyncedAt ? ` · ${new Date(health.lastSyncedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : ""}
          <ChevronRight size={10} />
        </p>
      </div>

      {analyticsOpen && (
        <GarminAnalyticsModal isOpen={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
      )}
    </>
  );
}
