"use client";

/**
 * Performance Management Chart (Coggan-PMC):
 *   CTL (Fitness)  – blaue Linie, 42-Tage-EMA
 *   ATL (Fatigue)  – magenta Linie, 7-Tage-EMA
 *   TSB (Form)     – gefüllte Fläche, farblich nach Zone:
 *     > +5        grün   Frisch / Race Ready
 *     -10 … +5    grau   Neutral
 *     -30 … -10   blau   Optimaler Trainingsreiz
 *     < -30       rot    Hohe Ermüdung / Überreach-Warnung
 *
 * Zeitauswahl 30d / 90d / 180d / 1 Jahr. Nutzt die bestehende
 * Training-Load-Engine aus src/lib/training.
 */

import { useMemo, useState } from "react";
import ComposedChart from "@/components/charts/composed-chart";
import { Area } from "@/components/charts/area";
import { Line } from "@/components/charts/line";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { Activity } from "lucide-react";
import type { GarminActivity } from "@/types";
import { computeTrainingLoadFromActivities, type DailyLoadPoint } from "@/lib/training/trainingLoad";
import ChartCard, { SegmentedControl, EmptyState } from "./ChartCard";

type RangeKey = "30d" | "90d" | "180d" | "1y";

const RANGE_DAYS: Record<RangeKey, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "1y": 365,
};

const FORM_COLORS = {
  fresh: "#34d399",
  neutral: "#a1a1aa",
  optimal: "#3b82f6",
  risk: "#f87171",
} as const;

const STATUS_LABELS: Record<string, string> = {
  fresh: "Frisch / Race Ready",
  neutral: "Neutral",
  fatigued: "Trainingsstimulus aktiv",
  overreaching: "Hohe Ermüdung – Überreach-Risiko",
};

function statusOf(tsb: number): keyof typeof STATUS_LABELS {
  if (tsb >= 5) return "fresh";
  if (tsb <= -30) return "overreaching";
  if (tsb <= -10) return "fatigued";
  return "neutral";
}

interface PmcRow extends DailyLoadPoint {
  ts: number;
  label: string;
  fresh: number;
  neutralBand: number;
  optimal: number;
  risk: number;
}

function buildRows(series: DailyLoadPoint[], days: number): PmcRow[] {
  const sliced = series.slice(-days);
  return sliced.map((p) => ({
    ...p,
    ts: Date.parse(p.date),
    label: new Date(p.date + "T12:00:00").toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "short",
    }),
    fresh: p.tsb > 5 ? p.tsb : 0,
    neutralBand: p.tsb > -10 && p.tsb <= 5 ? p.tsb : 0,
    optimal: p.tsb > -30 && p.tsb <= -10 ? p.tsb : 0,
    risk: p.tsb <= -30 ? p.tsb : 0,
  }));
}

