// ─── AI-Debrief Generator (Gemini, serverseitig) ─────────────────────────────

import type { PowerMetrics } from "@/lib/training/powerMetrics";
import { resolveGeminiKeyServer } from "@/lib/server/geminiKey";

export interface DebriefContext {
  activityName: string;
  activityType: string;
  date: string;
  durationSeconds: number;
  distanceMeters?: number | null;
  avgHeartRate?: number | null;
  metrics: PowerMetrics;
  fatigue: { ctl: number; atl: number; tsb: number };
  plannedDescription?: string;
}

const MODEL = "gemini-2.5-flash";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")} h` : `${m} min`;
}

function buildPrompt(ctx: DebriefContext): string {
  const peaks = ctx.metrics.peakPowers
    .map((p) => {
      const label =
        p.durationSeconds >= 60 ? `${p.durationSeconds / 60} min` : `${p.durationSeconds} s`;
      return `${label}: ${p.watts ?? "–"} W`;
    })
    .join(", ");
  const zones = ctx.metrics.zones
    .filter((z) => z.minutes > 0)
    .map((z) => `${z.name}: ${z.minutes} min`)
    .join(", ");

  return [
    `Aktivität: "${ctx.activityName}" (${ctx.activityType}, ${ctx.date})`,
    `Dauer: ${formatDuration(ctx.durationSeconds)}${
      ctx.distanceMeters ? `, Distanz: ${(ctx.distanceMeters / 1000).toFixed(1)} km` : ""
    }`,
    ctx.avgHeartRate ? `Ø Herzfrequenz: ${ctx.avgHeartRate} bpm` : "",
    `Ø Leistung: ${ctx.metrics.avgPowerWatts ?? "–"} W, NP: ${
      ctx.metrics.normalizedPower ?? "–"
    } W, IF: ${ctx.metrics.intensityFactor ?? "–"}, TSS: ${
      ctx.metrics.trainingStressScore ?? "–"
    }`,
    `Spitzenleistung (${peaks})`,
    zones ? `Zeit in Leistungszonen: ${zones}` : "",
    `Form: CTL ${ctx.fatigue.ctl}, ATL ${ctx.fatigue.atl}, TSB ${ctx.fatigue.tsb}`,
    ctx.plannedDescription ? `Geplante Einheit: ${ctx.plannedDescription}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const SYSTEM_INSTRUCTION =
  "Du bist ein ausgebildeter Ausdauer- und Krafttrainer für Hybrid-Athleten. " +
  "Erstelle einen kompakten Trainings-Debrief auf Deutsch als Markdown (max. 200 Wörter). " +
  "Struktur: **Zusammenfassung**, **Leistungsanalyse** (NP/IF/TSS und Spitzenwerte einordnen), " +
  "**Belastung & Form** (TSS im Kontext von CTL/ATL/TSB), **Empfehlung für die nächsten Tage**. " +
  "Sei konkret, nutze die gelieferten Zahlen, kein Marketing-Geschwafel.";

function fallbackDebrief(ctx: DebriefContext): string {
  const m = ctx.metrics;
  const tsbLabel = ctx.fatigue.tsb >= 5 ? "gut erholt" : ctx.fatigue.tsb <= -10 ? "ermüdet" : "ausbalanciert";
  return [
    `## Zusammenfassung`,
    `${ctx.activityName} über ${formatDuration(ctx.durationSeconds)} mit TSS ${m.trainingStressScore ?? "–"}.`,
    ``,
    `## Leistungsanalyse`,
    `Ø ${m.avgPowerWatts ?? "–"} W · NP ${m.normalizedPower ?? "–"} W · IF ${m.intensityFactor ?? "–"}.`,
    `Bestwerte: ${m.peakPowers.map((p) => `${p.durationSeconds}s ${p.watts ?? "–"}W`).join(", ")}.`,
    ``,
    `## Belastung & Form`,
    `CTL ${ctx.fatigue.ctl} · ATL ${ctx.fatigue.atl} · TSB ${ctx.fatigue.tsb} (${tsbLabel}).`,
    ``,
    `## Empfehlung`,
    ctx.fatigue.tsb <= -10
      ? `Form negativ – morgen Regeneration oder lockere Z1-Z2-Einheit einplanen.`
      : ctx.fatigue.tsb >= 15
        ? `Form frisch – gute Gelegenheit für eine intensive Einheit oder Test.`
        : `Normale Progression fortsetzen, Intensität im geplanten Rahmen halten.`,
  ].join("\n");
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export async function generateActivityDebrief(
  ctx: DebriefContext
): Promise<{ markdown: string; source: "gemini" | "fallback" }> {
  const apiKey = await resolveGeminiKeyServer();
  if (!apiKey) return { markdown: fallbackDebrief(ctx), source: "fallback" };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(ctx) }] }],
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        }),
        signal: AbortSignal.timeout(45_000),
      }
    );

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);

    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new Error("Leere Gemini-Antwort");

    return { markdown: text.trim(), source: "gemini" };
  } catch (err) {
    console.error("[debrief] Gemini fehlgeschlagen, Fallback aktiv:", err);
    return { markdown: fallbackDebrief(ctx), source: "fallback" };
  }
}
