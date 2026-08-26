import type { FoodItem, MealEntry } from "@/types";

/**
 * Mikronährstoff-Rechner für Hybrid-Athleten – bewusst pure & React-frei,
 * damit die Engine unit-testbar bleibt (analog logUtils.ts).
 *
 * Zwei Aufgaben:
 * 1. Tages-Summen von Mikronährstoffen aus geloggten Lebensmitteln aggregieren
 *    (OpenFoodFacts / KI-Meal-Logger liefern keine Micro-Daten → Heuristik
 *    über eine eingebaute Lebensmittel-Profildatenbank).
 * 2. Vergleich gegen erhöhte athletische RDAs abhängig von
 *    Schweißverlust (L/Tag) und Trainingsvolumen (h/Woche).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type MicroNutrientKey =
  | "iron"
  | "magnesium"
  | "sodium"
  | "potassium"
  | "zinc"
  | "vitaminD"
  | "omega3";

/** Tagesmengen. Einheiten: mg (Mineralstoffe), IU (Vitamin D), g EPA+DHA (Omega-3). */
export interface MicroAmounts {
  iron: number;
  magnesium: number;
  sodium: number;
  potassium: number;
  zinc: number;
  vitaminD: number;
  omega3: number;
}

export interface AthleticProfileInput {
  /** Geschätzter täglicher Schweißverlust in Liter (0.3 – 4) */
  sweatLossLPerDay: number;
  /** Trainingsvolumen pro Woche in Stunden (0 – 25) */
  trainingHoursPerWeek: number;
}

export type MicroStatusLevel = "optimal" | "warning" | "critical";

export interface NutrientStatus {
  key: MicroNutrientKey;
  label: string;
  shortLabel: string;
  unit: string;
  amount: number;
  target: number;
  percent: number;
  level: MicroStatusLevel;
  emoji: string;
  recommendation?: string;
}

// ─── Metadaten ────────────────────────────────────────────────────────────────

export const MICRONUTRIENT_KEYS: MicroNutrientKey[] = [
  "iron",
  "magnesium",
  "sodium",
  "potassium",
  "zinc",
  "vitaminD",
  "omega3",
];

const MICRO_META: Record<
  MicroNutrientKey,
  { label: string; shortLabel: string; unit: string }
> = {
  iron: { label: "Eisen", shortLabel: "Eisen", unit: "mg" },
  magnesium: { label: "Magnesium", shortLabel: "Magnesium", unit: "mg" },
  sodium: { label: "Natrium", shortLabel: "Natrium", unit: "mg" },
  potassium: { label: "Kalium", shortLabel: "Kalium", unit: "mg" },
  zinc: { label: "Zink", shortLabel: "Zink", unit: "mg" },
  vitaminD: { label: "Vitamin D", shortLabel: "Vit-D", unit: "IU" },
  omega3: { label: "Omega-3", shortLabel: "Omega-3", unit: "g" },
};

