import type { DayPlan, GymTemplate, LoggedSession } from "@/types";
import { BASE_SEQUENCES, DRILL_LIBRARY, SORENESS_EXTRA_DRILLS } from "./drills";
import type {
  BodyRegion,
  GeneratePrehabInput,
  PrehabContext,
  PrehabProtocol,
  PrehabStep,
  SorenessFlag,
} from "./types";

const CONTEXT_META: Record<PrehabContext, { title: string; subtitle: string }> = {
  "upper-push": {
    title: "Oberkörper Push – Aktivierung & Mobilität",
    subtitle: "Rotator Cuff, Brustwirbelsäule & Handgelenke bereit machen",
  },
  "upper-pull": {
    title: "Oberkörper Pull – Schulter & BWS vorbereiten",
    subtitle: "Scap-Control und Drehmobilität für starke Züge",
  },
  "lower-body": {
    title: "Unterkörper – Hüfte, Knöchel & Glutes",
    subtitle: "Hüftöffnung, Knöchelmobilität & Glute-Feuerung für tiefe Kniebeugen",
  },
  "cycling-intervals": {
    title: "Rad-Intervalle – Hüfte & Hamstrings",
    subtitle: "Hüftbeuger öffnen, Hamstrings dynamisch machen, Pedalkreis aktivieren",
  },
  "cycling-endurance": {
    title: "Ausfahrt-Setup – Hüfte & Trittfrequenz",
    subtitle: "Locker mobilisieren und den Pedalkreis auf Tempo bringen",
  },
  running: {
    title: "Lauf-Setup – Waden, Knöchel & Hüfte",
    subtitle: "Laufmuster scharf schalten und Sehnen federbereit machen",
  },
  general: {
    title: "Mobility Full Body Flow",
    subtitle: "Ganzkörper-Durchgang für Beweglichkeit & Puls",
  },
};

const CYCLING_INTERVAL_KEYWORDS = ["intervall", "schwelle", "zeitfahr", "time trial"];
const CYCLING_INTERVAL_PATTERN = /\d+\s*x\s*\d+/;

const PUSH_KEYWORDS = [
  "bankdrücken",
  "bankdruecken",
  "bench",
  "schulterdrücken",
  "shoulder press",
  "überkopf",
  "ohp",
  "dips",
  "upper push",
  "brust",
  "push",
];

const PULL_KEYWORDS = [
  "klimmzug",
  "pull-up",
  "pullup",
  "rudern",
  "row",
  "latzug",
  "bizeps",
  "upper pull",
  "face pull",
];

const LOWER_KEYWORDS = [
  "kniebeuge",
  "squat",
  "kreuzheben",
  "deadlift",
  "ausfallschritt",
  "lunge",
  "beinpresse",
  "rumänisch",
  "rdl",
  "wadenheben",
  "unterkörper",
  "lower body",
  "bein",
];

interface RegionPattern {
  region: BodyRegion;
  label: string;
  patterns: RegExp[];
}

const REGION_PATTERNS: RegionPattern[] = [
  {
    region: "hamstring",
    label: "Hamstrings (hintere Oberschenkel)",
    patterns: [/hamstring/, /beinbeuger/, /ischi/, /hintere[nm]? oberschenkel/],
  },
  {
    region: "quad",
    label: "Quadrizeps",
    patterns: [/quadrizeps/, /quad(?!ric)/, /vorderer oberschenkel/],
  },
  {
    region: "adductor",
    label: "Adduktoren (Leiste)",
    patterns: [/leiste/, /adduktor/, /adductor/, /innenseite/, /groin/],
  },
  {
    region: "hipFlexor",
    label: "Hüftbeuger",
    patterns: [/hüftbeuger/, /hip flexor/, /iliopsoas/],
  },
  {
    region: "hip",
    label: "Hüfte",
    patterns: [/hüf(t|te|ften)(?!beuger)/, /hip(?! flexor)/],
  },
  {
    region: "glute",
    label: "Gesäß / Glutes",
    patterns: [/glute/, /gesäß/, /po\b/, /ischiocrural/],
  },
  {
    region: "knee",
    label: "Knie",
    patterns: [/knie(?!beug)/, /knees?/],
  },
  {
    region: "ankle",
    label: "Knöchel / Fußsohlen",
    patterns: [/knöchel/, /ankle/, /fußsohle/, /\bfuß\b/, /foot/, /plantar/],
  },
  {
    region: "calf",
    label: "Waden",
    patterns: [/\bwad(e|en)\b/, /calf/],
  },
  {
    region: "shoulder",
    label: "Schultern",
    patterns: [/schulter/, /shoulder/, /rotator/, /cuff/],
  },
  {
    region: "chest",
    label: "Brust",
    patterns: [/brust(?!wirbel)/, /\bpec\b/, /pector/],
  },
  {
    region: "thoracic",
    label: "Brustwirbelsäule",
    patterns: [/brustwirbel/, /\bbws\b/, /thoracic/, /oberer rücken/, /upper back/],
  },
  {
    region: "lowerBack",
    label: "Unterer Rücken (LWS)",
    patterns: [/rücken/, /\bback\b/, /lenden/, /\blws\b/, /lumbar/],
  },
  {
    region: "wrist",
    label: "Handgelenke",
    patterns: [/handgelenk/, /wrist/],
  },
  {
    region: "forearm",
    label: "Unterarme",
    patterns: [/unterarm/, /forearm/, /ellbogen/],
  },
];

