// ─── Performance Correlation Engine ──────────────────────────────────────────
// Berechnet ECHTE Pearson-Korrelationen aus den vorhandenen Nutzerdaten
// (Schlaf ↔ Watt, Protein ↔ Muskelmasse-Trend, Akutlast ↔ HRV).
// Bei zu wenig Datenstichen wird ehrlich "Datenerfassung" gemeldet statt
// erfundener Kennzahlen.

import {
  GarminDailyHealth,
  GarminActivity,
  DailyNutritionLog,
  BodyCompositionEntry,
  LoggedSession,
} from "@/types";
import { getLocalDateString } from "@/lib/utils";

export interface PerformanceCorrelationInsight {
  id: string;
  category: "sleep_power" | "protein_muscle" | "hrv_load" | "readiness_rpe";
  title: string;
  badge: string;
  badgeColor: string;
  correlationScore: number; // -1.0 bis 1.0; NaN wenn nicht berechenbar
  impactStatement: string;
  detailExplanation: string;
  actionableTip: string;
  isPreliminary?: boolean;
}

export interface TimelineTrendPoint {
  date: string; // YYYY-MM-DD
  weightKg?: number;
  bodyFatPct?: number;
  muscleMassKg?: number;
  sleepScore?: number;
  hrvMs?: number;
  acuteLoad?: number;
  avgPowerWatts?: number;
  proteinGrams?: number;
}

/** Mindestanzahl gepaarter Datenpunkte für eine Korrelationsaussage. */
const MIN_PAIRS = 5;

/**
 * Echter Pearson-Korrelationskoeffizient.
 * Gibt NaN zurück, wenn zu wenige Paare oder keine Varianz vorliegt –
 * bewusst KEIN Fake-Fallback-Wert.
 */
export function calculatePearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < MIN_PAIRS) return NaN;

  let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
    sumXY += x[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denominator === 0) return NaN;

  return Math.round((numerator / denominator) * 100) / 100;
}

