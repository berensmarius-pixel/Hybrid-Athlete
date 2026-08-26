import type {
  EnduranceSession,
  GarminActivity,
  GarminDailyHealth,
  GymSession,
  GymTemplate,
  LoggedSession,
  StravaActivity,
} from "@/types";
import { extractJson, geminiGenerateText } from "@/lib/gemini/client";

export interface WeekRange {
  start: Date;
  end: Date;
  label: string;
}

export interface WeeklyReportInput {
  range?: WeekRange;
  sessions: LoggedSession[];
  garminActivities?: GarminActivity[];
  stravaActivities?: StravaActivity[];
  healthLogs?: Record<string, GarminDailyHealth>;
  gymTemplates?: GymTemplate[];
}

export interface MuscleGroupVolume {
  group: string;
  tonnageKg: number;
  sets: number;
}

export interface WeeklyMetrics {
  label: string;
  rangeStart: string;
  rangeEnd: string;
  bikeHours: number;
  bikeKilojoules: number | null;
  elevationGainMeters: number;
  gymTonnageKg: number;
  gymSets: number;
  avgHrvMs: number | null;
  hrvDays: number;
  totalSleepScore: number;
  sleepDays: number;
  muscleVolumes: MuscleGroupVolume[];
  sessionCounts: { gym: number; cycling: number; running: number };
}

export interface WeeklyAnalysis {
  keyWins: string[];
  fatigueRecoveryBalance: string[];
  nextMicrocycleFocus: string[];
}

const GARMIN_MATCH_TOLERANCE_SECONDS = 300;

const MUSCLE_PATTERNS: Array<[string, RegExp]> = [
  ["Schultern", /shoulder|schulter|overhead ?press|military ?press|seitheben|lateral raise|front raise|arnold|uhren?drück/],
  ["Beine", /squat|knie ?beuge|beinpresse|leg press|leg extension|leg curl|beinbeuger|beinstrecker|lunge|ausfallschritt|deadlift|kreuz ?heben|rdl|hip thrust|calf ?raise|wadenheben|step-?up|hackenschmidt|bulgarian/],
  ["Brust", /bench|bank ?drücken|bankdruck|flieg|fly|chest ?press|push ?up|pushup|liegestütze|liegestuetze|dips?/],
  ["Rücken", /\brow\b|rudern|latzug|lat ?zug|pull ?down|pull ?up|klimmzug|face pull|shrugs?|hyperextension|rückenstrecker|reverse fly/],
  ["Arme", /curl|trizeps|triceps|bizeps|biceps|hammer ?curl|skull ?crusher|franzose|pushdown|kickback|arm ?extension/],
  ["Core", /plank|core|bauch|abs\b|crunch|twist|hollow|sit ?up|ab ?wheel|rollout/],
];

const FALLBACK_MUSCLE_GROUP = "Sonstige";

export function getWeekRange(weekOffset = 0, reference: Date = new Date()): WeekRange {
  const today = reference;
  const jsDay = today.getDay();
  const toMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + toMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const label =
    weekOffset === 0
      ? "Diese Woche"
      : weekOffset === -1
        ? "Letzte Woche"
        : `${monday.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${sunday.toLocaleDateString(
            "de-DE",
            { day: "2-digit", month: "2-digit", year: "numeric" }
          )}`;

  return { start: monday, end: sunday, label };
}