const RECOMMENDATIONS: Record<MicroNutrientKey, { warning: string; critical: string }> = {
  iron: {
    warning:
      "Empfehlung: Rotes Fleisch oder Linsen zum Abendessen – mit Vitamin-C-Quelle kombinieren.",
    critical:
      "Empfehlung: Eisenreiche Kost priorisieren (Rindfleisch, Linsen, Spinat + Vitamin C) und Ferritin beim Arzt checken.",
  },
  magnesium: {
    warning:
      "Empfehlung: Kürbiskerne, Haferflocken oder Magnesium-Bisglycinat zum Abendessen.",
    critical:
      "Empfehlung: Deutliches Defizit – Blattgrün, Nüsse & ggf. 300 mg Magnesium-Bisglycinat abends.",
  },
  sodium: {
    warning:
      "Empfehlung: Prise Salz ins Pre-Workout-Getränk oder salzhaltige Snacks nach langen Einheiten.",
    critical:
      "Empfehlung: Deutlich zu wenig Natrium bei deinem Schweißverlust – Elektrolytgetränk nutzen.",
  },
  potassium: {
    warning: "Empfehlung: Banane oder Kartoffeln nach dem Training.",
    critical:
      "Empfehlung: Kalium stark unter Ziel – Kartoffeln, Bananen & Hülsenfrüchte einbauen.",
  },
  zinc: {
    warning:
      "Empfehlung: Rindfleisch, Kichererbsen oder Käse – Zink nicht zeitgleich mit Eisen supplementieren.",
    critical:
      "Empfehlung: Zinkdefizit bremst Regeneration & Testosteron – Austern/Rindfleisch oder Zink-Präparat.",
  },
  vitaminD: {
    warning:
      "Empfehlung: 15–20 Min Sonnenlicht täglich oder 1.000–2.000 IE Vitamin-D3.",
    critical:
      "Empfehlung: Deutlich zu wenig Vitamin D – D3-Präparat (2.000 IE) und Blutkontrolle erwägen.",
  },
  omega3: {
    warning:
      "Empfehlung: Fettiger Fisch (Lachs/Makrele) 2x pro Woche oder Algenöl-Kapseln.",
    critical:
      "Empfehlung: Fast kein Omega-3 heute – Algenöl/Lachs nachlegen für Entzündungsbalance.",
  },
};

// ─── Athletische RDA-Modelle ──────────────────────────────────────────────────

interface RdaModel {
  base: number;
  perSweatLiter: number;
  perTrainingHour: number;
  max: number;
}

/**
 * Erhöhte athletische Referenzwerte (DACH-RDA × Sportler-Faktoren):
 * Schweißverluste spülen Natrium/Zink/Eisen heraus, hohes Volumen
 * erhöht Bedarf an Magnesium, Kalium & Vitamin D.
 */
export const ATHLETIC_RDA_MODELS: Record<MicroNutrientKey, RdaModel> = {
  // Eisen: Ausdauerathleten ~1.3–1.7× der Standard-RDA (Fußstrike-Hämolyse, Schweiß)
  iron: { base: 14, perSweatLiter: 3, perTrainingHour: 0.25, max: 30 },
  // Magnesium: 400+ mg Basis, bis ~600 mg bei hohem Volumen
  magnesium: { base: 340, perSweatLiter: 40, perTrainingHour: 6, max: 600 },
  // Natrium: ~700–1.100 mg gehen pro Liter Schweiß verloren
  sodium: { base: 1400, perSweatLiter: 700, perTrainingHour: 40, max: 5000 },
  potassium: { base: 3200, perSweatLiter: 300, perTrainingHour: 25, max: 5500 },
  zinc: { base: 11, perSweatLiter: 0.6, perTrainingHour: 0.05, max: 18 },
  vitaminD: { base: 800, perSweatLiter: 0, perTrainingHour: 20, max: 2400 },
  omega3: { base: 0.5, perSweatLiter: 0, perTrainingHour: 0.02, max: 1.2 },
};

export function getAthleticRda(
  key: MicroNutrientKey,
  profile: AthleticProfileInput
): number {
  const m = ATHLETIC_RDA_MODELS[key];
  const sweatLiters = clamp(profile.sweatLossLPerDay || 0, 0, 4);
  const weeklyHours = clamp(profile.trainingHoursPerWeek || 0, 0, 25);
  const raw =
    m.base + m.perSweatLiter * sweatLiters + m.perTrainingHour * weeklyHours;
  return Math.min(round1(raw), m.max);
}

// ─── Lebensmittel-Mikronährstoff-Profile (pro 100 g/ml) ───────────────────────

type PatternToken = string | RegExp;

interface FoodMicroProfile {
  keywords: PatternToken[];
  amounts: Partial<MicroAmounts>;
}

/**
 * Heuristische Profildatenbank (USDA-nah, gerundet).
 * Reihenfolge = Priorität: spezifische Treffer zuerst ("Lachsfilet" vor
 * generischem Fisch, "Mandelmilch" vor "Mandel").
 */
