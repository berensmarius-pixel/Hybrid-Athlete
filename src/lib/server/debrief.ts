// ─── AI Post-Workout-Debrief (Planned vs. Actual) ────────────────────────────
//
// Erzeugt einen kompakten 2–3-Sätze-Debrief für die Mobile-Ansicht:
//   1. Deterministische Adhärenz-Kennzahlen (Leistungstreue, Intervalle)
//   2. Gemini-Kurzfassung im Deutsch des Trainers – mit Template-Fallback,
//      falls kein Key konfiguriert ist oder die API fehlschlägt.

import type {
  GarminActivity,
  PlannedWorkoutLink,
  PostWorkoutDebrief,
  ReplenishmentTarget,
  TrainingLoadSnapshot,
} from "@/types";
import { resolveGeminiKeyServer } from "@/lib/server/geminiKey";
import { generateId } from "@/lib/utils";

export interface DebriefInput {
  activity: GarminActivity;
  planned?: PlannedWorkoutLink | null;
  loadSnapshot?: TrainingLoadSnapshot | null;
  replenishment?: ReplenishmentTarget | null;
}

export type DebriefResult = Omit<
  PostWorkoutDebrief,
  "id" | "createdAt" | "date" | "activityName" | "generator"
>;

// ─── Adhärenz-Berechnung ─────────────────────────────────────────────────────

function clampPercent(value: number): number {
  return Math.round(Math.min(120, Math.max(0, value)));
}

/** Prozentwert eines FTP-Ziels aus der Planbeschreibung, z. B. "4x8 Min @ 95% FTP" oder "IF 0.88". */
function extractFtpTargetPct(description: string): number | null {
  const pctMatch = /(\d{2,3})\s*%\s*(?:von\s+)?(?:der\s+)?(?:ftp|schwelle)/i.exec(description);
  if (pctMatch) {
    const pct = Number(pctMatch[1]);
    if (pct >= 30 && pct <= 130) return pct;
  }
  const ifMatch = /(?:if|intensitätsfaktor)\s*[:=]?\s*(0?\.\d{1,2})/i.exec(description);
  if (ifMatch) {
    const pct = Math.round(Number(ifMatch[1]) * 100);
    if (pct >= 30 && pct <= 130) return pct;
  }
  return null;
}

/** Intervallzahl aus Beschreibung, z. B. "4x8 Min". */
function extractIntervalCount(description: string): number | null {
  const match = /(\d{1,2})\s*[x×]\s*\d+/i.exec(description);
  return match ? Number(match[1]) : null;
}

export interface AdherenceStats {
  /** 0–120 % – Abweichung der (Normal-)Leistung vom Ziel */
  powerCompliancePct: number | null;
  ftpTargetWatts: number | null;
  intervalCountPlanned: number | null;
}

export function computeAdherence(
  activity: GarminActivity,
  planned?: PlannedWorkoutLink | null
): AdherenceStats {
  const description = planned?.description ?? "";

  let ftpTargetWatts: number | null = null;
  let powerCompliancePct: number | null = null;

  const targetPct = extractFtpTargetPct(description);
  const referenceFtp =
    activity.functionalThresholdPowerWatts ?? null;

  if (targetPct !== null && referenceFtp && referenceFtp > 50) {
    ftpTargetWatts = Math.round((targetPct / 100) * referenceFtp);
    const actual = activity.normalizedPowerWatts ?? activity.avgPowerWatts ?? null;
    if (actual && ftpTargetWatts > 0) {
      powerCompliancePct = clampPercent(
        100 - (Math.abs(actual - ftpTargetWatts) / ftpTargetWatts) * 100
      );
    }
  }

  return {
    powerCompliancePct,
    ftpTargetWatts,
    intervalCountPlanned: extractIntervalCount(description),
  };
}

// ─── Kontext für das LLM ─────────────────────────────────────────────────────

interface CompactActivitySheet {
  name: string;
  sport: string;
  date: string;
  durationMin: number;
  distanceKm?: number;
  kcal?: number;
  workKJ?: number;
  hr?: { avg?: number; max?: number };
  power?: {
    avg?: number;
    max?: number;
    np?: number;
    if?: number;
    tss?: number;
    ftpTargetWatts?: number;
    powerCompliancePct?: number;
  };
  cadenceRpm?: number;
  trainingEffect?: { aerobic?: number; anaerobic?: number };
  timeInZonesMin?: number[];
}