export function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;
  const parts = duration.trim().split(":").map((p) => Number(p));
  if (parts.length === 0 || parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function localDateKey(isoOrDate: string | Date): string {
  if (typeof isoOrDate === "string") return isoOrDate.slice(0, 10);
  const d = isoOrDate;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function isSameRide(dateA: string, secsA: number, dateB: string, secsB: number): boolean {
  if (dateA !== dateB) return false;
  return Math.abs(secsA - secsB) <= GARMIN_MATCH_TOLERANCE_SECONDS;
}

function buildMuscleLookup(gymTemplates: GymTemplate[] | undefined): Map<string, string> {
  const lookup = new Map<string, string>();
  if (!gymTemplates) return lookup;
  for (const template of gymTemplates) {
    for (const exercise of template.exercises ?? []) {
      if (!exercise.muscleGroup) continue;
      const name = exercise.name?.trim().toLowerCase();
      if (name) lookup.set(name, exercise.muscleGroup);
    }
  }
  return lookup;
}

export function resolveMuscleGroup(exerciseName: string, lookup: Map<string, string>): string {
  const raw = exerciseName?.trim().toLowerCase() ?? "";
  if (!raw) return FALLBACK_MUSCLE_GROUP;
  const fromTemplate = lookup.get(raw);
  if (fromTemplate) return fromTemplate;
  const normalized = raw.replace(/[-_/]+/g, " ");
  for (const [group, pattern] of MUSCLE_PATTERNS) {
    if (pattern.test(normalized)) return group;
  }
  return FALLBACK_MUSCLE_GROUP;
}

export function aggregateWeeklyMetrics(input: WeeklyReportInput): WeeklyMetrics {
  const range = input.range ?? getWeekRange();
  const { start, end } = range;

  const sessionsInRange = input.sessions.filter((s) => {
    const d = new Date(s.date);
    return d >= start && d <= end;
  });

  const stravaInRange = (input.stravaActivities ?? []).filter((a) => {
    const d = new Date(a.start_date_local);
    return d >= start && d <= end;
  });

  const garminInRange = (input.garminActivities ?? []).filter((a) => {
    const d = new Date(a.startTime);
    return d >= start && d <= end;
  });

  const cyclingSessions = sessionsInRange.filter(
    (s) => s.kind === "endurance" && s.activityType === "cycling"
  ) as EnduranceSession[];
  const runningSessions = sessionsInRange.filter(
    (s) => s.kind === "endurance" && s.activityType === "running"
  );
  const gymSessions = sessionsInRange.filter((s) => s.kind === "gym") as GymSession[];

  const stravaById = new Map(stravaInRange.map((a) => [String(a.id), a]));
  const usedGarminIds = new Set<string>();

  let bikeSeconds = 0;
  let elevationMeters = 0;
  let kilojoules = 0;
  let hasPowerData = false;

  for (const session of cyclingSessions) {
    const secs = parseDurationToSeconds(session.duration);
    bikeSeconds += secs;
    const sessionDateKey = localDateKey(session.date);

    if (session.stravaId != null) {
      const stravaActivity = stravaById.get(String(session.stravaId));
      if (stravaActivity) elevationMeters += stravaActivity.total_elevation_gain || 0;
      continue;
    }

    const garminMatch = garminInRange.find(
      (g) =>
        g.type === "cycling" &&
        !usedGarminIds.has(g.id) &&
        isSameRide(localDateKey(g.startTime), g.durationSeconds, sessionDateKey, secs)
    );
    if (garminMatch) {
      usedGarminIds.add(garminMatch.id);
      elevationMeters += garminMatch.elevationGainMeters ?? 0;
      if (typeof garminMatch.avgPowerWatts === "number" && garminMatch.avgPowerWatts > 0) {
        hasPowerData = true;
        kilojoules += (garminMatch.avgPowerWatts * garminMatch.durationSeconds) / 1000;
      }
    }
  }

  for (const activity of garminInRange) {
    if (activity.type !== "cycling" || usedGarminIds.has(activity.id)) continue;
    usedGarminIds.add(activity.id);
    bikeSeconds += activity.durationSeconds;
    elevationMeters += activity.elevationGainMeters ?? 0;
    if (typeof activity.avgPowerWatts === "number" && activity.avgPowerWatts > 0) {
      hasPowerData = true;
      kilojoules += (activity.avgPowerWatts * activity.durationSeconds) / 1000;
    }
  }

  for (const activity of stravaInRange) {
    const isCycling = !(activity.sport_type === "Run" || activity.type === "Run");
    if (!isCycling) continue;
    const referencedBySession = cyclingSessions.some(
      (s) => s.stravaId != null && String(s.stravaId) === String(activity.id)
    );
    if (referencedBySession) continue;

    const matchedGarmin = garminInRange.find(
      (g) =>
        usedGarminIds.has(g.id) &&
        isSameRide(localDateKey(g.startTime), g.durationSeconds, localDateKey(activity.start_date_local), activity.moving_time)
    );
    if (matchedGarmin) continue;

    bikeSeconds += activity.moving_time;
    elevationMeters += activity.total_elevation_gain || 0;
  }

  let gymTonnage = 0;
  let gymSets = 0;
  const muscleTotals = new Map<string, { tonnage: number; sets: number }>();
  const muscleLookup = buildMuscleLookup(input.gymTemplates);

  for (const session of gymSessions) {
    for (const entry of session.entries) {
      const group = resolveMuscleGroup(entry.exercise, muscleLookup);
      const bucket = muscleTotals.get(group) ?? { tonnage: 0, sets: 0 };
      for (const set of entry.sets) {
        if (!set.isCompleted) continue;
        const weight = Number(set.weight) || 0;
        const reps = Number(set.reps) || 0;
        if (!weight || !reps) continue;
        const volume = weight * reps;
        gymTonnage += volume;
        gymSets += 1;
        bucket.tonnage += volume;
        bucket.sets += 1;
      }
      muscleTotals.set(group, bucket);
    }
  }

  const muscleVolumes: MuscleGroupVolume[] = [...muscleTotals.entries()]
    .map(([group, v]) => ({ group, tonnageKg: Math.round(v.tonnage), sets: v.sets }))
    .sort((a, b) => b.tonnageKg - a.tonnageKg);

  const startKey = localDateKey(start);
  const endKey = localDateKey(end);
  const hrvValues: number[] = [];
  const sleepScores: number[] = [];
  for (const health of Object.values(input.healthLogs ?? {})) {
    if (!health?.date) continue;
    const key = localDateKey(health.date);
    if (key < startKey || key > endKey) continue;
    if (typeof health.hrvLastNightMs === "number") {
      hrvValues.push(health.hrvLastNightMs);
    } else if (typeof health.hrvWeeklyAvgMs === "number") {
      hrvValues.push(health.hrvWeeklyAvgMs);
    }
    if (typeof health.sleepScore === "number") sleepScores.push(health.sleepScore);
  }

  return {
    label: range.label,
    rangeStart: startKey,
    rangeEnd: localDateKey(end),
    bikeHours: Math.round((bikeSeconds / 3600) * 10) / 10,
    bikeKilojoules: hasPowerData ? Math.round(kilojoules) : null,
    elevationGainMeters: Math.round(elevationMeters),
    gymTonnageKg: Math.round(gymTonnage),
    gymSets,
    avgHrvMs: hrvValues.length > 0 ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length) : null,
    hrvDays: hrvValues.length,
    totalSleepScore: sleepScores.reduce((a, b) => a + b, 0),
    sleepDays: sleepScores.length,
    muscleVolumes,
    sessionCounts: {
      gym: gymSessions.length,
      cycling: cyclingSessions.length,
      running: runningSessions.length,
    },
  };
}

export function coerceWeeklyAnalysis(raw: unknown): WeeklyAnalysis {
  const obj = raw as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") {
    throw new Error("Analyse-Antwort hatte kein gültiges Format.");
  }

  const toStringArray = (value: unknown, field: string): string[] => {
    if (!Array.isArray(value)) throw new Error(`Feld "${field}" fehlt in der Analyse.`);
    const cleaned = value
      .filter((item): item is string => typeof item === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (cleaned.length === 0) throw new Error(`Feld "${field}" ist leer.`);
    return cleaned;
  };

  return {
    keyWins: toStringArray(obj.keyWins, "keyWins"),
    fatigueRecoveryBalance: toStringArray(obj.fatigueRecoveryBalance, "fatigueRecoveryBalance"),
    nextMicrocycleFocus: toStringArray(obj.nextMicrocycleFocus, "nextMicrocycleFocus"),
  };
}

export function formatMetricsForPrompt(metrics: WeeklyMetrics): string {
  const lines = [
    `Zeitraum: ${metrics.label} (${metrics.rangeStart} bis ${metrics.rangeEnd})`,
    `Radfahren: ${metrics.bikeHours} h${metrics.bikeKilojoules != null ? `, ${metrics.bikeKilojoules} kJ Arbeit` : ", keine Leistungsmessung"} , ${metrics.elevationGainMeters} Höhenmeter`,
    `Kraft: ${metrics.gymTonnageKg.toLocaleString("de-DE")} kg Tonnage über ${metrics.gymSets} Sätze (${metrics.sessionCounts.gym} Einheiten)`,
    `Volumen je Muskelgruppe: ${
      metrics.muscleVolumes.length > 0
        ? metrics.muscleVolumes.map((m) => `${m.group}: ${m.tonnageKg.toLocaleString("de-DE")} kg / ${m.sets} Sätze`).join(" | ")
        : "keine Daten"
    }`,
    `HRV: ${metrics.avgHrvMs != null ? `Ø ${metrics.avgHrvMs} ms über ${metrics.hrvDays} Nächte` : "keine Daten"}`,
    `Schlaf: Summe Sleep Score ${metrics.totalSleepScore} über ${metrics.sleepDays} Tage${
      metrics.sleepDays > 0 ? ` (Ø ${Math.round(metrics.totalSleepScore / metrics.sleepDays)}/Nacht)` : ""
    }`,
    `Einheiten gesamt: ${metrics.sessionCounts.cycling} Rad, ${metrics.sessionCounts.running} Lauf, ${metrics.sessionCounts.gym} Kraft`,
  ];
  return lines.join("\n");
}

export function buildAnalysisPrompt(metrics: WeeklyMetrics): string {
  return [
    "Du bist ein datengetriebener Hybrid-Coaching-Analyst (Kraft + Ausdauer + Erholung).",
    "Analysiere den folgenden Wochenbericht eines Athleten.",
    "",
    "=== WOCHENBERICHT ===",
    formatMetricsForPrompt(metrics),
    "=== ENDE BERICHT ===",
    "",
    "Erstelle genau drei Sektionen:",
    "1. keyWins – Key Wins & Highlights: die stärksten Leistungen und Fortschritte der Woche.",
    "2. fatigueRecoveryBalance – Fatigue & Recovery Balance: Interpretation von HRV, Schlaf und Belastung; ehrliche Warnsignale bei Überlastung.",
    "3. nextMicrocycleFocus – Strategic Focus for Next Microcycle: 2–4 konkrete, priorisierte Handlungen für die kommende Mikrozyklus-Woche.",
    "",
    "Regeln:",
    "- Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt (kein Markdown, kein Text davor/danach):",
    '{"keyWins": ["..."], "fatigueRecoveryBalance": ["..."], "nextMicrocycleFocus": ["..."]}',
    "- 2 bis 4 prägnante Bullets pro Sektion, auf Deutsch, du-Form.",
    "- Referenziere konkrete Zahlen aus dem Bericht, wo sinnvoll.",
    "- Erfinde keine Daten, die nicht im Bericht stehen.",
  ].join("\n");
}

export async function generateWeeklyAnalysis(metrics: WeeklyMetrics): Promise<WeeklyAnalysis> {
  const raw = await geminiGenerateText(buildAnalysisPrompt(metrics));
  return coerceWeeklyAnalysis(extractJson(raw));
}

export function formatWeeklyReportText(
  metrics: WeeklyMetrics,
  analysis?: WeeklyAnalysis | null
): string {
  const lines: string[] = [
    `📊 HYBRID ATHLETE WOCHENBERICHT: ${metrics.label}`,
    `(${metrics.rangeStart} – ${metrics.rangeEnd})`,
    `==========================================`,
    ``,
    `🚴 Radfahren: ${metrics.bikeHours}h${
      metrics.bikeKilojoules != null ? ` | ${metrics.bikeKilojoules.toLocaleString("de-DE")} kJ` : ""
    } | +${metrics.elevationGainMeters} Hm`,
    `🏋️ Kraft: ${metrics.gymTonnageKg.toLocaleString("de-DE")} kg Tonnage | ${metrics.gymSets} Sätze | ${metrics.sessionCounts.gym} Einheiten`,
    metrics.muscleVolumes.length > 0
      ? `💪 Volumen: ${metrics.muscleVolumes.map((m) => `${m.group} ${m.tonnageKg.toLocaleString("de-DE")}kg`).join(" · ")}`
      : null,
    `❤️ HRV: ${metrics.avgHrvMs != null ? `Ø ${metrics.avgHrvMs} ms (${metrics.hrvDays} Nächte)` : "keine Daten"}`,
    `😴 Schlaf: Sleep-Score Σ ${metrics.totalSleepScore} (${metrics.sleepDays} Tage)`,
    ``,
  ].filter((line): line is string => line !== null);

  if (analysis) {
    lines.push(`🏆 Key Wins & Highlights`);
    for (const win of analysis.keyWins) lines.push(`  • ${win}`);
    lines.push(``, `⚖️ Fatigue & Recovery Balance`);
    for (const point of analysis.fatigueRecoveryBalance) lines.push(`  • ${point}`);
    lines.push(``, `🎯 Strategischer Fokus nächste Mikrozyklus-Woche`);
    for (const focus of analysis.nextMicrocycleFocus) lines.push(`  • ${focus}`);
    lines.push(``);
  }

  lines.push(`Erstellt mit Hybrid Athlete AI`);
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPrintableHtml(
  metrics: WeeklyMetrics,
  analysis?: WeeklyAnalysis | null
): string {
  const metricRows: Array<[string, string]> = [
    ["Radfahren", `${metrics.bikeHours} h`],
    ["Arbeit (kJ)", metrics.bikeKilojoules != null ? `${metrics.bikeKilojoules.toLocaleString("de-DE")} kJ` : "–"],
    ["Höhenmeter", `+${metrics.elevationGainMeters} m`],
    ["Gym-Tonnage", `${metrics.gymTonnageKg.toLocaleString("de-DE")} kg (${metrics.gymSets} Sätze)`],
    ["Ø HRV", metrics.avgHrvMs != null ? `${metrics.avgHrvMs} ms (${metrics.hrvDays} Nächte)` : "keine Daten"],
    ["Sleep Score Σ", `${metrics.totalSleepScore} (${metrics.sleepDays} Tage)`],
  ];

  const muscleSection =
    metrics.muscleVolumes.length > 0
      ? `<h2>Volumen je Muskelgruppe</h2><table><thead><tr><th>Muskelgruppe</th><th>Tonnage</th><th>Sätze</th></tr></thead><tbody>${muscleRows(
          metrics
        )}</tbody></table>`
      : "";

  const analysisSection = analysis
    ? `<h2>Key Wins &amp; Highlights</h2><ul>${analysis.keyWins.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
<h2>Fatigue &amp; Recovery Balance</h2><ul>${analysis.fatigueRecoveryBalance
        .map((s) => `<li>${escapeHtml(s)}</li>`)
        .join("")}</ul>
<h2>Strategic Focus for Next Microcycle</h2><ul>${analysis.nextMicrocycleFocus
        .map((s) => `<li>${escapeHtml(s)}</li>`)
        .join("")}</ul>`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><title>Wochenbericht ${escapeHtml(metrics.label)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 40px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #555; font-size: 13px; margin-bottom: 24px; }
  h2 { font-size: 15px; margin-top: 28px; border-bottom: 2px solid #2563eb; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; }
  li { font-size: 13px; line-height: 1.6; }
  footer { margin-top: 32px; color: #888; font-size: 11px; }
</style></head>
<body>
<h1>📊 Wochenbericht – Hybrid Athlete</h1>
<div class="sub">${escapeHtml(metrics.label)} · ${escapeHtml(metrics.rangeStart)} – ${escapeHtml(metrics.rangeEnd)}</div>
<h2>Kennzahlen</h2>
<table><tbody>${metricRows
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join("")}</tbody></table>
${muscleSection}
${analysisSection}
<footer>Erstellt mit Hybrid Athlete AI · ${new Date().toLocaleDateString("de-DE")}</footer>
</body></html>`;
}

function muscleRows(metrics: WeeklyMetrics): string {
  return metrics.muscleVolumes
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.group)}</td><td>${m.tonnageKg.toLocaleString("de-DE")} kg</td><td>${m.sets}</td></tr>`
    )
    .join("");
}

export function exportWeeklyReportPdf(
  metrics: WeeklyMetrics,
  analysis?: WeeklyAnalysis | null
): void {
  if (typeof window === "undefined") return;
  const printWindow = window.open("", "_blank", "width=800,height=900");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(buildPrintableHtml(metrics, analysis));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function buildEmailSummary(
  metrics: WeeklyMetrics,
  analysis?: WeeklyAnalysis | null
): { subject: string; body: string; mailtoUrl: string } {
  const subject = `📊 Wochenbericht ${metrics.label} – Hybrid Athlete`;
  const body = formatWeeklyReportText(metrics, analysis);
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    body.length > 1800 ? `${body.slice(0, 1800)}\n\n[…]` : body
  )}`;
  return { subject, body, mailtoUrl };
}

export function openWeeklyReportEmail(
  metrics: WeeklyMetrics,
  analysis?: WeeklyAnalysis | null
): void {
  if (typeof window === "undefined") return;
  const { mailtoUrl } = buildEmailSummary(metrics, analysis);
  window.location.href = mailtoUrl;
}

export function isSundayEvening(now: Date = new Date()): boolean {
  return now.getDay() === 0 && now.getHours() >= 16;
}