export function deriveWorkoutDate(dayIndex: number): string {
  const now = new Date();
  const jsDay = now.getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const d = new Date(now);
  d.setDate(now.getDate() + (dayIndex - todayIdx));
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${dayOfMonth}`;
}

function parseLocalDate(value: string): Date {
  const ymd = value.slice(0, 10).split("-").map(Number);
  return new Date(ymd[0], (ymd[1] ?? 1) - 1, ymd[2] ?? 1);
}

function diffInDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86400000);
}

export function detectPrehabContext(
  day: Pick<DayPlan, "workoutType" | "title" | "description">,
  template?: GymTemplate | null
): PrehabContext {
  if (day.workoutType === "cycling") {
    const haystack = [day.title, day.description].join(" ").toLowerCase();
    return CYCLING_INTERVAL_KEYWORDS.some((kw) => haystack.includes(kw)) ||
      CYCLING_INTERVAL_PATTERN.test(haystack)
      ? "cycling-intervals"
      : "cycling-endurance";
  }
  if (day.workoutType === "running") return "running";
  if (
    day.workoutType === "rest" ||
    day.workoutType === "stretching" ||
    day.workoutType === "warmup" ||
    day.workoutType === "mobility"
  ) {
    return "general";
  }

  const haystack = [
    day.title,
    day.description,
    template?.name ?? "",
    ...(template?.exercises.map((ex) => ex.name) ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const score = (keywords: string[]) =>
    keywords.reduce((n, kw) => (haystack.includes(kw) ? n + 1 : n), 0);

  const scores: Array<[PrehabContext, number]> = [
    ["lower-body", score(LOWER_KEYWORDS)],
    ["upper-push", score(PUSH_KEYWORDS)],
    ["upper-pull", score(PULL_KEYWORDS)],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : "general";
}

export function extractSorenessFlags(
  sessions: LoggedSession[],
  workoutDate: string
): SorenessFlag[] {
  const workout = parseLocalDate(workoutDate);
  const candidates = sessions
    .filter((s) => s.notes && s.notes.trim().length > 0)
    .map((s) => ({ session: s, gapDays: diffInDays(workout, parseLocalDate(s.date)) }))
    .filter((c) => c.gapDays >= 1 && c.gapDays <= 3);

  if (candidates.length === 0) return [];

  const minGap = Math.min(...candidates.map((c) => c.gapDays));
  const mostRecent = candidates.filter((c) => c.gapDays === minGap);

  const flags: SorenessFlag[] = [];
  const seenRegions = new Set<BodyRegion>();

  for (const { session } of mostRecent) {
    const note = session.notes!.trim();
    for (const entry of REGION_PATTERNS) {
      if (seenRegions.has(entry.region)) continue;
      if (entry.patterns.some((p) => p.test(note.toLowerCase()))) {
        seenRegions.add(entry.region);
        flags.push({
          region: entry.region,
          label: entry.label,
          note: note.length > 90 ? `${note.slice(0, 87)}…` : note,
          sessionDate: session.date.slice(0, 10),
        });
      }
    }
  }
  return flags;
}

function roundToStep(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function budgetDurations(steps: PrehabStep[], targetSeconds: number): number[] {
  const MIN = 25;
  const MAX = 90;
  const STEP = 5;
  const baseSum = steps.reduce((sum, s) => sum + s.durationSeconds, 0) || 1;
  const durations = steps.map((s) =>
    Math.min(MAX, Math.max(MIN, roundToStep((s.durationSeconds * targetSeconds) / baseSum, STEP)))
  );

  const total = () => durations.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (total() !== targetSeconds && guard++ < 500) {
    if (total() < targetSeconds) {
      let adjusted = false;
      for (let i = 0; i < durations.length && total() < targetSeconds; i++) {
        if (durations[i] < MAX) {
          durations[i] += STEP;
          adjusted = true;
        }
      }
      if (!adjusted) break;
    } else {
      let adjusted = false;
      for (let i = durations.length - 1; i >= 0 && total() > targetSeconds; i--) {
        if (durations[i] > MIN) {
          durations[i] -= STEP;
          adjusted = true;
        }
      }
      if (!adjusted) break;
    }
  }
  return durations;
}

export function generatePrehabProtocol(input: GeneratePrehabInput): PrehabProtocol {
  const context = detectPrehabContext(input.day, input.template);
  const baseIds = BASE_SEQUENCES[context];

  const steps: PrehabStep[] = baseIds
    .map((id) => DRILL_LIBRARY[id])
    .filter(Boolean)
    .map((drill) => ({ ...drill }));

  const workoutDate =
    input.workoutDateOverride ?? deriveWorkoutDate(input.day.dayIndex);
  const flags = extractSorenessFlags(input.sessions ?? [], workoutDate);

  for (const flag of flags) {
    const extraIds = SORENESS_EXTRA_DRILLS[flag.region] ?? [];
    const extraId = extraIds.find(
      (id) => !steps.some((step) => step.id === id)
    );
    if (extraId) {
      steps.push({
        ...DRILL_LIBRARY[extraId],
        isSorenessBoost: true,
        reason: `Feedback vom Vortag (${flag.label}): „${flag.note}"`,
      });
    }
  }

  const targetSeconds = input.targetSeconds ?? 300;
  const durations = budgetDurations(steps, targetSeconds);
  const finalSteps = steps.map((step, i) => ({
    ...step,
    durationSeconds: durations[i],
  }));

  return {
    context,
    title: CONTEXT_META[context].title,
    subtitle: CONTEXT_META[context].subtitle,
    targetSeconds,
    steps: finalSteps,
    totalSeconds: finalSteps.reduce((sum, s) => sum + s.durationSeconds, 0),
    sorenessFlags: flags,
  };
}
