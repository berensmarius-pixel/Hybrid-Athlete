// ─── Intelligent Multi-Target Workout Engine ─────────────────────────────────
// Wählt pro Trainings-Schritt das optimale primäre und sekundäre
// Intensitäts-Ziel (Leistung/HF/Kadenz) statt statischer Mappings oder Textnotizen.

export type TargetKind =
  | "customPowerRange"
  | "powerZone"
  | "heartRateZone"
  | "heartRateRange"
  | "cadenceRange"
  | "noTarget";

export type StepPhase = "warmup" | "interval" | "recovery" | "cooldown";

export type IntensityCategory =
  | "threshold"
  | "vo2max"
  | "sweetspot"
  | "overUnder"
  | "sprint"
  | "neuromuscular"
  | "activeRecovery"
  | "recovery"
  | "warmup"
  | "cooldown"
  | "endurance";

export type RideFocus = "aerobicBase" | "strictPower";

export interface FitnessProfile {
  ftpWatts: number;
  restingHr: number;
  maxHr: number;
}

export interface StepTarget {
  kind: TargetKind;
  minWatts?: number;
  maxWatts?: number;
  minBpm?: number;
  maxBpm?: number;
  minRpm?: number;
  maxRpm?: number;
  zone?: number;
}

export interface GeneratedWorkoutStep {
  phase: StepPhase;
  label: string;
  notes: string;
  durationSeconds?: number;
  distanceMeters?: number;
  intensity: IntensityCategory | null;
  primaryTarget: StepTarget | null;
  secondaryTarget: StepTarget | null;
}

export const FITNESS_PROFILE_STORAGE_KEY = "hybrid_athlete_fitness_profile";

export const DEFAULT_FITNESS_PROFILE: FitnessProfile = {
  ftpWatts: 260,
  restingHr: 42,
  maxHr: 190,
};

const HIGH_INTENSITY_CATEGORIES: IntensityCategory[] = [
  "threshold",
  "vo2max",
  "sweetspot",
  "overUnder",
  "sprint",
  "neuromuscular",
];

const DEFAULT_FTP_PCT: Partial<Record<IntensityCategory, [number, number]>> = {
  threshold: [0.91, 1.05],
  sweetspot: [0.88, 0.94],
  vo2max: [1.06, 1.2],
  overUnder: [0.88, 1.08],
};

const CATEGORY_FALLBACK_POWER_ZONE: Partial<Record<IntensityCategory, number>> = {
  threshold: 4,
  sweetspot: 4,
  vo2max: 5,
  overUnder: 4,
  sprint: 6,
  neuromuscular: 6,
};

const LONG_BLOCK_MIN_SECONDS = 480;

const CLASSIFICATION_PATTERNS: Array<[IntensityCategory, RegExp]> = [
  ["overUnder", /(?:over[-\s/]?unders?\b|über-\/unterfahr|ueber-\/unterfahr|über\s*\/\s*unter|übers?\s*und\s*unters?)/i],
  ["vo2max", /(?:vo2\s*max|vo2max|vdot|\bvo2\b|zone\s*5\b|\bz5\b|maximalbereich)/i],
  ["sweetspot", /(?:sweet\s*-?\s*spot|sweetspot|süsses?fleck)/i],
  ["threshold", /(?:schwellen?|threshold|schwelle|ftp[-\s]?boost|zone\s*4\b|\bz4\b|kraftintervall\w*|kraftausdauer|\bsfr\b)/i],
  ["sprint", /(?:sprints?\b|spurts?\b|all[-\s]?out|anaerob\w*\s*(?:kapazität|leistung)?|attacken?)/i],
  ["neuromuscular", /(?:neuromuskulär\w*|neuromuscular|spin[-\s]?ups?|hochfrequenz drills?|kadenz drills?)/i],
  ["endurance", /(?:grundlage|grundlagen?aushalte|ausdauer|endurance|base ride|basislauf|dauerlauf|long run|lange ausfahrt|zone\s*2\b|\bz2\b|fettstoffwechsel)/i],
  ["activeRecovery", /(?:aktive\s+(?:erholung|regeneration)|regeneration|recovery ride|lockere?s?\s+(?:kurbeln|fahren|spin)|(?:lockeres)?\s*einrollen|ausrollen|active recovery)/i],
];

const LOW_CADENCE_PATTERN =
  /(?:sfr|kraftintervall\w*|kraftausdauer|torque|schwerek?\s+gang\w*|niedrig\w*\s+kadenz|low\s+cadence|großes?\s+blatt)/i;
