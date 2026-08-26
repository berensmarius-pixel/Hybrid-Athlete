"use client";

/**
 * Aerobic Efficiency & Decoupling Tracker:
 *
 * Streudiagramm des Efficiency Factors (EF = Power ÷ HF) über
 * steady-state Zone-2-Rides. Grüner Ring = Pw:Hr-Decoupling unter 5 %
 * → starke aerobe Basis-Adaptation.
 *
 * Decoupling benötigt echte Telemetrie: für die jüngsten Kandidaten werden
 * die Garmin-Activity-Details nachgeladen (Best-Effort, mit Fallback auf
 * reine Summary-EF-Punkte ohne Markierung).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import { HeartPulse, RefreshCw } from "lucide-react";
import type { GarminActivity } from "@/types";
import {
  buildEfficiencyPoints,
  computeAerobicDecoupling,
  linearTrend,
  selectSteadyZone2Rides,
  DECOUPLING_THRESHOLD_PCT,
  type EfficiencyPoint,
} from "./engine/efficiency";
import { powerSeriesFromDetails } from "@/lib/analytics/benchmark-detector";
import ChartCard, { EmptyState } from "./ChartCard";

const COLORS = {
  adapted: "#34d399",
  drifting: "#fbbf24",
  unknown: "#52525b",
  trend: "#22d3ee",
} as const;

/** Wie viele Rides maximal per Deep-Scan mit Telemetrie angereichert werden. */
const DEEP_SCAN_LIMIT = 6;

interface EfChartPoint extends EfficiencyPoint {
  /** Trendlinie (nur an erstem/letztem Punkt gesetzt). */
  trend?: number;
}

function EfTooltip({ active, payload }: TooltipContentProps) {
  const row = active
    ? (payload?.[0]?.payload as EfChartPoint | undefined)
    : undefined;
  if (!row) return null;

  const dec = row.decouplingPct;
  const decColor =
    dec === null || dec === undefined
      ? undefined
      : dec < DECOUPLING_THRESHOLD_PCT
        ? COLORS.adapted
        : COLORS.drifting;

  return (
    <div className="glass-panel rounded-xl border border-white/15 px-3 py-2 text-[11px] shadow-xl shadow-black/40 space-y-1 min-w-[190px]">
      <div className="font-bold text-zinc-200 truncate max-w-[220px]">{row.name}</div>
      <div className="text-zinc-500">
        {new Date(row.dateISO).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        })}{" "}
        · {Math.round(row.durationSeconds / 60)} min
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-cyan-300 font-semibold">EF</span>
        <span className="font-mono text-zinc-100">{row.ef.toFixed(3)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-zinc-500">Ø Power / Ø HF</span>
        <span className="font-mono text-zinc-400">
          {row.avgPowerWatts} W · {row.avgHeartRate} bpm
        </span>
      </div>
      <div className="flex justify-between gap-4 border-t border-white/10 pt-1">
        <span className="text-zinc-500">Pw:Hr-Decoupling</span>
        {dec === null || dec === undefined ? (
          <span className="text-zinc-600">n/a</span>
        ) : (
          <span className="font-mono font-bold" style={{ color: decColor }}>
            {dec.toFixed(1)} %
          </span>
        )}
      </div>
      {dec !== null && dec !== undefined && (
        <div className="text-[10px] font-bold" style={{ color: decColor }}>
          {dec < DECOUPLING_THRESHOLD_PCT
            ? "Stabile aerobe Basis (< 5 %)"
            : "Kardiale Drift > 5 %"}
        </div>
      )}
    </div>
  );
}

/** Scatter-Dot mit Adaptions-Marker (grüner Ring bei Decoupling < 5 %). */
function CustomScatterDot(props: {
  cx?: number;
  cy?: number;
  payload?: EfChartPoint;
}) {
  const { cx, cy, payload } = props;
  if (typeof cx !== "number" || typeof cy !== "number" || !payload) return null;

  const dec = payload.decouplingPct;
  const adapted = dec !== null && dec !== undefined && dec < DECOUPLING_THRESHOLD_PCT;
  const fill =
    dec === null || dec === undefined
      ? COLORS.unknown
      : adapted
        ? COLORS.adapted
        : COLORS.drifting;

  return (
    <g>
      {adapted && (
        <circle
          cx={cx}
          cy={cy}
          r={10}
          fill={COLORS.adapted}
          fillOpacity={0.12}
          stroke={COLORS.adapted}
          strokeOpacity={0.55}
          strokeWidth={1}
        />
      )}
      <circle cx={cx} cy={cy} r={4.5} fill={fill} stroke="#09090b" strokeWidth={1.2} />
    </g>
  );
}

