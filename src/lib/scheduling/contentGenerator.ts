import type {
  ImpactLevel,
  IntensityTier,
  SessionBlueprint,
  SessionCategory,
  SessionSport,
} from "./types";
import { VALID_CATEGORIES } from "./types";
import { CATEGORY_LABELS_DE } from "./types";

export interface ContentGeneratorInput {
  goal: string;
  weekly_hours: number;
  focus?: string;
  existing_plan_titles?: string[];
}

const SPORTS: readonly SessionSport[] = ["gym", "cycling", "running", "mobility"];

const LEG_MUSCLES = new Set([
  "quads",
  "quadriceps",
  "hamstrings",
  "glutes",
  "legs",
  "beine",
]);

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "session"
  );
}

function normalizeTier(raw: unknown): IntensityTier {
  const value = String(raw ?? "").trim().toLowerCase();
  if (["high", "hoch", "max", "max-effort"].includes(value)) return "High";
  if (["med", "medium", "mittel", "middle", "moderate"].includes(value)) return "Med";
  if (["low", "niedrig", "leicht"].includes(value)) return "Low";
  return "Med";
}

function normalizeImpact(raw: unknown): ImpactLevel {
  const value = String(raw ?? "").trim().toLowerCase();
  if (["high", "hoch"].includes(value)) return "High";
  if (["low", "niedrig", "gering"].includes(value)) return "Low";
  return "Low";
}

function inferCategory(
  sport: SessionSport | null,
  tier: IntensityTier,
  duration: number,
  muscles: string[]
): SessionCategory {
  const hasHeavyLegs = muscles.some((m) => LEG_MUSCLES.has(m));
  if (sport === "gym") {
    if (tier === "High" && hasHeavyLegs) return "strength_heavy_lower";
    return "strength_upper";
  }
  if (sport === "mobility" || sport === null) return "recovery";
  if (duration >= 90) return "endurance_long";
  if (tier === "High") return "intervals_high";
  if (tier === "Low" && duration <= 45) return "recovery";
  return "endurance_low";
}

function inferSport(category: SessionCategory): SessionSport {
  switch (category) {
    case "strength_heavy_lower":
    case "strength_upper":
      return "gym";
    case "intervals_high":
    case "endurance_long":
    case "endurance_low":
      return "cycling";
    case "recovery":
      return "mobility";
  }
}

export function buildContentPrompt(input: ContentGeneratorInput): string {
  const hours = Math.max(2, Math.min(30, Number(input.weekly_hours) || 8));
  const focus = (input.focus ?? "").trim();
  const existing = (input.existing_plan_titles ?? []).filter(Boolean).slice(0, 7);

  return [
    "Du bist ein Hybrid-Athlete Trainingsplaner (Kraft + Ausdauer).",
    "Erstelle die Trainingseinheiten (Microcycle) für EINE Woche als reines JSON-Array.",
    "",
    `Ziel des Athleten: ${input.goal}`,
    `Verfügbares wöchentliches Trainingsbudget: ${hours} Stunden`,
    focus ? `Fokus/Sonderwünsche: ${focus}` : "",
    existing.length > 0 ? `Bestehende Einheiten der letzten Woche (als Referenz): ${existing.join(", ")}` : "",
    "",
    "Anforderungen:",
    "- 4 bis 7 Einheiten pro Woche.",
    "- Kombiniere Kraft (schwerer Unterkörper, Oberkörper) und Ausdauer (VO2max/Threshold-Intervalle, Zone-2-Langeinheit, Recovery).",
    "- Keine zwei schweren Unterkörper-Einheiten an aufeinanderfolgenden Tagen (48h-Regeneration).",
    "",
    'Schema pro Einheit: {"title": string, "sport": "gym"|"cycling"|"running"|"mobility", "category": "strength_heavy_lower"|"strength_upper"|"intervals_high"|"endurance_long"|"endurance_low"|"recovery", "duration_min": number, "intensity_tier": "High"|"Med"|"Low", "target_muscle_groups": string[], "aerobic_impact": "High"|"Low", "priority": number (1=wichtigste … 5=verzichtbar), "notes": string}',
    "notes enthalten die konkrete Interval-/Satzstruktur (z. B. „5x3 Min @ 120% FTP, 3 Min Pause“ bzw. Übungen+Sätze).",
    "",
    "Antworte AUSSCHLIESSLICH mit dem JSON-Array, kein Markdown, keine Erklärung.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeBlueprints(raw: unknown): SessionBlueprint[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.sessions)) list = obj.sessions;
    else if (Array.isArray(obj.plan)) list = obj.plan;
    else if (Array.isArray(obj.workouts)) list = obj.workouts;
  }

  const blueprints: SessionBlueprint[] = [];
  for (const item of list.slice(0, 12)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const b = item as Record<string, unknown>;

    const title =
      typeof b.title === "string" && b.title.trim()
        ? b.title.trim().slice(0, 80)
        : "";

    const rawCategory = String(b.category ?? "").trim();
    const categoryValid = (VALID_CATEGORIES as readonly string[]).includes(rawCategory);
    const durationNum = Number(b.duration_min);

    const hasAnySignal =
      title.length > 0 || categoryValid || Number.isFinite(durationNum) || "sport" in b;
    if (!hasAnySignal) continue;

    const rawSport = String(b.sport ?? "").trim() as SessionSport;
    const validSport = SPORTS.includes(rawSport) ? rawSport : null;

    const duration = Number.isFinite(durationNum)
      ? Math.max(15, Math.min(300, Math.round(durationNum / 5) * 5))
      : 60;

    const tier = normalizeTier(b.intensity_tier);
    const impact = normalizeImpact(b.aerobic_impact);

    const muscles = Array.isArray(b.target_muscle_groups)
      ? b.target_muscle_groups
          .filter((m): m is string => typeof m === "string")
          .map((m) => m.trim().toLowerCase())
          .filter((m) => m.length > 1)
          .slice(0, 6)
      : [];

    const priorityNum = Number(b.priority);
    const priority = Number.isFinite(priorityNum)
      ? Math.max(1, Math.min(5, Math.round(priorityNum)))
      : 3;

    const category: SessionCategory = categoryValid
      ? (rawCategory as SessionCategory)
      : inferCategory(validSport, tier, duration, muscles);
    const sport: SessionSport = validSport ?? inferSport(category);

    blueprints.push({
      id: typeof b.id === "string" && b.id.trim() ? slugify(b.id) : `${slugify(title || category)}-${blueprints.length + 1}`,
      title: title || CATEGORY_LABELS_DE[category],
      sport,
      category,
      duration_min: duration,
      intensity_tier: tier,
      target_muscle_groups: muscles,
      aerobic_impact: impact,
      priority,
      notes: typeof b.notes === "string" ? b.notes.slice(0, 400) : undefined,
    });
  }

  const seen = new Set<string>();
  return blueprints.filter((bp) => {
    if (seen.has(bp.id)) return false;
    seen.add(bp.id);
    return true;
  });
}