const FOOD_MICRO_PROFILES: FoodMicroProfile[] = [
  // Fisch & Meeresfrüchte
  { keywords: ["lachs", "salmon"], amounts: { iron: 0.34, magnesium: 29, sodium: 44, potassium: 384, zinc: 0.44, vitaminD: 450, omega3: 2.2 } },
  { keywords: ["makrele", "mackerel"], amounts: { iron: 1.6, magnesium: 76, sodium: 90, potassium: 260, zinc: 0.6, vitaminD: 400, omega3: 2.7 } },
  { keywords: ["hering", "herring", "matjes"], amounts: { iron: 1.1, magnesium: 32, sodium: 120, potassium: 327, zinc: 0.9, vitaminD: 214, omega3: 1.9 } },
  { keywords: ["thunfisch", "tuna"], amounts: { iron: 1.6, magnesium: 27, sodium: 247, potassium: 237, zinc: 0.7, vitaminD: 68, omega3: 0.35 } },
  { keywords: ["forelle", "trout"], amounts: { iron: 0.5, magnesium: 30, sodium: 52, potassium: 394, zinc: 0.5, vitaminD: 572, omega3: 1.0 } },
  { keywords: ["garnele", "garnelen", "shrimp", "krabben"], amounts: { iron: 0.5, magnesium: 33, sodium: 111, potassium: 259, zinc: 1.6, vitaminD: 172, omega3: 0.35 } },
  { keywords: ["austern", "oyster", "muscheln"], amounts: { iron: 5.1, magnesium: 22, sodium: 67, potassium: 156, zinc: 39, vitaminD: 68, omega3: 0.7 } },
  { keywords: ["kabeljau", "seelachs", "cod", "fischstäbchen", "fischfilet", "wels", "zander"], amounts: { iron: 0.4, magnesium: 28, sodium: 78, potassium: 268, zinc: 0.5, vitaminD: 46, omega3: 0.22 } },
  // Fleisch & Eier
  { keywords: ["rinder", "beef", "hackfleisch", "steak", "roulade", "hüftsteak", "filetspitzen"], amounts: { iron: 2.4, magnesium: 22, sodium: 66, potassium: 330, zinc: 5.3, vitaminD: 2, omega3: 0.05 } },
  { keywords: ["leber", "liver"], amounts: { iron: 6.5, magnesium: 21, sodium: 69, potassium: 320, zinc: 4.0, vitaminD: 50, omega3: 0.5 } },
  { keywords: ["schwein", "pork", "kassler", "schweinefilet", "schweinehack"], amounts: { iron: 0.9, magnesium: 22, sodium: 55, potassium: 380, zinc: 2.3, vitaminD: 1, omega3: 0.03 } },
  { keywords: ["hähnchen", "haehnchen", "huhn", "chicken", "pute", "putenbrust", "geflügel", "gefluegel"], amounts: { iron: 0.5, magnesium: 28, sodium: 74, potassium: 256, zinc: 1.1, vitaminD: 4, omega3: 0.06 } },
  { keywords: ["salami", "wurst", "schinken", "ham", "speck", "bacon", "frikadelle", "wiener", "bockwurst", "fleischwurst"], amounts: { iron: 1.5, magnesium: 20, sodium: 1300, potassium: 280, zinc: 2.2, vitaminD: 8, omega3: 0.1 } },
  { keywords: ["hühnerei", /\bei\b/i, /\beier\b/i, "omelett", "rüherei", "spiegelei"], amounts: { iron: 1.2, magnesium: 10, sodium: 124, potassium: 126, zinc: 1.3, vitaminD: 87, omega3: 0.04 } },
  // Getreide & Beilagen
  { keywords: ["hafer", "oats", "oat", "müsli", "muesli", "granola"], amounts: { iron: 4.7, magnesium: 177, sodium: 4, potassium: 358, zinc: 4.0, vitaminD: 0, omega3: 0.1 } },
  { keywords: ["vollkornbrot", "roggenbrot", "dinkelbrot", "vollkorn", "wholegrain", "pumpernickel"], amounts: { iron: 2.5, magnesium: 76, sodium: 480, potassium: 230, zinc: 1.8, vitaminD: 0, omega3: 0 } },
  { keywords: ["brot", "bread", "toast", "brötchen", "baguette", "brezel"], amounts: { iron: 1.5, magnesium: 23, sodium: 490, potassium: 100, zinc: 0.7, vitaminD: 0, omega3: 0 } },
  { keywords: ["reis", "rice", "basmati", "jasmin"], amounts: { iron: 0.6, magnesium: 25, sodium: 5, potassium: 115, zinc: 1.1, vitaminD: 0, omega3: 0 } },
  { keywords: ["nudeln", "pasta", "spaghetti", "noodles", "penne", "fusilli"], amounts: { iron: 1.3, magnesium: 25, sodium: 5, potassium: 88, zinc: 0.7, vitaminD: 0, omega3: 0 } },
  { keywords: ["kartoffel", "potato", "pommes", "sweet potato"], amounts: { iron: 0.9, magnesium: 24, sodium: 8, potassium: 400, zinc: 0.35, vitaminD: 0, omega3: 0 } },
  // Milchprodukte
  { keywords: ["quark", "skyr", "joghurt", "yogurt", "yoghurt", "kefir"], amounts: { iron: 0.1, magnesium: 13, sodium: 40, potassium: 150, zinc: 0.6, vitaminD: 2, omega3: 0.01 } },
  { keywords: ["milch", "milk", "latte"], amounts: { iron: 0.03, magnesium: 10, sodium: 43, potassium: 150, zinc: 0.4, vitaminD: 49, omega3: 0.01 } },
  { keywords: ["käse", "kaese", "cheese", "gouda", "mozzarella", "frischkäse", "feta", "parmesan", "halloumi"], amounts: { iron: 0.3, magnesium: 27, sodium: 700, potassium: 98, zinc: 3.5, vitaminD: 12, omega3: 0.03 } },
  { keywords: ["whey", "casein", "proteinpulver", "protein shake"], amounts: { iron: 0.5, magnesium: 60, sodium: 250, potassium: 500, zinc: 1.5, vitaminD: 0, omega3: 0 } },
  // Obst
  { keywords: ["banane", "banana"], amounts: { iron: 0.26, magnesium: 27, sodium: 1, potassium: 358, zinc: 0.15, vitaminD: 0, omega3: 0 } },
  { keywords: ["avokado", "avocado"], amounts: { iron: 0.55, magnesium: 29, sodium: 7, potassium: 485, zinc: 0.64, vitaminD: 0, omega3: 0.1 } },
  { keywords: ["apfel", "apple", "birne", "beeren", "berries", "orange", "trauben"], amounts: { iron: 0.2, magnesium: 8, sodium: 2, potassium: 140, zinc: 0.08, vitaminD: 0, omega3: 0 } },
  // Gemüse & Hülsenfrüchte
  { keywords: ["spinat", "spinach", "mangold", "rucola", "feldsalat"], amounts: { iron: 2.7, magnesium: 79, sodium: 79, potassium: 558, zinc: 0.53, vitaminD: 0, omega3: 0.03 } },
  { keywords: ["brokkoli", "broccoli", "blumenkohl", "kohl", "grünkohl"], amounts: { iron: 0.73, magnesium: 21, sodium: 33, potassium: 316, zinc: 0.41, vitaminD: 0, omega3: 0.02 } },
  { keywords: ["bohnen", "beans", "kidney", "edamame"], amounts: { iron: 2.6, magnesium: 45, sodium: 220, potassium: 350, zinc: 1.2, vitaminD: 0, omega3: 0.25 } },
  { keywords: ["kichererbse", "chickpea", "hummus", "falafel"], amounts: { iron: 2.4, magnesium: 40, sodium: 180, potassium: 190, zinc: 1.4, vitaminD: 0, omega3: 0 } },
  { keywords: ["linse", "lentil", "dal", "erbsen", "peas"], amounts: { iron: 3.3, magnesium: 36, sodium: 4, potassium: 369, zinc: 1.3, vitaminD: 0, omega3: 0 } },
  { keywords: ["tofu", "tempeh", "soja", "soy"], amounts: { iron: 2.7, magnesium: 58, sodium: 14, potassium: 237, zinc: 1.6, vitaminD: 0, omega3: 0.3 } },
  { keywords: ["gemüse", "gemuese", "vegetable", "salat", "paprika", "karotte", "zucchini", "tomate"], amounts: { iron: 0.7, magnesium: 18, sodium: 20, potassium: 250, zinc: 0.3, vitaminD: 0, omega3: 0.02 } },
  // Nüsse & Samen
  { keywords: ["mandelmilch", "mandeldrink", "almond milk"], amounts: { iron: 0.1, magnesium: 5, sodium: 60, potassium: 45, zinc: 0.1, vitaminD: 40, omega3: 0 } },
  { keywords: ["erdnuss", "peanut"], amounts: { iron: 1.9, magnesium: 168, sodium: 60, potassium: 250, zinc: 2.9, vitaminD: 0, omega3: 0 } },
  { keywords: ["walnuss", "walnut"], amounts: { iron: 2.9, magnesium: 158, sodium: 2, potassium: 441, zinc: 2.9, vitaminD: 0, omega3: 9.0 } },
  { keywords: ["mandel", "almond"], amounts: { iron: 3.7, magnesium: 270, sodium: 1, potassium: 733, zinc: 3.1, vitaminD: 0, omega3: 0 } },
  { keywords: ["cashew"], amounts: { iron: 6.7, magnesium: 292, sodium: 12, potassium: 660, zinc: 5.8, vitaminD: 0, omega3: 0.06 } },
  { keywords: ["kürbiskern", "pumpkin seed", "kern", "seed"], amounts: { iron: 8.8, magnesium: 592, sodium: 7, potassium: 809, zinc: 7.8, vitaminD: 0, omega3: 0.12 } },
  { keywords: ["chia"], amounts: { iron: 7.7, magnesium: 335, sodium: 16, potassium: 407, zinc: 4.6, vitaminD: 0, omega3: 17.8 } },
  { keywords: ["leinsamen", "flaxseed", "leinöl", "flax"], amounts: { iron: 1.6, magnesium: 392, sodium: 30, potassium: 813, zinc: 4.3, vitaminD: 0, omega3: 22.8 } },
  { keywords: ["sonnenblumenkern", "sunflower"], amounts: { iron: 5.2, magnesium: 325, sodium: 9, potassium: 645, zinc: 5.0, vitaminD: 0, omega3: 0 } },
  // Sonstiges
  { keywords: ["schokolade", "chocolate", "cacao", "kakao", "cocoa"], amounts: { iron: 8.0, magnesium: 230, sodium: 24, potassium: 700, zinc: 3.3, vitaminD: 0, omega3: 0 } },
  { keywords: ["pizza"], amounts: { iron: 2.0, magnesium: 30, sodium: 640, potassium: 180, zinc: 1.5, vitaminD: 8, omega3: 0.1 } },
];

