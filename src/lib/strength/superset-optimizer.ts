// ─── Antagonist & Non-Interfering Superset Optimizer ─────────────────────────
// Paart Übungen zu nicht-konkurrierenden Supersätzen (Antagonisten bzw.
// Upper/Lower-Staffel), kürzt die Pausen zwischen alternierenden Bewegungen
// und schützt spinal belastende Grundübungen vor Paarung.

export type MovementPattern =
  | "chestPush"
  | "backPull"
  | "bicepsCurl"
  | "tricepsExtension"
  | "quadExtension"
  | "hamstringCurl"
  | "overheadPress"
  | "calfRaise"
  | "spinalLoad"
  | "other";

export type SupersetKind = "antagonist" | "upperLower";

export type TrainingBlockType = "strength" | "hypertrophy" | "general";

export interface SupersetCandidateExercise {
  id: string;
  name: string;
  muscleGroup?: string;
  sets?: Array<{ restSeconds?: number }>;
}

export interface SupersetPairingRule {
  id: string;
  label: string;
  shortLabel: string;
  kind: SupersetKind;
  patterns: [MovementPattern, MovementPattern];
}

export const SUPERSET_PAIRING_RULES: SupersetPairingRule[] = [
  {
    id: "chest-back",
    label: "Antagonisten: Brustdrücken + Rücken-Zug",
    shortLabel: "Brust + Rücken",
    kind: "antagonist",
    patterns: ["chestPush", "backPull"],
  },
  {
    id: "biceps-triceps",
    label: "Antagonisten: Bizepscurl + Trizepsextension",
    shortLabel: "Bizeps + Trizeps",
    kind: "antagonist",
    patterns: ["bicepsCurl", "tricepsExtension"],
  },
  {
    id: "quad-hamstring",
    label: "Antagonisten: Beinstrecker + Beinbeuger",
    shortLabel: "Quads + Hamstrings",
    kind: "antagonist",
    patterns: ["quadExtension", "hamstringCurl"],
  },
  {
    id: "press-calf",
    label: "Upper/Lower-Staffel: Schulterdrücken + Wadenheben",
    shortLabel: "Schultern + Waden",
    kind: "upperLower",
    patterns: ["overheadPress", "calfRaise"],
  },
];

export const DEFAULT_FULL_REST_SECONDS = 180;
export const SUPERSET_ALTERNATING_REST_SECONDS = 60;
const WORKING_SET_SECONDS = 45;

const SPINAL_LOADING_PATTERN =
  /kreuzheben|\bdead[\s-]?lifts?\b|(rumän\w*|romanian|stiff[-\s]?leg|sumo|trap[\s-]?bar)[-\s]?(kreuz-?[-\s]?|dead[-\s]?)?(heben|lift)|\brdl\b|good\s*mornings?|kniebeuge|\bsquats?\b|langhantel(?:-)?ruden|barbell\s+rows?|pendlay|yates[\s-]?rows?|hip\s+thrusts?|glute\s+bridges?|kraftrein|clean(?:[\s&-]+jerk)?/i;

const MOVEMENT_PATTERNS: Array<[MovementPattern, RegExp]> = [
  ["spinalLoad", SPINAL_LOADING_PATTERN],
  ["calfRaise", /wadenheben|waden(?:-)?presse|calf[\s-]?(?:raise|press|extension)s?|seated\s+calf|donkey\s+calf|soleus/i],
  ["hamstringCurl", /beinbeuger|leg[\s-]?curls?|hamstring[\s-]?curls?|nordic[\s-]?hamstring/i],
  ["bicepsCurl", /bizeps|biceps|hammer[\s-]?curls?|\bcurls?\b|preacher|concentration/i],
  [
    "tricepsExtension",
    /trizeps|triceps|skull[\s-]?crushers?|french[\s-]?(?:press|curl)|nosebreakers?|overhead\s+triceps?\s+extensions?|kickbacks?|diamant(?:-)?liegestütze|diamond\s+push[\s-]?ups?/i,
  ],
  [
    "quadExtension",
    /beinstrecker|leg\s+extensions?|beinpresse|leg\s+press|hack(?:en)?[\s-]?squats?|ausfallschritte?|lunges?|step[\s-]?ups?|sissy[\s-]?squats?/i,
  ],
  ["hamstringCurl", /beinbeuger|leg[\s-]?curls?|hamstring[\s-]?curls?|nordic[\s-]?hamstring/i],
  [
    "chestPush",
    /bankdrücken|bankdruck|schrägbank|bench\s+press(?:es)?|incline\s+(?:bench|press)|fliegende(?:r)?|flyes?|\bflys?\b|pec[\s-]?(?:deck|fly)|liegestütze|push[\s-]?ups?|chest\s+press|\bdips?\b|brustpresse/i,
  ],
  [
    "backPull",
    /\brudern\b|ruderzüge?|\brows?\b|latzug|lat[\s-]?zug|lat\s+pulldowns?|pulldowns?|klimmzüge?|pull[\s-]?ups?|chin[\s-]?ups?|face[\s-]?pulls?|rear[\s-]?delt/i,
  ],
  [
    "overheadPress",
    /schulterdrücken|schulterdruck|overhead(?:\s+press(?:es)?)?|military[\s-]?press(?:es)?|shoulder[\s-]?press(?:es)?|arnold[\s-]?press(?:es)?|nakendrücken|landmine[\s-]?press(?:es)?|aushölzen/i,
  ],
];

