"use client";

/**
 * Power Duration Curve (MMP) – Intervals.icu-Style.
 *
 * Drei Vergleichskurven über logarithmischer Dauer-Achse:
 *  - Solid Cyan:    letzte 42 Tage (Current Fitness)
 *  - Dashed Gray:   Saison-Peak / 365-Tage-Bestmarken
 *  - Dotted Orange: tatsächliche Mean-Max-Power der gewählten Einheit
 *
 * Umschaltbar zwischen absoluten Watt und W/kg; Tooltip zeigt
 * Watt, W/kg und % FTP je Kurve.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import LineChart from "@/components/charts/line-chart";
import { Line } from "@/components/charts/line";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { Zap } from "lucide-react";
import type { GarminActivity } from "@/types";
import {
  buildPowerDurationCurves,
  meanMaxPowerForSeries,
  percentOfFtp,
  PDC_DURATIONS_SECONDS,
  PDC_DURATION_LABELS,
  type PowerDurationPoint,
} from "./engine/powerDuration";
import ChartCard, { SegmentedControl, EmptyState } from "./ChartCard";

type PowerMode = "absolute" | "relative";

interface PdcRow extends Record<string, number | string | null | Date> {
  durationSeconds: number;
  date: Date;
  label: string;
  /** Angezeigte Werte (je nach Modus W oder W/kg). */
  current: number | null;
  season: number | null;
  workout: number | null;
  /** Absolute Watt für Tooltip (%FTP / W/kg). */
  currentW: number | null;
  seasonW: number | null;
  workoutW: number | null;
}

const COLORS = {
  current: "#22d3ee",
  season: "#a1a1aa",
  workout: "#fb923c",
} as const;



export interface PowerDurationCurveProps {
  activities: GarminActivity[];
  weightKg: number | null;
  ftpWatts: number;
}