function profileMatches(pattern: PatternToken, haystack: string): boolean {
  if (typeof pattern === "string") return haystack.includes(pattern);
  return pattern.test(haystack);
}

/** Schätzt Mikronährstoffe eines Foods (pro 100 g/ml) via Profil-Heuristik. */
export function estimateFoodMicronutrients(food: FoodItem): MicroAmounts {
  const zeros: MicroAmounts = {
    iron: 0,
    magnesium: 0,
    sodium: 0,
    potassium: 0,
    zinc: 0,
    vitaminD: 0,
    omega3: 0,
  };
  if (!food?.name) return zeros;

  const haystack = `${food.name} ${food.brand ?? ""}`.toLowerCase();
  const profile = FOOD_MICRO_PROFILES.find((p) =>
    p.keywords.some((kw) => profileMatches(kw, haystack))
  );
  if (!profile) return zeros;

  return { ...zeros, ...profile.amounts };
}

/** Aggregiert die Tages-Summen aller Meal-Entries eines Tages. */
export function aggregateDailyMicronutrients(entries: MealEntry[]): MicroAmounts {
  const totals: MicroAmounts = {
    iron: 0,
    magnesium: 0,
    sodium: 0,
    potassium: 0,
    zinc: 0,
    vitaminD: 0,
    omega3: 0,
  };

  for (const entry of entries ?? []) {
    const per100 = estimateFoodMicronutrients(entry.food);
    const ratio = (entry.amount || 0) / 100;
    for (const key of MICRONUTRIENT_KEYS) {
      totals[key] += (per100[key] || 0) * ratio;
    }
  }

  totals.iron = Math.round(totals.iron * 10) / 10;
  totals.magnesium = Math.round(totals.magnesium);
  totals.sodium = Math.round(totals.sodium);
  totals.potassium = Math.round(totals.potassium);
  totals.zinc = Math.round(totals.zinc * 10) / 10;
  totals.vitaminD = Math.round(totals.vitaminD);
  totals.omega3 = Math.round(totals.omega3 * 10) / 10;

  return totals;
}