export function classifyMovement(name: string): MovementPattern {
  const n = (name || "").trim();
  if (!n) return "other";
  for (const [pattern, regex] of MOVEMENT_PATTERNS) {
    if (regex.test(n)) return pattern;
  }
  return "other";
}

export function isSpinalLoading(name: string): boolean {
  return classifyMovement(name) === "spinalLoad";
}

function ruleEnabledForBlock(rule: SupersetPairingRule, blockType: TrainingBlockType): boolean {
  if (rule.kind === "antagonist") return true;
  return blockType !== "strength";
}

export interface SupersetOptions {
  /** Upper/Lower-Stagger (z. B. Schulterdrücken + Wadenheben) einbeziehen. */
  includeUpperLowerStagger?: boolean;
  /** Hypertrophie-/General-Blöcke erlauben Staffeln, reine Kraftblöcke nicht. */
  blockType?: TrainingBlockType;
}

export interface SupersetPair {
  supersetId: string;
  ruleId: string;
  label: string;
  shortLabel: string;
  kind: SupersetKind;
  exerciseAId: string;
  exerciseBId: string;
  indexA: number;
  indexB: number;
  restSeconds: number;
}

export interface SupersetPlan {
  pairs: SupersetPair[];
  pairedExerciseIds: string[];
  skippedSpinalExercises: Array<{ id: string; name: string }>;
  unpairedExerciseIds: string[];
  originalEstimatedSeconds: number;
  optimizedEstimatedSeconds: number;
  estimatedSecondsSaved: number;
  estimatedTimeSavedPct: number;
}

/** Pausen zwischen alternierenden Supersatz-Bewegungen: nie länger als 60 s. */
export function adjustSupersetRestSeconds(currentRestSeconds?: number): number {
  const base = currentRestSeconds ?? DEFAULT_FULL_REST_SECONDS;
  return Math.min(Math.max(Math.round(base), 0), SUPERSET_ALTERNATING_REST_SECONDS);
}

interface ClassifiedExercise {
  id: string;
  index: number;
  pattern: MovementPattern;
}

let supersetIdCounter = 0;