function PmcTooltipContent({ row }: { row?: PmcRow }) {
  if (!row) return null;

  const status = statusOf(row.tsb);
  const statusColor =
    status === "fresh"
      ? FORM_COLORS.fresh
      : status === "overreaching"
        ? FORM_COLORS.risk
        : status === "fatigued"
          ? FORM_COLORS.optimal
          : FORM_COLORS.neutral;

  return (
    <div className="glass-panel rounded-xl border border-white/15 px-3 py-2 text-[11px] shadow-xl shadow-black/40 space-y-1">
      <div className="font-bold text-zinc-200">{row.label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-blue-300">CTL (Fitness)</span>
        <span className="font-mono text-zinc-100">{Number(row.ctl || 0).toFixed(1)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-pink-400">ATL (Fatigue)</span>
        <span className="font-mono text-zinc-100">{Number(row.atl || 0).toFixed(1)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-emerald-300">TSB (Form)</span>
        <span className="font-mono font-bold" style={{ color: statusColor }}>
          {Number(row.tsb || 0) > 0 ? "+" : ""}
          {Number(row.tsb || 0).toFixed(1)}
        </span>
      </div>
      <div className="pt-0.5 border-t border-white/10 flex justify-between gap-4">
        <span className="text-zinc-500">Tages-TSS</span>
        <span className="font-mono text-zinc-400">{row.dailyTss}</span>
      </div>
      <div
        className="text-[10px] font-bold pt-0.5"
        style={{ color: statusColor }}
      >
        {STATUS_LABELS[status]}
      </div>
    </div>
  );
}

export interface PerformanceManagementChartProps {
  activities: GarminActivity[];
}

export default function PerformanceManagementChart({
  activities,
}: PerformanceManagementChartProps) {
  const [range, setRange] = useState<RangeKey>("90d");

  const { series } = useMemo(
    () => computeTrainingLoadFromActivities(activities),
    [activities]
  );

  const rows = useMemo(() => {
    const raw = buildRows(series, RANGE_DAYS[range]);
    return raw.map((r) => ({
      ...r,
      date: new Date(r.date),
      rawDate: r.date,
    }));
  }, [series, range]);

  const csvRows = () =>
    rows.map((r) => ({
      Datum: r.rawDate,
      CTL_Fitness: r.ctl,
      ATL_Fatigue: r.atl,
      TSB_Form: r.tsb,
      TagesTSS: r.dailyTss,
      Status: STATUS_LABELS[statusOf(r.tsb)],
    }));

  // Form-Achse dynamisch klemmen, damit die Zonen-Referenzen sichtbar bleiben
  const tsbValues = rows.map((r) => r.tsb);
  const formDomain: [number, number] = [
    Math.min(-38, ...tsbValues) - 4,
    Math.max(12, ...tsbValues) + 4,
  ];

  const last = series.at(-1);

  return (
    <ChartCard
      title="Fitness · Fatigue · Form"
      subtitle="Performance Management Chart nach Coggan (CTL/ATL/TSB)"
      icon={<Activity size={16} />}
      badge={
        last ? (
          <span
            className="px-2 py-0.5 rounded-full text-[9px] font-bold border"
            style={{
              color:
                statusOf(last.tsb) === "fresh"
                  ? FORM_COLORS.fresh
                  : statusOf(last.tsb) === "overreaching"
                    ? FORM_COLORS.risk
                    : statusOf(last.tsb) === "fatigued"
                      ? FORM_COLORS.optimal
                      : FORM_COLORS.neutral,
              borderColor: "color-mix(in srgb, currentColor 35%, transparent)",
              backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)",
            }}
          >
            TSB {last.tsb > 0 ? "+" : ""}
            {last.tsb}
          </span>
        ) : null
      }
      csvRows={rows.length > 0 ? csvRows : undefined}
      csvFilename="pmc-fitness-fatigue-form"
      pngFilename="pmc-chart"
    >
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl<RangeKey>
          options={[
            { value: "30d", label: "30d" },
            { value: "90d", label: "90d" },
            { value: "180d", label: "180d" },
            { value: "1y", label: "1 Jahr" },
          ]}
          value={range}
          onChange={setRange}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState message="Keine Trainingsdaten für die Formkurve – sync Garmin-Einheiten oder logge Sessions." />
      ) : (
        <>
          <div className="h-[260px] sm:h-[290px] w-full">
            <ComposedChart
              data={rows as unknown as Record<string, unknown>[]}
              xDataKey="date"
              aspectRatio="2.4 / 1"
              margin={{ top: 12, right: 36, bottom: 20, left: 36 }}
              className="w-full h-full"
            >
              <Grid horizontal stroke="#ffffff15" strokeDasharray="3 3" />
              <XAxis numTicks={6} />
              <YAxis yAxisId="load" orientation="left" numTicks={6} />
              <YAxis yAxisId="form" orientation="right" numTicks={6} />
              <Area
                yAxisId="form"
                dataKey="tsb"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.25}
                strokeWidth={1.5}
              />
              <Line
                yAxisId="load"
                dataKey="ctl"
                stroke="#60a5fa"
                strokeWidth={2.4}
              />
              <Line
                yAxisId="load"
                dataKey="atl"
                stroke="#ec4899"
                strokeWidth={1.8}
              />
              <ChartTooltip
                content={({ point }) => (
                  <PmcTooltipContent row={point as unknown as PmcRow} />
                )}
              />
            </ComposedChart>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
            <LegendDot color="#60a5fa" label="CTL Fitness" />
            <LegendDot color="#ec4899" label="ATL Fatigue" />
            <LegendDot color={FORM_COLORS.fresh} label="Frisch (>+5)" />
            <LegendDot color={FORM_COLORS.neutral} label="Neutral" />
            <LegendDot color={FORM_COLORS.optimal} label="Trainingszone" />
            <LegendDot color={FORM_COLORS.risk} label="Überreach (<-30)" />
          </div>
        </>
      )}
    </ChartCard>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