// ─── Status-Bewertung ─────────────────────────────────────────────────────────

function levelForPercent(percent: number): MicroStatusLevel {
  if (percent >= 75) return "optimal";
  if (percent >= 40) return "warning";
  return "critical";
}

export function calculateDailyMicroStatus(
  entries: MealEntry[],
  profile: AthleticProfileInput
): NutrientStatus[] {
  const totals = aggregateDailyMicronutrients(entries);

  return MICRONUTRIENT_KEYS.map((key) => {
    const target = getAthleticRda(key, profile);
    const percent = target > 0 ? Math.round((totals[key] / target) * 100) : 0;
    const level = levelForPercent(percent);
    return {
      key,
      ...MICRO_META[key],
      amount: totals[key],
      target,
      percent,
      level,
      emoji: level === "optimal" ? "🟢" : level === "warning" ? "🟡" : "🔴",
      recommendation:
        level === "optimal"
          ? undefined
          : RECOMMENDATIONS[key][level],
    };
  });
}

/** Ø-Erfüllung in % (Werte > 100 zählen als 100). */
export function averageMicronutrientScore(statuses: NutrientStatus[]): number {
  if (!statuses.length) return 0;
  const sum = statuses.reduce((acc, s) => acc + Math.min(100, s.percent), 0);
  return Math.round(sum / statuses.length);
}