function nextSupersetId(): string {
  supersetIdCounter = (supersetIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `ss-${Date.now().toString(36)}-${supersetIdCounter}`;
}

export function findSupersetPairs(
  exercises: SupersetCandidateExercise[],
  options: SupersetOptions = {}
): SupersetPair[] {
  const { includeUpperLowerStagger = true, blockType = "general" } = options;

  const classified: ClassifiedExercise[] = exercises.map((ex, index) => ({
    id: ex.id,
    index,
    pattern: classifyMovement(ex.name),
  }));

  const paired = new Set<string>();
  const pairs: SupersetPair[] = [];

  for (const rule of SUPERSET_PAIRING_RULES) {
    if (includeUpperLowerStagger === false && rule.kind === "upperLower") continue;
    if (!ruleEnabledForBlock(rule, blockType)) continue;

    const [patternA, patternB] = rule.patterns;
    let best: { a: ClassifiedExercise; b: ClassifiedExercise; gap: number } | null = null;

    for (const a of classified) {
      if (a.pattern !== patternA || paired.has(a.id)) continue;
      for (const b of classified) {
        if (b.pattern !== patternB || paired.has(b.id)) continue;
        const gap = Math.abs(a.index - b.index);
        if (!best || gap < best.gap) best = { a, b, gap };
      }
    }

    if (!best) continue;
    paired.add(best.a.id);
    paired.add(best.b.id);

    const orderedPair: [ClassifiedExercise, ClassifiedExercise] =
      best.a.index <= best.b.index ? [best.a, best.b] : [best.b, best.a];
    const baselineRest = exercises
      .map((ex) => ex.sets?.find((s) => s.restSeconds !== undefined)?.restSeconds)
      .find((r): r is number => r !== undefined);

    pairs.push({
      supersetId: nextSupersetId(),
      ruleId: rule.id,
      label: rule.label,
      shortLabel: rule.shortLabel,
      kind: rule.kind,
      exerciseAId: orderedPair[0].id,
      exerciseBId: orderedPair[1].id,
      indexA: orderedPair[0].index,
      indexB: orderedPair[1].index,
      restSeconds: adjustSupersetRestSeconds(baselineRest),
    });
  }

  return pairs.sort((x, y) => Math.min(x.indexA, x.indexB) - Math.min(y.indexA, y.indexB));
}

function countRestSecondsAfterSet(exercises: SupersetCandidateExercise[], exIndex: number, setIndex: number): number {
  const ex = exercises[exIndex];
  if (!ex || setIndex >= (ex.sets?.length ?? 0) - 1) return 0;
  return ex.sets![setIndex].restSeconds ?? DEFAULT_FULL_REST_SECONDS;
}

function estimateSequentialSeconds(exercises: SupersetCandidateExercise[]): number {
  let total = 0;
  exercises.forEach((ex, exIndex) => {
    (ex.sets ?? []).forEach((_set, setIndex) => {
      total += WORKING_SET_SECONDS + countRestSecondsAfterSet(exercises, exIndex, setIndex);
    });
  });
  return total;
}

export function buildSupersetPlan(
  exercises: SupersetCandidateExercise[],
  options: SupersetOptions = {}
): SupersetPlan {
  const pairs = findSupersetPairs(exercises, options);
  const pairedIds = new Set(pairs.flatMap((p) => [p.exerciseAId, p.exerciseBId]));

  const skippedSpinalExercises = exercises
    .filter((ex) => !pairedIds.has(ex.id) && isSpinalLoading(ex.name))
    .map((ex) => ({ id: ex.id, name: ex.name }));
  const unpairedExerciseIds = exercises
    .filter((ex) => !pairedIds.has(ex.id) && !isSpinalLoading(ex.name))
    .map((ex) => ex.id);

  const originalEstimatedSeconds = estimateSequentialSeconds(exercises);

  const soloIndices = new Set<number>();
  let optimizedEstimatedSeconds = 0;

  for (const pair of pairs) {
    soloIndices.add(pair.indexA);
    soloIndices.add(pair.indexB);
    optimizedEstimatedSeconds +=
      (exercises[pair.indexA].sets?.length ?? 0) * WORKING_SET_SECONDS +
      (exercises[pair.indexB].sets?.length ?? 0) * WORKING_SET_SECONDS +
      ((exercises[pair.indexA].sets?.length ?? 0) + (exercises[pair.indexB].sets?.length ?? 0) - 1) *
        pair.restSeconds;
  }

  exercises.forEach((ex, exIndex) => {
    if (soloIndices.has(exIndex)) return;
    (ex.sets ?? []).forEach((_set, setIndex) => {
      optimizedEstimatedSeconds += WORKING_SET_SECONDS + countRestSecondsAfterSet(exercises, exIndex, setIndex);
    });
  });

  const estimatedSecondsSaved = Math.max(0, originalEstimatedSeconds - optimizedEstimatedSeconds);
  const estimatedTimeSavedPct =
    originalEstimatedSeconds > 0 ? Math.round((estimatedSecondsSaved / originalEstimatedSeconds) * 100) : 0;

  return {
    pairs,
    pairedExerciseIds: [...pairedIds],
    skippedSpinalExercises,
    unpairedExerciseIds,
    originalEstimatedSeconds,
    optimizedEstimatedSeconds,
    estimatedSecondsSaved,
    estimatedTimeSavedPct,
  };
}

type WithSupersetMetadata<T> = T & {
  supersetId?: string;
  supersetOrder?: "A" | "B";
};

export function applySupersetPlan<T extends SupersetCandidateExercise>(
  exercises: T[],
  plan: SupersetPlan
): WithSupersetMetadata<T>[] {
  const metadataById = new Map<
    string,
    { supersetId: string; supersetOrder: "A" | "B"; restSeconds: number }
  >();

  for (const pair of plan.pairs) {
    const firstId = pair.indexA <= pair.indexB ? pair.exerciseAId : pair.exerciseBId;
    const secondId = pair.indexA <= pair.indexB ? pair.exerciseBId : pair.exerciseAId;
    metadataById.set(firstId, { supersetId: pair.supersetId, supersetOrder: "A", restSeconds: pair.restSeconds });
    metadataById.set(secondId, { supersetId: pair.supersetId, supersetOrder: "B", restSeconds: pair.restSeconds });
  }

  return exercises.map((ex) => {
    const meta = metadataById.get(ex.id);
    if (!meta) {
      const next: WithSupersetMetadata<T> = { ...ex };
      delete next.supersetId;
      delete next.supersetOrder;
      return next;
    }
    return {
      ...ex,
      supersetId: meta.supersetId,
      supersetOrder: meta.supersetOrder,
      sets: (ex.sets ?? []).map((set) => ({ ...set, restSeconds: meta.restSeconds })),
    };
  });
}

export function clearSupersets<T extends WithSupersetMetadata<SupersetCandidateExercise>>(exercises: T[]): T[] {
  return exercises.map((ex) => {
    const next = { ...ex };
    delete next.supersetId;
    delete next.supersetOrder;
    return next;
  });
}