function buildCompactSheet(input: DebriefInput): CompactActivitySheet {
  const a = input.activity;
  const adherence = computeAdherence(a, input.planned ?? undefined);
  const zones = a.timeInZonesMin?.filter((z) => z > 0);

  const sheet: CompactActivitySheet = {
    name: a.name,
    sport: a.type,
    date: a.startTime.slice(0, 10),
    durationMin: Math.round(a.durationSeconds / 60),
  };

  if (a.distanceMeters > 0) sheet.distanceKm = Math.round(a.distanceMeters / 100) / 10;
  if (a.caloriesBurned > 0) sheet.kcal = a.caloriesBurned;
  if (a.workKJ) sheet.workKJ = a.workKJ;
  if (a.avgHeartRate || a.maxHeartRate) {
    sheet.hr = {};
    if (a.avgHeartRate) sheet.hr.avg = a.avgHeartRate;
    if (a.maxHeartRate) sheet.hr.max = a.maxHeartRate;
  }
  if (a.avgPowerWatts || a.normalizedPowerWatts || a.tss) {
    sheet.power = {};
    if (a.avgPowerWatts) sheet.power.avg = a.avgPowerWatts;
    if (a.maxPowerWatts) sheet.power.max = a.maxPowerWatts;
    if (a.normalizedPowerWatts) sheet.power.np = a.normalizedPowerWatts;
    if (a.intensityFactor) sheet.power.if = Math.round(a.intensityFactor * 100) / 100;
    if (a.tss) sheet.power.tss = Math.round(a.tss);
    if (adherence.ftpTargetWatts) {
      sheet.power.ftpTargetWatts = adherence.ftpTargetWatts;
      if (adherence.powerCompliancePct != null) {
        sheet.power.powerCompliancePct = adherence.powerCompliancePct;
      }
    }
  }
  if (a.avgCadenceRpm) sheet.cadenceRpm = a.avgCadenceRpm;
  if (a.trainingEffectAerobic || a.trainingEffectAnaerobic) {
    sheet.trainingEffect = {
      aerobic: a.trainingEffectAerobic,
      anaerobic: a.trainingEffectAnaerobic,
    };
  }
  if (zones && zones.length > 0) sheet.timeInZonesMin = zones;

  return sheet;
}

const SYSTEM_INSTRUCTION =
  "Du bist ein präziser, motivierender Hybrid-Athletik-Trainer (Radrennsport + Kraft). " +
  "Antworte AUSSCHLIESSLICH mit dem Debrief-Text: exakt 2 bis 3 kurze Sätze auf Deutsch, " +
  "kein Markdown, keine Emojis, keine Einleitung. Stil: sachlich-positiv, konkret, " +
  "mobile-tauglich. Beziehe dich auf Planned-vs-Actual (Leistungstreue, Intervall-Einhaltung, Pacing) " +
  "und gib EINE klare Handlungsempfehlung für die Erholung/Ernährung (z. B. Kohlenhydrate jetzt). " +
  "Erwähne konkrete Zahlen (Prozent-Treue, kJ, TSS), aber nicht mehr als zwei.";

async function callGeminiDebrief(sheetJson: string, apiKey: string): Promise<string> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Erstelle den Post-Workout-Debrief für diese Einheit.\n" +
                  `Geplantes Workout: ${JSON.stringify(sheetJson)}`,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
      }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini leere Antwort");
  // Hartes Limit: mehr als 3 Sätze werden abgeschnitten
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return sentences.slice(0, 3).join(" ").trim();
}

// ─── Template-Fallback ───────────────────────────────────────────────────────

