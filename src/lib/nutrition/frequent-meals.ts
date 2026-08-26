// ─── Frequent Meals Aggregator (Quick-Log) ────────────────────────────────────
// Analysiert die Ernährungs-Logs der letzten 30 Tage und rankt die häufigsten
// Mahlzeiten nach Tageszeit-Kontext: Frühstücksfavoriten steigen morgens auf,
// Post-Workout-Mahlzeiten in den ~3 h nach einer Trainingseinheit.
// Bewusst rein funktional ohne React/Storage – dadurch unit-testbar.

import { calculateNutrients } from "@/lib/nutritionApi";
import { getLocalDateString } from "@/lib/utils";
import type { DailyNutritionLog, FoodItem, MealEntry, MealType } from "@/types";

// ─── Typen ────────────────────────────────────────────────────────────────────

/** Grobe Tageszeit-Blöcke für den Kontext-Rank. */
export type TimeBucket = "morning" | "midday" | "afternoon" | "evening";

export interface FrequentMealMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FrequentMeal {
  /** Stabiliser Gruppierungs-Schlüssel (Name + Marke, normalisiert). */
  key: string;
  /** Repräsentatives FoodItem der häufigsten Variante. */
  food: FoodItem;
  /** Anzahl Logs im Zeitfenster. */
  count: number;
  /** Standard-Portion (Median aller Mengen, auf 5 g gerundet). */
  defaultAmount: number;
  /** Makros für die Standard-Portion. */
  macros: FrequentMealMacros;
  /** Historisch häufigster MealType. */
  dominantMealType: MealType;
  /** Durchschnittliche Log-Uhrzeit als Minute des Tages (0–1439). */
  typicalMinute: number;
  /** typische Uhrzeit formatiert, z. B. "07:30". */
  typicalTimeLabel: string;
  /** Datum des letzten Logs (YYYY-MM-DD). */
  lastLoggedDate: string;
  /** Anteil der Logs im Post-Workout-Fenster (0–1). */
  postWorkoutAffinity: number;
  /** Kontext-Score für die aktuelle Tageszeit (höher = relevanter). */
  contextScore: number;
}

export interface FrequentMealsOptions {
  now?: Date;
  /** Analyse-Fenster in Tagen (Standard: 30). */
  days?: number;
  /** Maximale Anzahl Ergebnisse (Standard: 10). */
  limit?: number;
  /** YYYY-MM-DD → ISO-Startzeiten der Trainings an diesem Tag. */
  workoutsByDate?: Record<string, string[]>;
}

// ─── Konstanten & Grenzen ─────────────────────────────────────────────────────

export const DEFAULT_DAYS = 30;
export const DEFAULT_LIMIT = 10;

const CONTEXT_MATCH_WEIGHT = 0.6; // Bonus je Anteil an Vorkommen im aktuellen Block
const RECENCY_WINDOW_DAYS = 7; // zuletzt geloggte Mahlzeiten bekommen Boost
const RECENCY_FACTOR = 1.2;
const POSTWORKOUT_AFFINITY_WEIGHT = 1; // Multiplikator-Bonus wenn jetzt Post-Workout

/** Fenster um einen Trainingsstart (Minuten), in dem ein Log als Post-Workout gilt. */
const POSTWORKOUT_WINDOW_BEFORE_MIN = 20;
const POSTWORKOUT_WINDOW_AFTER_MIN = 180;

/** Obergrenzen (exklusiv) der Blöcke: <11h · <15h · <17:30h · sonst evening. */
const BUCKET_BOUNDS: Array<{ bucket: TimeBucket; untilMinute: number }> = [
  { bucket: "morning", untilMinute: 11 * 60 },
  { bucket: "midday", untilMinute: 15 * 60 },
  { bucket: "afternoon", untilMinute: 17 * 60 + 30 },
];

const MEALTYPE_FALLBACK_BUCKET: Record<MealType, TimeBucket> = {
  breakfast: "morning",
  lunch: "midday",
  dinner: "evening",
  snack: "afternoon",
};

const MEALTYPE_FALLBACK_MINUTE: Record<MealType, number> = {
  breakfast: 8 * 60,
  lunch: 12 * 60 + 30,
  dinner: 19 * 60,
  snack: 16 * 60,
};

// ─── Zeit-Helfer ──────────────────────────────────────────────────────────────

/**
 * Parst `loggedAt` defensiv zu einer Minute des Tages.
 * Akzeptiert "HH:mm" (de-DE) sowie ISO-Strings; alles andere → null.
 */
export function parseLoggedAtToMinute(loggedAt: string | undefined | null): number | null {
  if (!loggedAt || typeof loggedAt !== "string") return null;
  const trimmed = loggedAt.trim();
  const hhmm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (h <= 23 && m <= 59) return h * 60 + m;
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getHours() * 60 + parsed.getMinutes();
}