export interface AerobicEfficiencyChartProps {
  activities: GarminActivity[];
  ftpWatts: number;
}

export default function AerobicEfficiencyChart({
  activities,
  ftpWatts,
}: AerobicEfficiencyChartProps) {
  const [deepScanTick, setDeepScanTick] = useState(0);
  const [scanBusy, setScanBusy] = useState(false);
  const [decouplingById, setDecouplingById] = useState<Record<string, number | null>>({});

  // ── Z2-Kandidaten + EF-Basispunkte ─────────────────────────────────────────
  const basePoints = useMemo(
    () => buildEfficiencyPoints(selectSteadyZone2Rides(activities, ftpWatts)),
    [activities, ftpWatts]
  );

  // ── Deep Scan: echte Pw:Hr-Decoupling-Werte nachladen ──────────────────────
  const scanSeqRef = useRef(0);
  useEffect(() => {
    if (basePoints.length === 0) return;
    const candidates = basePoints.slice(-DEEP_SCAN_LIMIT);

    const seq = ++scanSeqRef.current;
    let cancelled = false;

    (async () => {
      setScanBusy(true);
      for (const point of candidates) {
        if (cancelled || seq !== scanSeqRef.current) return;

        let result: number | null = null;
        const activity = activities.find((a) => a.id === point.activityId);
        const garminId = activity?.garminId;
        if (garminId && /^\d{1,20}$/.test(garminId)) {
          try {
            const res = await fetch(
              `/api/garmin/activity-details?id=${encodeURIComponent(garminId)}`
            );
            if (res.ok) {
              const details = await res.json();
              const power = powerSeriesFromDetails(details);
              const hr: unknown = details?.series?.heartRate ?? details?.series?.hr;
              if (power && Array.isArray(hr)) {
                result = computeAerobicDecoupling(power.watts, hr as number[]);
              }
            }
          } catch {
            /* offline / nicht verbunden */
          }
        }

        if (cancelled || seq !== scanSeqRef.current) return;
        setDecouplingById((prev) => ({ ...prev, [point.activityId]: result }));
      }

      if (!cancelled && seq === scanSeqRef.current) setScanBusy(false);
    })();

    return () => {
      cancelled = true;
    };
    // deepScanTick erzwingt Re-Scan auf Nutzeranforderung
  }, [basePoints, activities, deepScanTick]);

  // ── Chart-Daten + Trend ────────────────────────────────────────────────────
  const chartData = useMemo<EfChartPoint[]>(() => {
    const points = basePoints.map((p) => ({
      ...p,
      decouplingPct:
        p.decouplingPct ??
        (p.activityId in decouplingById ? decouplingById[p.activityId] : undefined),
    }));

    const trend = linearTrend(points.map((p) => ({ x: p.timestamp, y: p.ef })));
    return points.map((p, i) => ({
      ...p,
      trend:
        trend && (i === 0 || i === points.length - 1)
          ? Math.round((trend.slope * p.timestamp + trend.intercept) * 1000) / 1000
          : undefined,
    }));
  }, [basePoints, decouplingById]);

  const efValues = chartData.map((p) => p.ef);
  const efDomain: [number, number] =
    efValues.length > 0
      ? [
          Math.floor(Math.min(...efValues) * 100) / 100 - 0.05,
          Math.ceil(Math.max(...efValues) * 100) / 100 + 0.05,
        ]
      : [0, 1];

  const first = chartData[0];
  const last = chartData.at(-1);
  const adaptedCount = chartData.filter(
    (p) =>
      p.decouplingPct !== null &&
      p.decouplingPct !== undefined &&
      p.decouplingPct < DECOUPLING_THRESHOLD_PCT
  ).length;
  const deltaEfPct =
    first && last && first.timestamp !== last.timestamp
      ? Math.round(((last.ef - first.ef) / first.ef) * 1000) / 10
      : null;

  function handleRescan() {
    setDecouplingById({});
    setDeepScanTick((t) => t + 1);
  }

  return (
    <ChartCard
      title="Aerobic Efficiency (EF)"
      subtitle="Power ÷ HF · steady Zone 2 (56–75 % FTP)"
      icon={<HeartPulse size={16} />}
      badge={
        deltaEfPct !== null ? (
          <span
            className={
              "px-2 py-0.5 rounded-full text-[9px] font-bold border " +
              (deltaEfPct >= 0
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                : "bg-amber-500/10 text-amber-300 border-amber-500/25")
            }
          >
            ΔEF {deltaEfPct > 0 ? "+" : ""}
            {deltaEfPct} %
          </span>
        ) : null
      }
      csvRows={
        chartData.length > 0
          ? () =>
              chartData.map((p) => ({
                Datum: p.dateISO.slice(0, 10),
                Name: p.name,
                EF: p.ef,
                AvgPower_W: p.avgPowerWatts,
                AvgHF_bpm: p.avgHeartRate,
                Minuten: Math.round(p.durationSeconds / 60),
                Decoupling_PwHr_Prozent:
                  p.decouplingPct === null || p.decouplingPct === undefined
                    ? ""
                    : p.decouplingPct,
              }))
          : undefined
      }
      csvFilename="aerobic-efficiency"
      pngFilename="aerobic-efficiency-chart"
    >
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleRescan}
          disabled={scanBusy}
          title="Decoupling-Analyse aus der Telemetrie neu ausführen"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-[10px] font-bold text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
        >
          <RefreshCw size={11} className={scanBusy ? "animate-spin" : ""} />
          {scanBusy ? "Deep Scan läuft…" : "Deep Scan"}
        </button>
      </div>

      {chartData.length === 0 ? (
        <EmptyState message="Keine steady Zone-2-Rides gefunden (≥ 45 min bei 56–75 % FTP mit Power & HF)." />
      ) : (
        <>
          <div className="h-[240px] sm:h-[260px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 14, right: 8, bottom: 0, left: 8 }}
              >
                <CartesianGrid stroke="#ffffff10" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v: number) =>
                    new Date(v).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                    })
                  }
                  tick={{ fill: "#71717a", fontSize: 9 }}
                  stroke="#3f3f46"
                  tickMargin={6}
                  minTickGap={40}
                />
                <YAxis
                  domain={efDomain}
                  width={44}
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  stroke="#3f3f46"
                  tickCount={5}
                  tickFormatter={(v: number) => v.toFixed(2)}
                />
                <Tooltip content={EfTooltip} cursor={{ stroke: "#ffffff18" }} />

                {/* EF-Trend */}
                <Line
                  type="linear"
                  dataKey="trend"
                  stroke={COLORS.trend}
                  strokeWidth={1.6}
                  strokeDasharray="6 5"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />

                {/* EF-Punkte inkl. Adaptions-Marker */}
                <Scatter dataKey="ef" shape={CustomScatterDot} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <MiniStat label="Rides" value={String(chartData.length)} />
            <MiniStat
              label="Adaptiert (<5%)"
              value={`${adaptedCount}/${chartData.length}`}
              color={COLORS.adapted}
            />
            <MiniStat
              label="Letzter EF"
              value={last ? last.ef.toFixed(2) : "–"}
              highlight
            />
          </div>

          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Grüner Ring = Pw:Hr-Decoupling unter {DECOUPLING_THRESHOLD_PCT} % in
            dieser Einheit → stabile aerobe Basis. Steigender Cyan-Trend =
            wachsende Ökonomie. Punkte ohne Ring: keine Telemetrie geladen.
          </p>
        </>
      )}
    </ChartCard>
  );
}

function MiniStat({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-zinc-600 font-bold">
        {label}
      </div>
      <div
        className={
          "text-sm font-black font-mono " +
          (color ? "" : highlight ? "text-cyan-300" : "text-zinc-200")
        }
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