function buildFallbackDebrief(
  input: DebriefInput,
  adherence: AdherenceStats
): string {
  const a = input.activity;
  const parts: string[] = [];

  const sportLabel =
    a.type === "cycling"
      ? "Einheit"
      : a.type === "running"
        ? "Laufeinheit"
        : a.type === "gym"
          ? "Krafteinheit"
          : "Einheit";
  const headlineBits: string[] = [sportLabel];
  if (a.tss) headlineBits.push(`${Math.round(a.tss)} TSS`);
  parts.push(`${a.name}: ${headlineBits.join(", ")} abgeschlossen.`);

  if (adherence.powerCompliancePct != null) {
    parts.push(
      `Leistungstreue ${adherence.powerCompliancePct} % gegenüber dem Ziel von ` +
        `${adherence.ftpTargetWatts} W` +
        (adherence.intervalCountPlanned ? ` über ${adherence.intervalCountPlanned} Intervalle` : "") +
        "."
    );
  } else if (a.workKJ) {
    parts.push(`Arbeit: ${a.workKJ} kJ${a.normalizedPowerWatts ? ` bei ${a.normalizedPowerWatts} W NP` : ""}.`);
  } else if (a.avgHeartRate) {
    parts.push(`Durchschnittspuls ${a.avgHeartRate} bpm über ${Math.round(a.durationSeconds / 60)} Minuten.`);
  }

  if (input.replenishment && input.replenishment.additionalCarbsG > 0) {
    parts.push(
      `Priorisiere jetzt ~${input.replenishment.additionalCarbsG} g Kohlenhydrate zur Auffüllung ` +
        `(${input.replenishment.energyExpenditureKcal} kcal Verbrauch).`
    );
  } else if (input.loadSnapshot && input.loadSnapshot.tsb <= -15) {
    parts.push("Formkurve fällt – plane morgen eine lockere Einheit oder Ruhetag.");
  }

  return parts.slice(0, 3).join(" ");
}

// ─── Öffentliche API ─────────────────────────────────────────────────────────

function buildStats(
  input: DebriefInput,
  adherence: AdherenceStats
): NonNullable<PostWorkoutDebrief["stats"]> {
  const a = input.activity;
  const stats: NonNullable<PostWorkoutDebrief["stats"]> = [];
  if (adherence.powerCompliancePct != null) {
    stats.push({ label: "Treue", value: `${adherence.powerCompliancePct} %` });
  }
  if (a.normalizedPowerWatts) stats.push({ label: "NP", value: `${a.normalizedPowerWatts} W` });
  else if (a.avgPowerWatts) stats.push({ label: "Ø W", value: `${a.avgPowerWatts}` });
  if (a.workKJ) stats.push({ label: "Arbeit", value: `${a.workKJ} kJ` });
  if (a.tss) stats.push({ label: "TSS", value: String(Math.round(a.tss)) });
  if (input.replenishment && input.replenishment.additionalCarbsG > 0) {
    stats.push({ label: "+CHO", value: `${input.replenishment.additionalCarbsG} g` });
  }
  return stats;
}

/**
 * Debrief erzeugen. Schlägt Gemini fehl/nicht konfiguriert → deterministisches
 * Template. Wirft NICHT – liefert immer ein Ergebnis.
 */
export async function generatePostWorkoutDebrief(
  input: DebriefInput
): Promise<{ debrief: DebriefResult; generator: "ai" | "template"; text: string }> {
  const adherence = computeAdherence(input.activity, input.planned ?? undefined);
  const sheet = buildCompactSheet(input);

  let generator: "ai" | "template" = "template";
  let text = "";

  try {
    const apiKey = await resolveGeminiKeyServer();
    if (apiKey) {
      text = await callGeminiDebrief(JSON.stringify({ ...sheet, planned: input.planned }), apiKey);
      if (/^[^.!?]{3,}/.test(text)) generator = "ai";
    }
  } catch (err) {
    console.error("[debrief] Gemini fehlgeschlagen, nutze Template:", err);
  }

  if (generator === "template" || !text) {
    text = buildFallbackDebrief(input, adherence);
    generator = "template";
  }

  const headlineSource = input.activity.name;
  return {
    generator,
    text,
    debrief: {
      activityId: input.activity.garminId ?? input.activity.id,
      debrief: text,
      headline:
        adherence.powerCompliancePct != null
          ? `${headlineSource} · ${adherence.powerCompliancePct} % Treue`
          : headlineSource,
      stats: buildStats(input, adherence),
      plannedWorkout: input.planned ?? undefined,
    },
  };
}

/** Vollständigen Feed-Eintrag bauen. */
export function toFeedEntry(
  result: { debrief: DebriefResult; generator: "ai" | "template"; text: string },
  input: DebriefInput
): PostWorkoutDebrief {
  return {
    ...result.debrief,
    id: generateId(),
    activityName: input.activity.name,
    date: input.activity.startTime.slice(0, 10),
    createdAt: new Date().toISOString(),
    generator: result.generator,
  };
}