// ─── Schweißverlust-Schätzung aus Garmin Aktiv-Verbrauch ─────────────────────

/**
 * Faustregel: ~0.5–1 L Schweiß je 500–700 kcal Bewegung.
 * `activeBurnKcal` = Garmin activeCaloriesBurned des Tages.
 */
export function estimateSweatLossFromBurn(activeBurnKcal: number): number {
  if (!activeBurnKcal || activeBurnKcal <= 50) return 0.8;
  return round1(clamp(0.8 + (activeBurnKcal / 1000) * 0.35, 0.8, 4));
}

// ─── Biomarker / Blutwerte ────────────────────────────────────────────────────

export interface BiomarkerEntry {
  id: string;
  date: string; // YYYY-MM-DD
  ferritinNgMl?: number;
  vitaminDNgMl?: number;
  testosteroneNgDl?: number;
  notes?: string;
}

export type BiomarkerFlagLevel = "info" | "warning" | "critical";

export interface BiomarkerFlag {
  level: BiomarkerFlagLevel;
  title: string;
  message: string;
}

export const BIOMARKER_FIELDS = [
  {
    key: "ferritinNgMl",
    label: "Ferritin",
    unit: "ng/mL",
    hint: "Optimal (Athleten): ≥ 50 · Niedrig: < 30",
  },
  {
    key: "vitaminDNgMl",
    label: "Vitamin D 25-OH",
    unit: "ng/mL",
    hint: "Optimal: 30–60 · Mangel: < 20",
  },
  {
    key: "testosteroneNgDl",
    label: "Testosteron (gesamt)",
    unit: "ng/dL",
    hint: "Referenz Männer: 300–1.000 · Niedrig: < 300",
  },
] as const;