export default function PowerDurationCurve({
  activities,
  weightKg,
  ftpWatts,
}: PowerDurationCurveProps) {
  const [mode, setMode] = useState<PowerMode>("absolute");

  // ── Auswahl der Referenz-Einheit ───────────────────────────────────────────
  const poweredActivities = useMemo(
    () =>
      activities
        .filter((a) => (a.avgPowerWatts ?? 0) > 0)
        .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))
        .slice(0, 40),
    [activities]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveId =
    selectedId ??
    poweredActivities.find((a) => a.type === "cycling")?.id ??
    poweredActivities[0]?.id ??
    null;

  const selectedActivity = useMemo(
    () => poweredActivities.find((a) => a.id === effectiveId) ?? null,
    [poweredActivities, effectiveId]
  );

  // ── Kurven aus dem Aktivitätslog + persistierten Benchmarks ────────────────
  const curves = useMemo(() => buildPowerDurationCurves(activities), [activities]);

  // ── Tatsächliche PDC der gewählten Einheit (Deep Fetch) ────────────────────
  const [workoutSeries, setWorkoutSeries] = useState<PowerDurationPoint[] | null>(null);
  const [loadingWorkout, setLoadingWorkout] = useState(false);
  const fetchSeqRef = useRef(0);

  // Sofort-Fallback: Summary-Anker (Max ≈ 1s, Avg über Gesamtdauer)
  useEffect(() => {
    setWorkoutSeries(null);
    if (!selectedActivity) return;

    const anchors = new Map<number, number>();
    if ((selectedActivity.maxPowerWatts ?? 0) > 0) {
      anchors.set(1, Math.round(selectedActivity.maxPowerWatts!));
    }
    if (
      (selectedActivity.avgPowerWatts ?? 0) > 0 &&
      selectedActivity.durationSeconds >= 20
    ) {
      const dur = Math.round(selectedActivity.durationSeconds);
      const nearest = [...PDC_DURATIONS_SECONDS].reduce((best, d) =>
        Math.abs(d - dur) < Math.abs(best - dur) ? d : best
      );
      anchors.set(nearest, Math.round(selectedActivity.avgPowerWatts!));
    }
    setWorkoutSeries(
      anchors.size > 0
        ? [...anchors.entries()].map(([durationSeconds, watts]) => ({
            durationSeconds,
            watts,
          }))
        : null
    );

    // Deep Fetch: echte Rolling-Window-MMP aus der Garmin-Telemetrie
    const garminId = selectedActivity.garminId;
    if (!garminId || !/^\d{1,20}$/.test(garminId)) return;

    const seq = ++fetchSeqRef.current;
    setLoadingWorkout(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/garmin/activity-details?id=${encodeURIComponent(garminId)}`
        );
        if (!res.ok) return;
        const details = await res.json();
        if (seq !== fetchSeqRef.current) return;

        const rawWatts: unknown = details?.series?.watts ?? details?.series?.power;
        if (!Array.isArray(rawWatts)) return;
        const clean = (rawWatts as unknown[]).filter(
          (v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0
        );
        if (clean.length < 60) return;

        const step =
          typeof details.sampleStepSeconds === "number" ? details.sampleStepSeconds : 1;
        const bests = meanMaxPowerForSeries(clean, step);
        if (bests.length > 0) {
          setWorkoutSeries(
            bests.map((b) => ({
              durationSeconds: b.durationSeconds,
              watts: b.bestWatts,
            }))
          );
        }
      } catch {
        /* offline / Garmin nicht verbunden → Summary-Fallback bleibt */
      } finally {
        if (seq === fetchSeqRef.current) setLoadingWorkout(false);
      }
    })();
  }, [selectedActivity]);

  // ── Chart-Rows je Modus bauen ──────────────────────────────────────────────
  const rows = useMemo<PdcRow[]>(() => {
    const weight = weightKg && weightKg > 0 ? weightKg : null;
    const transform = (p: PowerDurationPoint | undefined): number | null => {
      const w = p?.watts ?? null;
      if (w === null) return null;
      return mode === "absolute"
        ? w
        : weight
          ? Math.round((w / weight) * 100) / 100
          : null;
    };

    const currentByDur = new Map(curves.current.map((p) => [p.durationSeconds, p]));
    const seasonByDur = new Map(curves.season.map((p) => [p.durationSeconds, p]));
    const workoutByDur = new Map(
      (workoutSeries ?? []).map((p) => [p.durationSeconds, p])
    );

    return PDC_DURATIONS_SECONDS.map((d) => ({
      durationSeconds: d,
      date: new Date(2026, 0, 1, 0, 0, d),
      label: PDC_DURATION_LABELS[d],
      current: transform(currentByDur.get(d)),
      season: transform(seasonByDur.get(d)),
      workout: transform(workoutByDur.get(d)),
      currentW: currentByDur.get(d)?.watts ?? null,
      seasonW: seasonByDur.get(d)?.watts ?? null,
      workoutW: workoutByDur.get(d)?.watts ?? null,
    }));
  }, [curves, workoutSeries, mode, weightKg]);

  const hasAnyData = rows.some(
    (r) => r.current !== null || r.season !== null || r.workout !== null
  );

  const csvRows = () => {
    const weight = weightKg ?? 0;
    return rows.map((r) => ({
      Dauer: r.label,
      "42d_W": r.currentW ?? "",
      Saison_W: r.seasonW ?? "",
      Einheit_W: r.workoutW ?? "",
      "42d_Wkg":
        r.currentW !== null && weight > 0
          ? Math.round((r.currentW / weight) * 100) / 100
          : "",
      "%FTP_42d": percentOfFtp(r.currentW, ftpWatts) ?? "",
    }));
  };

  const cpChip = curves.currentModel
    ? `CP ~${Math.round(curves.currentModel.cpWatts)} W`
    : curves.seasonModel
      ? `CP ~${Math.round(curves.seasonModel.cpWatts)} W`
      : null;

  return (
    <ChartCard
      title="Power Duration Curve"
      subtitle={`MMP-Vergleich · FTP ${ftpWatts} W${weightKg ? ` · ${weightKg.toFixed(1)} kg` : ""}`}
      icon={<Zap size={16} />}
      badge={
        cpChip ? (
          <span className="hidden sm:inline px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
            {cpChip}
          </span>
        ) : null
      }
      csvRows={
        hasAnyData
          ? csvRows
          : undefined
      }
      csvFilename="power-duration-curve"
      pngFilename="power-duration-curve"
    >
      {/* Kopfzeile: Modus-Toggle + Einheiten-Auswahl */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<PowerMode>
          options={[
            { value: "absolute", label: "Watt (W)" },
            { value: "relative", label: "Relativ (W/kg)" },
          ]}
          value={mode}
          onChange={setMode}
        />

        <select
          value={effectiveId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="max-w-[220px] truncate glass-panel rounded-xl px-2 py-1.5 text-[11px] font-semibold text-zinc-300 border border-white/10 outline-none cursor-pointer [&>option]:bg-zinc-900"
        >
          {poweredActivities.length === 0 && (
            <option value="">Keine Einheiten</option>
          )}
          {poweredActivities.map((a) => (
            <option key={a.id} value={a.id}>
              {new Date(a.startTime).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
              })}{" "}
              · {a.name}
            </option>
          ))}
        </select>
      </div>

      {!hasAnyData ? (
        <EmptyState message="Noch keine Leistungsdaten vorhanden – sync Radfahrten mit Leistungsmesser oder starte einen FTP-Test." />
      ) : (
        <>
          <div className="h-[260px] sm:h-[290px] w-full relative">
            {loadingWorkout && (
              <div className="absolute right-3 top-1 z-10 text-[10px] font-bold text-orange-400/80 animate-pulse">
                Telemetrie lädt…
              </div>
            )}
            <LineChart
              data={rows as unknown as Record<string, unknown>[]}
              xDataKey="date"
              aspectRatio="2.4 / 1"
              margin={{ top: 12, right: 24, bottom: 20, left: 36 }}
              className="w-full h-full"
            >
              <Grid horizontal stroke="#ffffff12" strokeDasharray="3 3" />
              <XAxis numTicks={7} />
              <YAxis numTicks={6} />
              <Line
                dataKey="season"
                stroke={COLORS.season}
                strokeWidth={1.8}
              />
              <Line
                dataKey="current"
                stroke={COLORS.current}
                strokeWidth={2.6}
              />
              {selectedId && (
                <Line
                  dataKey="workout"
                  stroke={COLORS.workout}
                  strokeWidth={2}
                />
              )}
              <ChartTooltip
                content={({ point }) => {
                  const row = point as unknown as PdcRow;
                  const entries = [
                    { label: "42 Tage", display: row.current, watts: row.currentW, color: COLORS.current },
                    { label: "Saison-Peak", display: row.season, watts: row.seasonW, color: COLORS.season },
                    { label: "Einheit", display: row.workout, watts: row.workoutW, color: COLORS.workout },
                  ];
                  return (
                    <div className="glass-panel rounded-xl border border-white/15 px-3 py-2 text-[11px] shadow-xl shadow-black/40 min-w-[200px]">
                      <div className="font-bold text-zinc-300 mb-1.5">{row.label}</div>
                      {entries.map((e) => (
                        <div key={e.label} className="flex items-center justify-between gap-3 py-0.5">
                          <span className="flex items-center gap-1.5 text-zinc-400">
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{ backgroundColor: e.color }}
                            />
                            {e.label}
                          </span>
                          {e.watts === null || e.watts === undefined ? (
                            <span className="text-zinc-600">–</span>
                          ) : (
                            <span className="font-mono text-zinc-200 text-right">
                              {Math.round(e.watts)} W
                              <span className="text-zinc-500">
                                {" "}
                                ·{" "}
                                {weightKg && weightKg > 0
                                  ? `${(e.watts / weightKg).toFixed(2)} W/kg`
                                  : `${percentOfFtp(e.watts, ftpWatts)} % FTP`}
                              </span>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
            </LineChart>
          </div>

          {/* Legende */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
            {[
              { color: COLORS.current, shape: "solid", label: "42 Tage (Fitness)" },
              { color: COLORS.season, shape: "dashed", label: "Saison-Peak (365d)" },
              {
                color: COLORS.workout,
                shape: "dotted",
                label: selectedActivity ? `Einheit: ${selectedActivity.name}` : "Einheit",
              },
            ].map((l) => (
              <span
                key={l.label}
                className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500 min-w-0"
              >
                <svg width="18" height="4">
                  <line
                    x1="0"
                    y1="2"
                    x2="18"
                    y2="2"
                    stroke={l.color}
                    strokeWidth="2.5"
                    strokeDasharray={
                      l.shape === "dashed"
                        ? "5 3"
                        : l.shape === "dotted"
                          ? "1 4"
                          : undefined
                    }
                    strokeLinecap={l.shape === "dotted" ? "round" : "butt"}
                  />
                </svg>
                <span className="truncate max-w-[180px]">{l.label}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}