const HIGH_CADENCE_PATTERN =
  /(?:hohe?s?\s+kadenz|hoch\w*\s+kadenz|high\s+cadence|spin[-\s]?ups?|kadenz drills?|neuromuskulär\w*|neuromuscular|überfrequenz)/i;
const HR_GUIDANCE_PATTERN =
  /(?:hf|hr|puls|herzfrequenz|heart\s*rate|bpm)\s*[<>≤≥≈:]?\s*\d+|\d+\s*bpm/i;

export function getFitnessProfile(): FitnessProfile {
  if (typeof window === "undefined") return { ...DEFAULT_FITNESS_PROFILE };
  try {
    const raw = window.localStorage.getItem(FITNESS_PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FITNESS_PROFILE };
    const parsed = JSON.parse(raw) as Partial<FitnessProfile>;
    const restingHr =
      typeof parsed.restingHr === "number" && parsed.restingHr > 0
        ? parsed.restingHr
        : DEFAULT_FITNESS_PROFILE.restingHr;
    return {
      ftpWatts:
        typeof parsed.ftpWatts === "number" && parsed.ftpWatts > 0
          ? parsed.ftpWatts
          : DEFAULT_FITNESS_PROFILE.ftpWatts,
      restingHr,
      maxHr:
        typeof parsed.maxHr === "number" && parsed.maxHr > restingHr
          ? parsed.maxHr
          : DEFAULT_FITNESS_PROFILE.maxHr,
    };
  } catch {
    return { ...DEFAULT_FITNESS_PROFILE };
  }
}