/** Minute des Tages für ein Date-Objekt (lokal). */
export function minuteOfDayFromDate(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Ordnet eine Minute des Tages einem groben Tageszeit-Block zu. */
export function getTimeOfDayBucket(minuteOfDay: number): TimeBucket {
  for (const { bucket, untilMinute } of BUCKET_BOUNDS) {
    if (minuteOfDay < untilMinute) return bucket;
  }
  return "evening";
}

/** Leitet aus der aktuellen Uhrzeit den passenden MealType zum Loggen ab. */
export function inferMealTypeFromTime(minuteOfDay: number): MealType {
  switch (getTimeOfDayBucket(minuteOfDay)) {
    case "morning":
      return "breakfast";
    case "midday":
      return "lunch";
    case "afternoon":
      return "snack";
    case "evening":
      return "dinner";
  }
}

/** Minute → "HH:mm". */
export function formatMinuteAsTime(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60) % 24;
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function shiftLocalDateString(base: Date, deltaDays: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
  return getLocalDateString(d);
}

/** Ganztage zwischen zwei lokalen Datums-Strings (b - a). */
function daysBetweenLocal(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split("-").map(Number);
  const [ty, tm, td] = toDateStr.split("-").map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return Number.POSITIVE_INFINITY;
  const from = new Date(fy, fm - 1, fd).getTime();
  const to = new Date(ty, tm - 1, td).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function toWorkoutMinutesByDate(
  workoutsByDate: Record<string, string[]>
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const [date, starts] of Object.entries(workoutsByDate)) {
    const minutes = (starts ?? [])
      .map((iso) => parseLoggedAtToMinute(iso))
      .filter((m): m is number => m != null);
    if (minutes.length > 0) map.set(date, minutes);
  }
  return map;
}

function isInPostWorkoutWindow(nowMinute: number, workoutStarts: number[]): boolean {
  return workoutStarts.some(
    (w) =>
      nowMinute - w >= -POSTWORKOUT_WINDOW_BEFORE_MIN &&
      nowMinute - w <= POSTWORKOUT_WINDOW_AFTER_MIN
  );
}

/**
 * True, wenn `now` innerhalb des Post-Workout-Fensters eines heutigen
 * Trainings liegt (~20 min davor bis ~3 h danach).
 */
export function isWithinPostWorkoutWindow(
  now: Date,
  workoutsByDate: Record<string, string[]>
): boolean {
  const todayStr = getLocalDateString(now);
  const minutesByDate = toWorkoutMinutesByDate({ [todayStr]: workoutsByDate[todayStr] ?? [] });
  const starts = minutesByDate.get(todayStr);
  if (!starts || starts.length === 0) return false;
  return isInPostWorkoutWindow(minuteOfDayFromDate(now), starts);
}

// ─── Gruppierung & Aggregation ────────────────────────────────────────────────

/**
 * Identität einer Mahlzeit über Name + Marke – bewusst NICHT über die ID:
 * Quick-Adds (`quickAddCalories`) erzeugen bei jedem Log eine neue ID,
 * während derselbe OFF-Barcode je nach Quelle unterschiedlich ankommen kann.
 */
function getMealKey(food: FoodItem): string {
  const name = (food.name ?? "").trim().toLowerCase();
  const brand = (food.brand ?? "").trim().toLowerCase();
  return `${name}|${brand}`;
}

interface Occurrence {
  entry: MealEntry;
  date: string;
  minute: number | null;
}

interface MealGroup {
  variantCounts: Map<string, { food: FoodItem; count: number }>;
  occurrences: Occurrence[];
  amounts: number[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median-Portion auf 5 g runden; ungültige Werte auf 100 g zurückfallen lassen. */
function normalizePortion(amount: number): number {
  const rounded = Math.round(amount / 5) * 5;
  return rounded > 0 ? rounded : 100;
}

/**
 * Aggregiert die letzten `days` Tage und liefert die Top-Mahlzeiten,
 * kontextgewichtet für die aktuelle Uhrzeit bzw. Post-Workout-Situation.
 */
export function getFrequentMeals(
  logs: DailyNutritionLog[],
  options: FrequentMealsOptions = {}
): FrequentMeal[] {
  const now = options.now ?? new Date();
  const days = options.days ?? DEFAULT_DAYS;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const todayStr = getLocalDateString(now);
  const cutoffStr = shiftLocalDateString(now, -(days - 1));

  const workoutMinutesByDate = toWorkoutMinutesByDate(options.workoutsByDate ?? {});

  const isPostWorkoutOccurrence = (date: string, minute: number | null): boolean => {
    if (minute == null) return false;
    const starts = workoutMinutesByDate.get(date);
    if (!starts || starts.length === 0) return false;
    return starts.some(
      (w) =>
        minute - w >= -POSTWORKOUT_WINDOW_BEFORE_MIN &&
        minute - w <= POSTWORKOUT_WINDOW_AFTER_MIN
    );
  };

  // ── 1. Entries im Zeitfenster sammeln & gruppieren ──────────────────────────
  const groups = new Map<string, MealGroup>();
  for (const log of logs ?? []) {
    if (!log || typeof log.date !== "string") continue;
    if (log.date < cutoffStr || log.date > todayStr) continue;
    for (const entry of log.entries ?? []) {
      if (!entry?.food) continue;
      const key = getMealKey(entry.food);
      let group = groups.get(key);
      if (!group) {
        group = { variantCounts: new Map(), occurrences: [], amounts: [] };
        groups.set(key, group);
      }
      const variantId = entry.food.id ?? key;
      const variant = group.variantCounts.get(variantId);
      if (variant) {
        variant.count += 1;
      } else {
        group.variantCounts.set(variantId, { food: entry.food, count: 1 });
      }
      group.occurrences.push({
        entry,
        date: log.date,
        minute: parseLoggedAtToMinute(entry.loggedAt),
      });
      if (typeof entry.amount === "number" && entry.amount > 0) {
        group.amounts.push(entry.amount);
      }
    }
  }

  // ── 2. Kontext-Basiswerte ───────────────────────────────────────────────────
  const currentBucket = getTimeOfDayBucket(minuteOfDayFromDate(now));
  const todayWorkoutStarts = workoutMinutesByDate.get(todayStr) ?? [];
  const isPostWorkoutNow =
    todayWorkoutStarts.length > 0 && isInPostWorkoutWindow(minuteOfDayFromDate(now), todayWorkoutStarts);

  // ── 3. Je Gruppe aggregieren & scoren ───────────────────────────────────────
  const meals: FrequentMeal[] = [];
  for (const [key, group] of groups) {
    const count = group.occurrences.length;
    if (count === 0) continue;

    // Häufigste Variante als Repräsentant
    let food: FoodItem | null = null;
    let bestVariantCount = -1;
    for (const variant of group.variantCounts.values()) {
      if (variant.count > bestVariantCount) {
        bestVariantCount = variant.count;
        food = variant.food;
      }
    }
    if (!food) continue;

    const defaultAmount = normalizePortion(median(group.amounts));

    // Dominanter MealType
    const typeCounts = new Map<MealType, number>();
    for (const occ of group.occurrences) {
      typeCounts.set(occ.entry.mealType, (typeCounts.get(occ.entry.mealType) ?? 0) + 1);
    }
    let dominantMealType: MealType = "snack";
    let dominantCount = -1;
    for (const [type, c] of typeCounts) {
      if (c > dominantCount) {
        dominantCount = c;
        dominantMealType = type;
      }
    }

    // Typische Uhrzeit: Mittelwert bekannter Minuten, sonst Fallback aus MealType
    const knownMinutes = group.occurrences
      .map((o) => o.minute)
      .filter((m): m is number => m != null);
    const typicalMinute =
      knownMinutes.length > 0
        ? Math.round(knownMinutes.reduce((sum, m) => sum + m, 0) / knownMinutes.length)
        : MEALTYPE_FALLBACK_MINUTE[dominantMealType];

    // Anteil der Vorkommen im aktuellen Tageszeit-Block
    const bucketOccurrences = group.occurrences.filter((o) => {
      const bucket = o.minute != null ? getTimeOfDayBucket(o.minute) : MEALTYPE_FALLBACK_BUCKET[o.entry.mealType];
      return bucket === currentBucket;
    }).length;
    const bucketShare = bucketOccurrences / count;

    const lastLoggedDate = group.occurrences.reduce(
      (max, o) => (o.date > max ? o.date : max),
      group.occurrences[0].date
    );

    const postWorkoutCount = group.occurrences.filter((o) =>
      isPostWorkoutOccurrence(o.date, o.minute)
    ).length;
    const postWorkoutAffinity = postWorkoutCount / count;

    // Kontext-Score: Häufigkeit × Tageszeit-Passung × Aktualität (+ Post-Workout)
    let score = count * (1 + CONTEXT_MATCH_WEIGHT * bucketShare);
    if (daysBetweenLocal(lastLoggedDate, todayStr) <= RECENCY_WINDOW_DAYS) {
      score *= RECENCY_FACTOR;
    }
    if (isPostWorkoutNow) {
      score *= 1 + POSTWORKOUT_AFFINITY_WEIGHT * postWorkoutAffinity;
    }

    meals.push({
      key,
      food,
      count,
      defaultAmount,
      macros: calculateNutrients(food, defaultAmount),
      dominantMealType,
      typicalMinute,
      typicalTimeLabel: formatMinuteAsTime(typicalMinute),
      lastLoggedDate,
      postWorkoutAffinity,
      contextScore: score,
    });
  }

  return meals
    .sort(
      (a, b) =>
        b.contextScore - a.contextScore ||
        b.count - a.count ||
        b.lastLoggedDate.localeCompare(a.lastLoggedDate)
    )
    .slice(0, limit);
}
