// ─── Zone Distribution & Intensity-Pattern Classifier ────────────────────────
//
// Aggregiert `timeInZonesMin` der letzten 7 Tage zu horizontalen
// Stacked-Bars (Leistung Z1–Z7 / HF Z1–Z5) und klassifiziert das
// Intensitätsmuster nach dem Seiler-3-Zonen-Modell:
//   Easy   = Power Z1–Z2  | HR Z1–Z2
//   Middle = Power Z3–Z4  | HR Z3
//   Hard   = Power Z5–Z7  | HR Z4–Z5

import type { GarminActivity } from "@/types";

export type ZoneMode = "power" | "hr";

export const POWER_ZONE_COUNT = 7;
export const HR_ZONE_COUNT = 5;

export interface WeeklyZoneDistribution {
  power: number[] | null; // Minuten je Zone, Länge 7
  hr: number[] | null; // Minuten je Zone, Länge 5
}

export type DistributionClass =
  | "polarized"
  | "pyramidal"
  | "threshold_heavy"
  | "base_only";

export interface DistributionClassification {
  label: string;
  cls: DistributionClass;
  description: string;
  shares: { easyPct: number; midPct: number; hardPct: number };
}

/** Klassifikations-Schwellwerte (in % der Gesamtzeit). */
export const CLASSIFY_THRESHOLDS = {
  baseOnlyHardMax: 3,
  thresholdHeavyMidMin: 32,
  thresholdHeavyZ4Min: 18,
  polarizedHardMin: 12,
  polarizedMidMax: 15,
} as const;

function isFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * Zeit-in-Zonen der letzten 7 Tage summieren.
 * Arrays mit ≥ 7 Einträge gelten als Power-Zonen, kürzere als HF-Zonen.
 */
export function aggregateWeeklyTimeInZones(
  activities: GarminActivity[],
  opts: { nowISO?: string; windowDays?: number } = {}
): WeeklyZoneDistribution {
  const nowMs = opts.nowISO !== undefined ? Date.parse(opts.nowISO) : Date.now();
  if (!Number.isFinite(nowMs)) return { power: null, hr: null };

  const days = opts.windowDays ?? 7;
  const fromMs = nowMs - days * 24 * 3600 * 1000;

  const power = new Array<number>(POWER_ZONE_COUNT).fill(0);
  const hr = new Array<number>(HR_ZONE_COUNT).fill(0);

  for (const a of activities) {
    const start = Date.parse(a.startTime);
    if (!Number.isFinite(start) || start < fromMs || start > nowMs) continue;
    const zones = a.timeInZonesMin;
    if (!Array.isArray(zones)) continue;

    if (zones.length >= POWER_ZONE_COUNT) {
      for (let i = 0; i < POWER_ZONE_COUNT; i++) {
        if (isFinite(zones[i])) power[i] += zones[i]!;
      }
    } else if (zones.length === HR_ZONE_COUNT) {
      for (let i = 0; i < HR_ZONE_COUNT; i++) {
        if (isFinite(zones[i])) hr[i] += zones[i]!;
      }
    }
  }

  return {
    power: power.some((v) => v > 0) ? power : null,
    hr: hr.some((v) => v > 0) ? hr : null,
  };
}

/**
 * Intensitätsmuster klassifizieren (Seiler-3-Zonen-Modell).
 *
 * Reihenfolge der Regeln:
 *  1. Base Only    – kaum harte Anteile (hard ≤ 3 %)
 *  2. Threshold-Heavy – mittlerer Block dominant (mid ≥ 32 % oder Z4 ≥ 18 %)
 *  3. Polarized    – hart ≥ 12 % bei minimalem Mittelblock (mid ≤ 15 %)
 *  4. Pyramidal    – Default bei fallender Verteilung easy > mid > hard
 */
export function classifyZoneDistribution(
  zoneMinutes: number[]
): DistributionClassification {
  const total = zoneMinutes.reduce((s, v) => s + (isFinite(v) ? v : 0), 0);
  const pct = (i: number) =>
    total > 0 && isFinite(zoneMinutes[i]) ? (zoneMinutes[i]! / total) * 100 : 0;

  // 7 Zonen (Power): Easy 1–2, Mid 3–4, Hard 5–7
  // 5 Zonen (HF):    Easy 1–2, Mid 3,   Hard 4–5
  const seven = zoneMinutes.length >= POWER_ZONE_COUNT;
  const easyPct = seven ? pct(0) + pct(1) : pct(0) + pct(1);
  const midPct = seven ? pct(2) + pct(3) : pct(2);
  const hardPct = seven ? pct(4) + pct(5) + pct(6) : pct(3) + pct(4);
  const z4Pct = pct(3);

  const shares = {
    easyPct: Math.round(easyPct),
    midPct: Math.round(midPct),
    hardPct: Math.round(hardPct),
  };

  let cls: DistributionClass;
  let label: string;
  let description: string;

  if (total <= 0) {
    cls = "base_only";
    label = "Keine Daten";
    description = "Keine Zeit-in-Zonen-Daten in den letzten 7 Tagen";
  } else if (hardPct <= CLASSIFY_THRESHOLDS.baseOnlyHardMax) {
    cls = "base_only";
    label = "Base Only";
    description =
      "Fast reine Grundlagenarbeit – für Rennvorbereitung fehlen intensive Reize";
  } else if (
    midPct >= CLASSIFY_THRESHOLDS.thresholdHeavyMidMin ||
    z4Pct >= CLASSIFY_THRESHOLDS.thresholdHeavyZ4Min
  ) {
    cls = "threshold_heavy";
    label = "Threshold-Heavy";
    description =
      "Hoher Anteil im Schwellen-/Tempobereich – Überlastungsrisiko, Polarisation prüfen";
  } else if (
    hardPct >= CLASSIFY_THRESHOLDS.polarizedHardMin &&
    midPct <= CLASSIFY_THRESHOLDS.polarizedMidMax
  ) {
    cls = "polarized";
    label = "Polarized (~80/20)";
    description =
      "Klassisches 80/20-Modell: viel leicht, wenig hart – optimal für nachhaltige Fitnesszuwächse";
  } else {
    cls = "pyramidal";
    label = "Pyramidal";
    description =
      "Fallende Pyramide mit moderatem Tempoblock – solide Struktur für Ausdauerentwicklung";
  }

  return { label, cls, description, shares };
}

/** CSV-freundliche Zeilen je Zone. */
export function zoneRows(
  minutes: number[],
  mode: ZoneMode,
  totalMinutes?: number
): Array<{ zone: string; minutes: number; sharePct: number }> {
  const total =
    totalMinutes ?? minutes.reduce((s, v) => s + (isFinite(v) ? v : 0), 0);
  const count = mode === "power" ? POWER_ZONE_COUNT : HR_ZONE_COUNT;
  return Array.from({ length: count }, (_, i) => ({
    zone: `Z${i + 1}`,
    minutes: Math.round(minutes[i] ?? 0),
    sharePct:
      total > 0 ? Math.round(((minutes[i] ?? 0) / total) * 1000) / 10 : 0,
  }));
}