export function saveFitnessProfile(profile: FitnessProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FITNESS_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

export function classifyIntensity(text: string): IntensityCategory | null {
  const t = text || "";
  for (const [category, pattern] of CLASSIFICATION_PATTERNS) {
    if (pattern.test(t)) return category;
  }
  return null;
}

export function extractFtpPctRange(text: string): { low: number; high: number } | null {
  const t = text || "";
  const rangeMatch = t.match(
    /(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*(\d+(?:[.,]\d+)?))?\s*%\s*(?:von\s+|der\s+|of\s+)*(?:ftp|hf|max|vo2)/i
  );
  if (!rangeMatch) return null;
  const low = parseFloat(rangeMatch[1].replace(",", ".")) / 100;
  const high = rangeMatch[2]
    ? parseFloat(rangeMatch[2].replace(",", ".")) / 100
    : low;
  return low > 0 ? { low: Math.min(low, high), high: Math.max(low, high) } : null;
}

export function extractCadenceRange(text: string): { min: number; max: number } | null {
  const t = text || "";
  const match =
    t.match(/(?:kadenz|trittfrequenz|cadence)\s*[:=]?\s*(\d{2,3})\s*(?:[-–]\s*(\d{2,3}))?/i) ||
    t.match(
      /(\d{2,3})\s*(?:[-–]\s*(\d{2,3}))?\s*(?:rpm|umdrehungen|kadenz|trittfrequenz)/i
    );
  if (!match) return null;
  const min = parseInt(match[1], 10);
  const max = match[2] ? parseInt(match[2], 10) : min + 2;
  return min >= 20 ? { min, max: Math.max(min, max) } : null;
}

function wattsFromPct(ftp: number, pct: number): number {
  return Math.round(ftp * pct);
}

function karvonenZoneBpm(
  profile: FitnessProfile,
  lowPct: number,
  highPct: number
): { minBpm: number; maxBpm: number } {
  const hrr = profile.maxHr - profile.restingHr;
  return {
    minBpm: Math.round(profile.restingHr + hrr * lowPct),
    maxBpm: Math.round(profile.restingHr + hrr * highPct),
  };
}

export interface ResolveTargetsInput {
  phase: StepPhase;
  intensity: IntensityCategory | null;
  profile: FitnessProfile;
  ftpPctLow?: number;
  ftpPctHigh?: number;
  cadence?: { min: number; max: number } | null;
  highCadenceDrill?: boolean;
  lowCadenceTorque?: boolean;
  durationSeconds?: number;
  rideFocus?: RideFocus;
}

export interface ResolvedStepTargets {
  primaryTarget: StepTarget | null;
  secondaryTarget: StepTarget | null;
}

/**
 * Kern-Matrix der Ziel-Auswahl.
 * Primär: High-Intensity → customPowerRange (absolute Watt aus user.ftp × %),
 * Warmup/Cooldown/Active Recovery → customPowerRange oder PowerZone Z1/Z2,
 * Endurance/Base → PowerZone Z2 oder HeartRateZone Z2 (je nach Fokus).
 * Sekundär: Kadenz-Range bei Hoch-/Niedrigkadenz, HF-Range als Guardrail bei
 * langen Threshold-/Sweetspot-Blöcken ohne Kadenz-Vorgabe, sonst null (noTarget).
 */
export function resolveStepTargets(input: ResolveTargetsInput): ResolvedStepTargets {
  const { profile, phase, intensity } = input;
  let primaryTarget: StepTarget | null = null;

  const isStructuralPhase = phase === "warmup" || phase === "cooldown" || phase === "recovery";
  const isEasyPhase =
    isStructuralPhase ||
    intensity === "activeRecovery" ||
    intensity === "recovery" ||
    intensity === "warmup" ||
    intensity === "cooldown";
  const isHighIntensity =
    intensity !== null &&
    HIGH_INTENSITY_CATEGORIES.includes(intensity) &&
    !isStructuralPhase;

  if (isHighIntensity) {
    if (
      input.ftpPctLow !== undefined &&
      input.ftpPctHigh !== undefined &&
      profile.ftpWatts > 0
    ) {
      primaryTarget = {
        kind: "customPowerRange",
        minWatts: wattsFromPct(profile.ftpWatts, input.ftpPctLow),
        maxWatts: wattsFromPct(profile.ftpWatts, input.ftpPctHigh),
      };
    } else {
      primaryTarget = {
        kind: "customPowerRange",
        ...(DEFAULT_FTP_PCT[intensity!]
          ? {
              minWatts: wattsFromPct(profile.ftpWatts, DEFAULT_FTP_PCT[intensity!]![0]),
              maxWatts: wattsFromPct(profile.ftpWatts, DEFAULT_FTP_PCT[intensity!]![1]),
            }
          : {}),
        zone: CATEGORY_FALLBACK_POWER_ZONE[intensity!],
      };
    }
  } else if (isEasyPhase) {
    if (
      input.ftpPctLow !== undefined &&
      input.ftpPctHigh !== undefined &&
      profile.ftpWatts > 0
    ) {
      primaryTarget = {
        kind: "customPowerRange",
        minWatts: wattsFromPct(profile.ftpWatts, input.ftpPctLow),
        maxWatts: wattsFromPct(profile.ftpWatts, input.ftpPctHigh),
      };
    } else {
      primaryTarget = { kind: "powerZone", zone: intensity === "activeRecovery" ? 2 : 1 };
    }
  } else {
    const useHrZone = input.rideFocus === "aerobicBase";
    primaryTarget = useHrZone
      ? { kind: "heartRateZone", zone: 2 }
      : { kind: "powerZone", zone: 2 };
  }

  let secondaryTarget: StepTarget | null = null;

  if (phase === "interval") {
    if (input.cadence) {
      secondaryTarget = {
        kind: "cadenceRange",
        minRpm: input.cadence.min,
        maxRpm: input.cadence.max,
      };
    } else if (input.lowCadenceTorque) {
      secondaryTarget = { kind: "cadenceRange", minRpm: 55, maxRpm: 65 };
    } else if (input.highCadenceDrill || intensity === "neuromuscular") {
      secondaryTarget = { kind: "cadenceRange", minRpm: 100, maxRpm: 110 };
    } else if (
      (intensity === "threshold" || intensity === "sweetspot") &&
      (input.durationSeconds ?? 0) >= LONG_BLOCK_MIN_SECONDS &&
      primaryTarget?.kind === "customPowerRange"
    ) {
      const guardrail = karvonenZoneBpm(profile, 0.8, 0.9);
      secondaryTarget = {
        kind: "heartRateRange",
        minBpm: guardrail.minBpm,
        maxBpm: guardrail.maxBpm,
      };
    }
  }

  return { primaryTarget, secondaryTarget };
}

const METRIC_CLEANUP_PATTERNS: RegExp[] = [
  /\d+(?:[.,]\d+)?\s*(?:[-–]\s*\d+(?:[.,]\d+)?)?\s*%\s*(?:von\s*)?(?:der\s*)?(?:ftp|hf|max\.?\s*hf|hfmax|max|vo2\w*)/gi,
  /\d+\s*(?:[-–]\s*\d+\s*)?(?:watt|wattstunden)\b/gi,
  /\d+\s*(?:[-–]\s*\d+\s*)?w(?=\s|[.,;:!?)\]]|$)/gi,
  /\d+\s*(?:[-–]\s*\d+\s*)?(?:rpm|bpm|schläge?\s*pro\s*minute|umdrehungen)\b/gi,
  /(?:hf|hr|puls|herzfrequenz|heart\s*rate|trimp)\s*[<>≤≥≈:]?\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*bpm?)?/gi,
  /(?:kadenz|trittfrequenz|cadence)\s*[:=]?\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*rpm)?/gi,
  /\(?\s*(?:zone|gz|pulszone|leistungsklasse)\s*[1-7]\s*\)?/gi,
  /(?:^|\s)(?:@|bei)\s*(?=\s|$|[.,;:!?)\]])/gi,
];