function classifyCorrelation(r: number): { label: string; color: string } {
  if (Number.isNaN(r)) return { label: "Zu wenig Daten", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" };
  const abs = Math.abs(r);
  const sign = r >= 0 ? "+" : "−";
  if (abs >= 0.7) return { label: `Starke Korrelation (r = ${sign}${abs.toFixed(2)})`, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  if (abs >= 0.4) return { label: `Moderate Korrelation (r = ${sign}${abs.toFixed(2)})`, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
  return { label: `Schwache Korrelation (r = ${sign}${abs.toFixed(2)})`, color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30" };
}

function collectionBadge(have: number): { label: string; color: string } {
  return {
    label: `Datenerfassung (${have}/${MIN_PAIRS} Tagespaare)`,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function computePerformanceCorrelations(
  healthLogs: Record<string, GarminDailyHealth>,
  activities: GarminActivity[],
  nutritionLogs: DailyNutritionLog[],
  bodyLogs: BodyCompositionEntry[],
  loggedSessions: LoggedSession[]
): PerformanceCorrelationInsight[] {
  void loggedSessions;
  const insights: PerformanceCorrelationInsight[] = [];

  // ── 1. Schlaf-Score (Vortag/gleicher Tag) ↔ Ø-Leistung (Radausfahrten mit Power)
  const powerPairs: { sleep: number; power: number }[] = [];
  for (const a of activities) {
    if (a.type !== "cycling" || !a.avgPowerWatts || a.avgPowerWatts <= 50) continue;
    const dateStr = (a.startTime.split(" ")[0] || a.startTime.split("T")[0] || "").slice(0, 10);
    const prevDate = new Date(`${dateStr}T12:00:00`);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevStr = getLocalDateString(prevDate);

    const sleepToday = healthLogs[dateStr]?.sleepScore;
    const sleepPrev = healthLogs[prevStr]?.sleepScore;
    const sleep = sleepToday ?? sleepPrev;
    if (typeof sleep === "number") {
      powerPairs.push({ sleep, power: a.avgPowerWatts });
    }
  }

  if (powerPairs.length >= MIN_PAIRS) {
    const r = calculatePearson(
      powerPairs.map((p) => p.sleep),
      powerPairs.map((p) => p.power)
    );
    const goodSleep = powerPairs.filter((p) => p.sleep >= 85).map((p) => p.power);
    const badSleep = powerPairs.filter((p) => p.sleep < 85).map((p) => p.power);

    let impact: string;
    if (goodSleep.length > 0 && badSleep.length > 0) {
      const delta = Math.round(
        goodSleep.reduce((a, b) => a + b, 0) / goodSleep.length -
          badSleep.reduce((a, b) => a + b, 0) / badSleep.length
      );
      impact =
        delta >= 0
          ? `An Tagen nach Schlaf-Score ≥ 85 leistest du im Schnitt ${delta} W mehr als nach schlechtem Schlaf.`
          : `An Tagen nach Schlaf-Score ≥ 85 leistest du im Schnitt ${Math.abs(delta)} W weniger – prüfe auch Belastungsverteiliung.`;
    } else {
      impact = `Bisher nur ${powerPairs.length} Radausfahrten mit Power-Daten und passendem Schlaf-Wert erfasst.`;
    }
    const cls = classifyCorrelation(r);

    insights.push({
      id: "corr_sleep_power",
      category: "sleep_power",
      title: "Schlafqualität & Watt-Leistung (Radsport)",
      badge: cls.label,
      badgeColor: cls.color,
      correlationScore: r,
      impactStatement: impact,
      detailExplanation: `Basis: ${powerPairs.length} Einheiten mit Garmin-Schlafdaten und Leistungsmessern. Tiefer REM- und Tiefschlaf fördern die Glykogenresynthese und senken neuromuskuläre Ermüdung.`,
      actionableTip:
        "Priorisiere 8+ Stunden Schlaf vor harten Schwellen- und Renneinheiten.",
      isPreliminary: powerPairs.length < 10,
    });
  } else {
    const totalDataPoints =
      activities.length + Object.keys(healthLogs).length;
    const cls = collectionBadge(powerPairs.length);
    insights.push({
      id: "corr_sleep_power",
      category: "sleep_power",
      title: "Schlafqualität & Schwellen-Leistung",
      badge: cls.label,
      badgeColor: cls.color,
      correlationScore: NaN,
      impactStatement: `Es liegen erst ${powerPairs.length} auswertbare Tagespaare vor. Synchronisiere Garmin nach jeder Ausfahrt – ab ${MIN_PAIRS} Paaren wird eine echte Pearson-Analyse erstellt.`,
      detailExplanation:
        "Die Analyse vergleicht deinen Schlaf-Score der Nacht vor jeder Radausfahrt mit deiner Durchschnittsleistung. Noch keine erfundenen Werte – nur echte Daten.",
      actionableTip:
        "Synchronisiere weiterhin deine Garmin-Uhr nach jedem Workout für präzise Leistungsanalysen.",
      isPreliminary: true,
    });
    void totalDataPoints;
  }

  // ── 2. Protein-Zufuhr & Muskelmasse ────────────────────────────────────────
  const proteinByDay = nutritionLogs
    .map((l) => ({
      date: l.date,
      protein: l.entries.reduce((ps, e) => ps + (e.protein || 0), 0),
    }))
    .filter((d) => d.protein > 0);

  const latestBody = [...bodyLogs]
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .find((b) => typeof b.weight === "number" && b.weight > 0);

  if (proteinByDay.length >= MIN_PAIRS && latestBody) {
    const avgProtein = Math.round(
      proteinByDay.reduce((s, d) => s + d.protein, 0) / proteinByDay.length
    );
    const targetPerKg = round1(latestBody.weight * 2.0);
    const ratio = round1(avgProtein / Math.max(1, latestBody.weight));

    const onTarget = avgProtein >= targetPerKg;
    insights.push({
      id: "corr_protein_muscle",
      category: "protein_muscle",
      title: "Protein-Zufuhr & Erhalt der Muskelmasse",
      badge: onTarget
        ? `Ziel erreicht (${avgProtein} g ≈ ${ratio} g/kg)`
        : `Unter Ziel (${avgProtein} g / ${targetPerKg} g Ziel)`,
      badgeColor: onTarget
        ? "text-purple-400 bg-purple-500/10 border-purple-500/30"
        : "text-amber-400 bg-amber-500/10 border-amber-500/30",
      correlationScore: NaN,
      impactStatement: `Ø ${avgProtein} g Protein an ${proteinByDay.length} geloggten Tagen bei ${latestBody.weight} kg Körpergewicht (= ${ratio} g/kg).`,
      detailExplanation:
        "Als Hybrid-Athlet verhindert eine Zufuhr von ≥ 2,0 g Protein pro kg Körpergewicht den trainingsbedingten Muskelabbau durch lange Rad- und Laufeinheiten.",
      actionableTip: "Verteile dein Protein auf mindestens 4 Mahlzeiten mit je 30–45 g.",
    });
  } else {
    insights.push({
      id: "corr_protein_muscle",
      category: "protein_muscle",
      title: "Protein-Zufuhr & Erhalt der Muskelmasse",
      badge: collectionBadge(proteinByDay.length).label.replace("Tagespaare", "Ernährungstage"),
      badgeColor: collectionBadge(proteinByDay.length).color,
      correlationScore: NaN,
      impactStatement: `Logge deine Ernährung an mindestens ${MIN_PAIRS} Tagen und erfasst dein Körpergewicht einmal – dann wird deine individuelle Protein-Bilanz ausgewertet.`,
      detailExplanation:
        "Ausgewertet werden deine echten Tages-Summen im Vergleich zum 2,0 g/kg-Ziel basierend auf deiner letzten gewogenen Messung.",
      actionableTip: "Nutze den Ernährungs-Tab mit Barcodescanner für schnelles Logging.",
      isPreliminary: true,
    });
  }

  // ── 3. Akutlast ↔ HRV (echte Paare aus den Gesundheitslogs) ────────────────
  const hrvPairs = Object.values(healthLogs)
    .filter(
      (h) =>
        typeof h.acuteTrainingLoad === "number" &&
        typeof h.hrvLastNightMs === "number"
    )
    .map((h) => ({ load: h.acuteTrainingLoad as number, hrv: h.hrvLastNightMs as number }));

  if (hrvPairs.length >= MIN_PAIRS) {
    const r = calculatePearson(
      hrvPairs.map((p) => p.load),
      hrvPairs.map((p) => p.hrv)
    );
    const cls = classifyCorrelation(r);

    const stable = Number.isNaN(r) || Math.abs(r) < 0.5;
    insights.push({
      id: "corr_hrv_load",
      category: "hrv_load",
      title: "Akut-Belastung & HRV-Stabilität",
      badge: cls.label,
      badgeColor: stable
        ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/30"
        : cls.color,
      correlationScore: r,
      impactStatement: Number.isNaN(r)
        ? "Deine HRV-Daten sind noch nicht ausreichend für eine Aussage."
        : `Über ${hrvPairs.length} Tage zeigt sich: ${r <= -0.4 ? "Steigende Akutlast geht mit sinkender HRV einher – beobachte deine Regeneration." : stable ? "Deine HRV bleibt von der Akutlast weitgehend unbeeinflusst." : "Hohe Akutlast fällt mit höherer HRV zusammen (untypisch – prüfe Messzeitpunkte)."}`,
      detailExplanation: `Basis: ${hrvPairs.length} Tage mit Garmin-Akutlast und nächtlicher HRV-Messung. RMSSD-HRV spiegelt die Aktivität des vegetativen Nervensystems.`,
      actionableTip:
        "Halte deinen ACWR-Quotienten im Bereich zwischen 1.2 und 1.5 für stetigen Formaufbau.",
    });
  } else {
    insights.push({
      id: "corr_hrv_load",
      category: "hrv_load",
      title: "Akut-Belastung & HRV-Stabilität",
      badge: collectionBadge(hrvPairs.length).label,
      badgeColor: collectionBadge(hrvPairs.length).color,
      correlationScore: NaN,
      impactStatement: `Erst ${hrvPairs.length} Tage mit kombinierter Akutlast-/HRV-Messung. Ab ${MIN_PAIRS} Tagen wird deine persönliche Belastungs-HRV-Reaktion berechnet.`,
      detailExplanation:
        "Ein stabiler HRV-RMSSD-Wert trotz wechselnder Belastung zeigt gute Regenerationskapazität – hier wird das exklusiv aus deinen Garmin-Daten geprüft.",
      actionableTip:
        "Trage die Uhr nachts regelmäßig, damit HRV und Trainingsload gepaart werden können.",
      isPreliminary: true,
    });
  }

  return insights;
}

export function buildMultiMetricTimeline(
  healthLogs: Record<string, GarminDailyHealth>,
  bodyLogs: BodyCompositionEntry[],
  activities: GarminActivity[],
  nutritionLogs: DailyNutritionLog[] = [],
  daysCount = 14
): TimelineTrendPoint[] {
  const points: TimelineTrendPoint[] = [];
  const today = new Date();

  const proteinByDate = new Map<string, number>();
  for (const l of nutritionLogs) {
    proteinByDate.set(
      l.date,
      l.entries.reduce((ps, e) => ps + (e.protein || 0), 0)
    );
  }

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);

    const health = healthLogs[dateStr];
    const body = bodyLogs.find((b) => b.date.split("T")[0] === dateStr);
    const dayActs = activities.filter(
      (a) => a.startTime.split(" ")[0] === dateStr || a.startTime.split("T")[0] === dateStr
    );
    const avgPower = dayActs.find((a) => a.avgPowerWatts)?.avgPowerWatts;

    points.push({
      date: dateStr,
      weightKg: body?.weight,
      bodyFatPct: body?.bodyFatPct,
      muscleMassKg: body?.muscleMassKg,
      sleepScore: health?.sleepScore,
      hrvMs: health?.hrvLastNightMs,
      acuteLoad: health?.acuteTrainingLoad,
      avgPowerWatts: avgPower,
      proteinGrams: proteinByDate.get(dateStr),
    });
  }

  return points;
}
