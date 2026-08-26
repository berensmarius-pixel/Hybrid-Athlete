"use client";

/**
 * Polarized vs. Pyramidal Intensity Distribution:
 *
 * Horizontale Stacked-Bars der Zeit in Power-Zonen (Z1-Z7, Coggan) und
 * HF-Zonen (Z1-Z5) der letzten 7 Tage. Ein automatischer Badge-Classifier
 * ordnet die Wochenverteilung ein: Polarized (80/20), Pyramidal,
 * Threshold-Heavy oder Base Only.
 */

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import { BarChart3 } from "lucide-react";
import type { GarminActivity } from "@/types";
import {
  aggregateWeeklyTimeInZones,
  classifyZoneDistribution,
  zoneRows,
  type DistributionClass,
} from "./engine/zones";
import ChartCard, { EmptyState } from "./ChartCard";

const POWER_ZONE_COLORS = [
  "#71717a", // Z1 zinc
  "#34d399", // Z2 emerald
  "#22d3ee", // Z3 cyan
  "#f59e0b", // Z4 amber
  "#a78bfa", // Z5 violet
  "#fb7185", // Z6 rose
  "#e879f9", // Z7 fuchsia
] as const;

const HR_ZONE_COLORS = [
  "#71717a",
  "#34d399",
  "#22d3ee",
  "#f59e0b",
  "#fb7185",
] as const;

const CLASS_BADGE_STYLES: Record<DistributionClass, string> = {
  polarized: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  pyramidal: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  threshold_heavy: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  base_only: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30",
};

function ZoneTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);

  return (
    <div className="glass-panel rounded-xl border border-white/15 px-3 py-2 text-[11px] shadow-xl shadow-black/40 space-y-0.5">
      <div className="font-bold text-zinc-300 mb-1">
        Woche · {Math.round(total)} min Gesamt
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
          </span>
          <span className="font-mono text-zinc-200">
            {Math.round(Number(p.value ?? 0))} min
            <span className="text-zinc-500">
              {" "}
              · {total > 0 ? Math.round((Number(p.value ?? 0) / total) * 100) : 0} %
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

interface StackedRow extends Record<string, string | number> {
  name: string;
}

function buildStackedRows(
  minutes: number[],
  mode: "power" | "hr"
): { rows: StackedRow[]; zoneKeys: string[]; zoneNames: string[] } {
  const count = mode === "power" ? 7 : 5;
  const rows = zoneRows(minutes, mode);
  const row: StackedRow = { name: mode === "power" ? "Power (Z1-Z7)" : "Herzfrequenz (Z1-Z5)" };
  const zoneKeys: string[] = [];
  const zoneNames: string[] = [];

  for (let i = 0; i < count; i++) {
    const key = `z${i + 1}`;
    row[key] = rows[i].minutes;
    zoneKeys.push(key);
    zoneNames.push(`${mode === "power" ? "Z" : "HF-Z"}${i + 1}`);
  }

  return { rows: [row], zoneKeys, zoneNames };
}

export interface ZoneDistributionChartProps {
  activities: GarminActivity[];
}

export default function ZoneDistributionChart({
  activities,
}: ZoneDistributionChartProps) {
  const distribution = useMemo(
    () => aggregateWeeklyTimeInZones(activities),
    [activities]
  );

  // Klassifizierung primär über Power-Zonen, sonst HF
  const primaryMinutes = distribution.power ?? distribution.hr;
  const classification = useMemo(
    () => classifyZoneDistribution(primaryMinutes ?? []),
    [primaryMinutes]
  );

  const powerView = useMemo(
    () =>
      distribution.power
        ? buildStackedRows(distribution.power, "power")
        : null,
    [distribution]
  );
  const hrView = useMemo(
    () => (distribution.hr ? buildStackedRows(distribution.hr, "hr") : null),
    [distribution]
  );

  function csvRowsFactory() {
    const powerRows = distribution.power
      ? zoneRows(distribution.power, "power").map((r) => ({
          Modus: "Power",
          Zone: r.zone,
          Minuten: r.minutes,
          Anteil_Prozent: r.sharePct,
        }))
      : [];
    const hrRows = distribution.hr
      ? zoneRows(distribution.hr, "hr").map((r) => ({
          Modus: "HeartRate",
          Zone: r.zone,
          Minuten: r.minutes,
          Anteil_Prozent: r.sharePct,
        }))
      : [];
    return [...powerRows, ...hrRows];
  }

  const hasData = Boolean(powerView || hrView);
  const weekLabel = `${classification.shares.easyPct}/${classification.shares.hardPct}`;

  return (
    <ChartCard
      title="Intensitätsverteilung (7 Tage)"
      subtitle={classification.description}
      icon={<BarChart3 size={16} />}
      badge={
        hasData ? (
          <span
            className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${CLASS_BADGE_STYLES[classification.cls]}`}
          >
            {classification.label} · {weekLabel}
          </span>
        ) : null
      }
      csvRows={hasData ? csvRowsFactory : undefined}
      csvFilename="zone-distribution"
      pngFilename="zone-distribution-chart"
    >
      {!hasData ? (
        <EmptyState message="Keine Zeit-in-Zonen-Daten in den letzten 7 Tagen – Daten kommen aus Garmin-Sync-Einheiten." />
      ) : (
        <div className="space-y-3 pt-1">
          {/* ── Power-Zonen (Coggan Z1-Z7) ─────────────────────────────── */}
          {powerView && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1">
                Power-Zonen · Coggan
              </div>
              <ZoneBar
                view={powerView}
                colors={[...POWER_ZONE_COLORS]}
                unit="min"
              />
            </div>
          )}

          {/* ── HF-Zonen (Z1-Z5) ───────────────────────────────────────── */}
          {hrView && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1">
                Herzfrequenz-Zonen
              </div>
              <ZoneBar view={hrView} colors={[...HR_ZONE_COLORS]} unit="min" />
            </div>
          )}

          {/* Seiler-Dreiklang */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <ShareStat label="Easy (Z1-2)" pct={classification.shares.easyPct} color="#34d399" />
            <ShareStat
              label={distribution.power ? "Middle (Z3-4)" : "Middle (Z3)"}
              pct={classification.shares.midPct}
              color="#22d3ee"
            />
            <ShareStat
              label={distribution.power ? "Hard (Z5-7)" : "Hard (Z4-5)"}
              pct={classification.shares.hardPct}
              color="#fb7185"
            />
          </div>
        </div>
      )}
    </ChartCard>
  );
}

/** Eine horizontale gestapelte Zone-Bar (100 % Breite relativ zur Gesamtzeit). */
function ZoneBar({
  view,
  colors,
  unit,
}: {
  view: { rows: StackedRow[]; zoneKeys: string[]; zoneNames: string[] };
  colors: string[];
  unit: string;
}) {
  return (
    <div className="h-[64px] -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={view.rows}
          layout="vertical"
          margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
          barCategoryGap={12}
        >
          <CartesianGrid stroke="#ffffff08" horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="name"
            width={104}
            tick={{ fill: "#a1a1aa", fontSize: 10, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={ZoneTooltip} cursor={{ fill: "#ffffff06" }} />
          {view.zoneKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              name={view.zoneNames[i]}
              stackId="zones"
              fill={colors[i]}
              radius={
                i === 0
                  ? [4, 0, 0, 4]
                  : i === view.zoneKeys.length - 1
                    ? [0, 4, 4, 0]
                    : 0
              }
              isAnimationActive={false}
              unit={` ${unit}`}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ShareStat({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-zinc-600 font-bold truncate">
        {label}
      </div>
      <div className="text-sm font-black font-mono" style={{ color }}>
        {pct} %
      </div>
    </div>
  );
}