export function stripMetricsFromNotes(notes: string): string {
  let cleaned = ` ${notes || ""} `;
  for (const pattern of METRIC_CLEANUP_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  cleaned = cleaned
    .replace(/\(\s*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[\s-–]+\./g, ".")
    .replace(/^\s*[-–:;,.\s]+/, "")
    .trim();
  return cleaned;
}

interface DescriptionContext {
  intensity: IntensityCategory | null;
  ftpPct: { low: number; high: number } | null;
  cadence: { min: number; max: number } | null;
  highCadenceDrill: boolean;
  lowCadenceTorque: boolean;
  hasHrGuidance: boolean;
}

function analyzeDescription(description: string): DescriptionContext {
  return {
    intensity: classifyIntensity(description),
    ftpPct: extractFtpPctRange(description),
    cadence: extractCadenceRange(description),
    highCadenceDrill: HIGH_CADENCE_PATTERN.test(description),
    lowCadenceTorque: LOW_CADENCE_PATTERN.test(description),
    hasHrGuidance: HR_GUIDANCE_PATTERN.test(description),
  };
}

function buildStep(
  ctx: DescriptionContext,
  profile: FitnessProfile,
  opts: {
    phase: StepPhase;
    label: string;
    notes?: string;
    durationSeconds?: number;
    distanceMeters?: number;
    intensityOverride?: IntensityCategory | null;
    rideFocus?: RideFocus;
  }
): GeneratedWorkoutStep {
  const intensity =
    opts.intensityOverride !== undefined
      ? opts.intensityOverride
      : opts.phase === "interval"
        ? ctx.intensity
        : opts.phase === "warmup"
          ? "warmup"
          : opts.phase === "cooldown"
            ? "cooldown"
            : "recovery";
  const structuralEasyStep =
    opts.intensityOverride === undefined &&
    (opts.phase === "warmup" || opts.phase === "cooldown" || opts.phase === "recovery");
  const effectiveCtx = structuralEasyStep ? { ...ctx, ftpPct: null } : ctx;
  const { primaryTarget, secondaryTarget } = resolveStepTargets({
    phase: opts.phase,
    intensity,
    profile,
    ftpPctLow: effectiveCtx.ftpPct?.low,
    ftpPctHigh: effectiveCtx.ftpPct?.high,
    cadence: ctx.cadence,
    highCadenceDrill: ctx.highCadenceDrill,
    lowCadenceTorque: ctx.lowCadenceTorque,
    durationSeconds: opts.durationSeconds,
    rideFocus: opts.rideFocus,
  });
  return {
    phase: opts.phase,
    label: opts.label,
    notes: stripMetricsFromNotes(opts.notes ?? ""),
    durationSeconds: opts.durationSeconds,
    distanceMeters: opts.distanceMeters,
    intensity,
    primaryTarget,
    secondaryTarget,
  };
}

export function detectTotalDurationMinutes(text: string, fallback = 60): number {
  const match = (text || "").match(/(\d{2,3})\s*(?:[-–]\s*(\d{2,3}))?\s*min/i);
  if (!match) return fallback;
  const a = parseInt(match[1], 10);
  const b = match[2] ? parseInt(match[2], 10) : a;
  return Math.round((a + b) / 2);
}

/**
 * Erzeugt aus einer freien Trainingsbeschreibung strukturierte Schritte mit
 * aufgelösten primären/sekundären Zielen und bereinigten Notizen.
 */
export function generateEnduranceSteps(
  description: string,
  name = "",
  opts: {
    profile?: FitnessProfile;
    totalDurationMins?: number;
    rideFocus?: RideFocus;
  } = {}
): GeneratedWorkoutStep[] {
  const desc = (description || "").trim();
  if (!desc) return [];
  const profile = opts.profile ?? getFitnessProfile();
  const ctx = analyzeDescription(desc);
  const steps: GeneratedWorkoutStep[] = [];

  const intervalMatch = desc.match(
    /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*('|′|min(?:uten)?|km|sek(?:unden)?|meter|m|s)?/i
  );

  const toSeconds = (valStr: string, unitStr: string): number => {
    const val = parseFloat(valStr.replace(",", "."));
    const u = (unitStr || "").toLowerCase();
    return u.startsWith("s") ? Math.round(val) : Math.round(val * 60);
  };

  let restSeconds = 240;
  const restMatch =
    desc.match(
      /(?:mit|nach|\+|\/)\s*(\d+(?:[.,]\d+)?)\s*('|′|min(?:uten)?|s|sek(?:unden)?)?\s*(?:pause|erholung|trab|locker|rec|rest)/i
    ) ||
    desc.match(
      /(?:pause|erholung|trab|rec|rest)\s*[:/]?\s*(\d+(?:[.,]\d+)?)\s*('|′|min(?:uten)?|s|sek(?:unden)?)?/i
    );
  if (restMatch) restSeconds = toSeconds(restMatch[1], restMatch[2] ?? "");

  if (intervalMatch) {
    const repeats = parseInt(intervalMatch[1], 10);
    const val = parseFloat(intervalMatch[2].replace(",", "."));
    let unit = (intervalMatch[3] ?? "").toLowerCase().trim();
    if (!unit || unit === "'" || unit === "′") unit = "min";
    else if (unit.startsWith("sek")) unit = "s";
    else if (unit.startsWith("m") && !unit.startsWith("mi")) unit = "m";
    else if (!unit.startsWith("km")) unit = "min";

    const totalSecs = (opts.totalDurationMins ?? detectTotalDurationMinutes(desc, 60)) * 60;
    const estWorkout =
      600 +
      repeats *
        ((unit === "min" ? val * 60 : unit === "s" ? val : 0) + restSeconds);
    let warmupS = 600;
    let cooldownS = 600;
    if (totalSecs > estWorkout) {
      const extra = totalSecs - estWorkout;
      warmupS += Math.round(extra * 0.5);
      cooldownS += Math.round(extra * 0.5);
    }

    steps.push(buildStep(ctx, profile, {
      phase: "warmup",
      label: "Aufwärmen / Einrollen",
      notes: "Locker einrollen, Trittfrequenz 90+ halten",
      durationSeconds: warmupS,
    }));

    for (let i = 1; i <= repeats; i++) {
      if (unit === "m" || unit === "km") {
        const distM = unit === "km" ? Math.round(val * 1000) : Math.round(val);
        steps.push(buildStep(ctx, profile, {
          phase: "interval",
          label: `Intervall ${i}/${repeats}`,
          notes: desc,
          distanceMeters: distM,
          rideFocus: opts.rideFocus,
        }));
      } else {
        const durS = unit === "s" ? Math.round(val) : Math.round(val * 60);
        steps.push(buildStep(ctx, profile, {
          phase: "interval",
          label: `Intervall ${i}/${repeats}`,
          notes: desc,
          durationSeconds: durS,
          rideFocus: opts.rideFocus,
        }));
      }

      if (restSeconds > 0) {
        steps.push(buildStep(ctx, profile, {
          phase: "recovery",
          label: `Erholung ${i}/${repeats}`,
          notes: "Aktiv locker kurbeln",
          durationSeconds: restSeconds,
        }));
      }
    }

    steps.push(buildStep(ctx, profile, {
      phase: "cooldown",
      label: "Abwärmen / Ausrollen",
      notes: "Beine ausschütteln, Puls senken",
      durationSeconds: cooldownS,
    }));

    return steps.map((s) => ({ ...s }));
  }

  const totalMins = detectTotalDurationMinutes(desc, opts.totalDurationMins ?? 45);
  const warmupM = Math.min(10, Math.max(5, Math.round(totalMins * 0.15)));
  const cooldownM = Math.min(10, Math.max(5, Math.round(totalMins * 0.15)));
  const mainM = Math.max(10, totalMins - warmupM - cooldownM);

  const isEnduranceish = ctx.intensity === "endurance" || ctx.intensity === null;
  const mainIntensity: IntensityCategory | null = isEnduranceish
    ? "endurance"
    : ctx.intensity;

  steps.push(buildStep(ctx, profile, {
    phase: "warmup",
    label: "Einrollen / Aufwärmen",
    notes: desc,
    durationSeconds: warmupM * 60,
  }));

  steps.push(buildStep(ctx, profile, {
    phase: "interval",
    label: name || "Hauptteil",
    notes: desc,
    durationSeconds: mainM * 60,
    intensityOverride: mainIntensity,
    rideFocus:
      opts.rideFocus ?? (ctx.hasHrGuidance ? "aerobicBase" : "strictPower"),
  }));

  steps.push(buildStep(ctx, profile, {
    phase: "cooldown",
    label: "Ausrollen / Abwärmen",
    notes: "",
    durationSeconds: cooldownM * 60,
  }));

  return steps;
}