/**
 * Bewertet Blutwerte und liefert Warnungen.
 * Kernregel: Ferritin < 30 ng/mL → Warnung bzgl. aerobischer Kapazität
 * & Regeneration (Eisenmangel ist der häufigste Leistungskiller bei
 * Hybrid-/Ausdauerathleten).
 */
export function evaluateBiomarkers(
  entry?: BiomarkerEntry | null
): BiomarkerFlag[] {
  if (!entry) return [];
  const flags: BiomarkerFlag[] = [];

  const ferritin = entry.ferritinNgMl;
  if (typeof ferritin === "number") {
    if (ferritin < 15) {
      flags.push({
        level: "critical",
        title: "Kritisch niedriges Ferritin",
        message:
          "Ferritin < 15 ng/mL spricht für einen manifesten Eisenmangel – bitte ärztlich abklären (Ferritin, CRP, Transferrinsättigung).",
      });
    } else if (ferritin < 30) {
      flags.push({
        level: "warning",
        title: "Ferritin niedrig (< 30 ng/mL)",
        message:
          "Potenzielle Einschränkung der aerobischen Kapazität & verlangsamte Regeneration. Eisenreiche Ernährung steigern und Blutbild kontrollieren lassen.",
      });
    } else if (ferritin < 50) {
      flags.push({
        level: "info",
        title: "Ferritin grenzwertig",
        message:
          "30–49 ng/mL ist grenzwertig – für Ausdauerleistung sind Werte ≥ 50 ng/mL optimal.",
      });
    }
  }

  const vitD = entry.vitaminDNgMl;
  if (typeof vitD === "number") {
    if (vitD < 20) {
      flags.push({
        level: "critical",
        title: "Vitamin-D-Mangel",
        message:
          "25-OH-Vitamin D < 20 ng/mL: beeinträchtigt Muskelkraft, Immunsystem & Knochengesundheit. Supplementierung ärztlich besprechen.",
      });
    } else if (vitD < 30) {
      flags.push({
        level: "info",
        title: "Vitamin D unzureichend",
        message:
          "20–29 ng/mL ist unzureichend – Zielbereich für Athleten: 30–60 ng/mL.",
      });
    } else if (vitD > 100) {
      flags.push({
        level: "warning",
        title: "Vitamin D über dem Zielbereich",
        message:
          "> 100 ng/mL kann toxisch wirken (Hyperkalziämie) – Dosis reduzieren und erneut messen.",
      });
    }
  }

  const testo = entry.testosteroneNgDl;
  if (typeof testo === "number") {
    if (testo < 200) {
      flags.push({
        level: "critical",
        title: "Deutlich niedriges Testosteron",
        message:
          "< 200 ng/dL: deutlicher Hinweis auf hormonelle Erschöpfung (Overreaching, Energiedefizit) – endokrinologisch abklären.",
      });
    } else if (testo < 300) {
      flags.push({
        level: "warning",
        title: "Testosteron niedrig (< 300 ng/dL)",
        message:
          "Kann Regeneration, Kraftentwicklung & Schlaf beeinträchtigen – Kalorienzufuhr, Schlaf und Trainingslast prüfen.",
      });
    }
  }

  return flags;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
