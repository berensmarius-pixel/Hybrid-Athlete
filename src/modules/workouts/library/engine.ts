import type {
  DayPlan,
  EnduranceSession,
  EnduranceTemplate,
  GarminActivity,
  GymSession,
  GymTemplate,
} from "@/types";
import {
  classifyIntensity,
  detectTotalDurationMinutes,
  extractFtpPctRange,
  generateEnduranceSteps,
  type FitnessProfile,
  type GeneratedWorkoutStep,
  type IntensityCategory,
  type StepTarget,
} from "@/lib/workout/targetEngine";
import type {
  BuildLibraryInput,
  ComplianceData,
  ComplianceMetric,
  IntensityFocus,
  LibraryDiscipline,
  LibraryFilters,
  LibrarySortMode,
  LibraryStep,
  LibraryStepPhase,
  LibraryWorkout,
  SparklineSegment,
} from "./types";

const POWER_ZONE_PCT: Record<number, { low: number; high: number }> = {
  1: { low: 0.4, high: 0.55 },
  2: { low: 0.56, high: 0.75 },
  3: { low: 0.76, high: 0.9 },
  4: { low: 0.91, high: 1.05 },
  5: { low: 1.06, high: 1.2 },
  6: { low: 1.21, high: 1.6 },
  7: { low: 1.21, high: 2 },
};

const HR_ZONE_HRR: Record<number, { low: number; high: number }> = {
  1: { low: 0.4, high: 0.5 },
  2: { low: 0.5, high: 0.6 },
  3: { low: 0.6, high: 0.7 },
  4: { low: 0.7, high: 0.8 },
  5: { low: 0.8, high: 0.92 },
};

const FOCUS_DEFAULT_FTP_PCT: Partial<Record<IntensityFocus, { low: number; high: number }>> = {
  z2: { low: 0.6, high: 0.75 },
  sweetspot: { low: 0.88, high: 0.94 },
  "threshold-vo2max": { low: 0.95, high: 1.15 },
};

const MAX_STRENGTH_AVG_REPS = 5;
const HYPERTROPHY_MIN_REPS = 8;

function normalizeText(value: string): string {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function parseDurationToSeconds(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === "number") return Math.max(0, Math.round(raw * 60));
  let working = raw.trim();
  if (!working) return 0;
  let total = 0;
  const hourMatch = working.match(/(\d+(?:[.,]\d+)?)\s*h/i);
  if (hourMatch) {
    total += parseFloat(hourMatch[1].replace(",", ".")) * 3600;
    working = working.replace(hourMatch[0], " ");
    const trailingMinutes = working.match(/(\d{1,2})\s*(?:min)?/i);
    if (trailingMinutes) {
      total += parseInt(trailingMinutes[1], 10) * 60;
      return Math.round(total);
    }
  }
  const rangeMatch = working.match(/(\d{1,3})\s*(?:-|–)\s*(\d{1,3})/i);
  if (rangeMatch) {
    const average =
      (parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2;
    return Math.round(total + average * 60);
  }
  const minuteMatch = working.match(/(\d{1,3})/);
  if (minuteMatch) total += parseInt(minuteMatch[1], 10) * 60;
  return Math.round(total);
}

export function rpeToIf(rpe: number): number {
  return Math.min(1.05, Math.max(0.35, 0.3 + rpe * 0.07));
}

export function estimateEnduranceTss(durationSeconds: number, intensityFactor: number): number {
  if (durationSeconds <= 0 || intensityFactor <= 0) return 0;
  return Math.round((durationSeconds / 3600) * intensityFactor * intensityFactor * 100);
}

export function estimateGymTss(
  totalSets: number,
  durationSeconds: number,
  discipline: LibraryDiscipline
): number {
  const perMin = discipline === "mobility" ? 0.35 : 0.55;
  const durationBased = Math.round((durationSeconds / 60) * perMin);
  return Math.max(Math.round(totalSets * 1.6), durationBased);
}

export function deriveFocusTagsForEndurance(text: string): IntensityFocus[] {
  const tags = new Set<IntensityFocus>();
  const category: IntensityCategory | null =
    classifyIntensity(text) ?? classifyIntensity(normalizeText(text));
  if (
    category === "endurance" ||
    category === "activeRecovery" ||
    category === "recovery"
  ) {
    tags.add("z2");
  }
  if (category === "sweetspot") tags.add("sweetspot");
  if (
    category === "threshold" ||
    category === "vo2max" ||
    category === "overUnder" ||
    category === "sprint" ||
    category === "neuromuscular"
  ) {
    tags.add("threshold-vo2max");
  }
  const pct = extractFtpPctRange(text);
  if (pct) {
    const mid = (pct.low + pct.high) / 2;
    if (mid < 0.85) tags.add("z2");
    else if (mid <= 0.95) tags.add("sweetspot");
    else tags.add("threshold-vo2max");
  }
  if (/hypertroph|muskelaufbau|muscle\s+growth/i.test(text)) tags.add("hypertrophy");
  if (/max(?:imal)?[-\s]?kraft|maximum\s+strength|kraftausdauer|\b5x5\b/i.test(text)) {
    tags.add("max-strength");
  }
  return Array.from(tags);
}

export function deriveFocusTagsForGym(exercises: GymTemplate["exercises"]): IntensityFocus[] {
  const tags = new Set<IntensityFocus>();
  let repSum = 0;
  let repCount = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (typeof set.targetReps === "number" && set.targetReps > 0) {
        repSum += set.targetReps;
        repCount += 1;
      }
    }
  }
  if (repCount === 0) return [];
  const avgReps = repSum / repCount;
  if (avgReps <= MAX_STRENGTH_AVG_REPS + 1) tags.add("max-strength");
  if (avgReps >= HYPERTROPHY_MIN_REPS - 2) tags.add("hypertrophy");
  if (tags.size === 0) tags.add("hypertrophy");
  return Array.from(tags);
}

function targetToRanges(target: StepTarget | null, profile: FitnessProfile) {
  if (!target) return null;
  const result: {
    ftpPct?: { low: number; high: number };
    watts?: { min: number; max: number };
    bpm?: { min: number; max: number };
    cadence?: { min: number; max: number };
  } = {};
  if (target.kind === "customPowerRange") {
    if (target.minWatts !== undefined && target.maxWatts !== undefined && profile.ftpWatts > 0) {
      result.watts = { min: target.minWatts, max: target.maxWatts };
      result.ftpPct = {
        low: Math.round((target.minWatts / profile.ftpWatts) * 100) / 100,
        high: Math.round((target.maxWatts / profile.ftpWatts) * 100) / 100,
      };
    } else if (target.zone !== undefined) {
      result.ftpPct = POWER_ZONE_PCT[target.zone] ?? POWER_ZONE_PCT[2];
      result.watts = {
        min: Math.round(profile.ftpWatts * (result.ftpPct.low ?? 0)),
        max: Math.round(profile.ftpWatts * (result.ftpPct.high ?? 0)),
      };
    }
  } else if (target.kind === "powerZone") {
    result.ftpPct = POWER_ZONE_PCT[target.zone ?? 2] ?? POWER_ZONE_PCT[2];
    result.watts = {
      min: Math.round(profile.ftpWatts * (result.ftpPct?.low ?? 0)),
      max: Math.round(profile.ftpWatts * (result.ftpPct?.high ?? 0)),
    };
  } else if (target.kind === "heartRateZone") {
    const hrr = profile.maxHr - profile.restingHr;
    const zone = HR_ZONE_HRR[target.zone ?? 2] ?? HR_ZONE_HRR[2];
    result.bpm = {
      min: Math.round(profile.restingHr + hrr * zone.low),
      max: Math.round(profile.restingHr + hrr * zone.high),
    };
  } else if (target.kind === "heartRateRange") {
    if (target.minBpm !== undefined && target.maxBpm !== undefined) {
      result.bpm = { min: target.minBpm, max: target.maxBpm };
    }
  } else if (target.kind === "cadenceRange") {
    if (target.minRpm !== undefined) {
      result.cadence = { min: target.minRpm, max: target.maxRpm ?? target.minRpm + 5 };
    }
  }
  return result;
}

function mapGeneratedPhase(phase: GeneratedWorkoutStep["phase"]): LibraryStepPhase {
  switch (phase) {
    case "warmup":
      return "warmup";
    case "cooldown":
      return "cooldown";
    case "recovery":
      return "rest";
    default:
      return "work";
  }
}

const PHASE_CATEGORY_FALLBACK: Partial<Record<LibraryStepPhase, { low: number; high: number }>> = {
  warmup: { low: 0.45, high: 0.65 },
  rest: { low: 0.4, high: 0.55 },
  cooldown: { low: 0.4, high: 0.6 },
};

export function stepsFromGeneratedSteps(
  generated: GeneratedWorkoutStep[],
  profile: FitnessProfile
): LibraryStep[] {
  return generated.map((step, index) => {
    const phase = mapGeneratedPhase(step.phase);
    const primary = targetToRanges(step.primaryTarget, profile);
    const secondary = targetToRanges(step.secondaryTarget, profile);
    let ftpPct = primary?.ftpPct;
    let watts = primary?.watts;
    const bpm = secondary?.bpm ?? primary?.bpm;
    const cadence = secondary?.cadence;
    if (!ftpPct) {
      const intensityFocus: IntensityFocus | undefined =
        step.intensity === "endurance"
          ? "z2"
          : step.intensity === "sweetspot"
            ? "sweetspot"
            : step.intensity &&
                ["threshold", "vo2max", "overUnder", "sprint", "neuromuscular"].includes(
                  step.intensity
                )
              ? "threshold-vo2max"
              : undefined;
      ftpPct =
        (intensityFocus ? FOCUS_DEFAULT_FTP_PCT[intensityFocus] : undefined) ??
        PHASE_CATEGORY_FALLBACK[phase];
      if (watts === undefined && ftpPct && profile.ftpWatts > 0) {
        watts = {
          min: Math.round(profile.ftpWatts * ftpPct.low),
          max: Math.round(profile.ftpWatts * ftpPct.high),
        };
      }
    }
    return {
      id: `step-${index}`,
      phase,
      label: step.label,
      durationSeconds: step.durationSeconds,
      distanceMeters: step.distanceMeters,
      ftpPct,
      watts,
      bpm,
      cadence,
      notes: step.notes || undefined,
    };
  });
}

export function buildSparklineFromSteps(steps: LibraryStep[]): SparklineSegment[] {
  const segments = steps.map((step) => {
    const midPct = step.ftpPct ? (step.ftpPct.low + step.ftpPct.high) / 2 : undefined;
    const pctByPhase: Record<LibraryStepPhase, number> = {
      warmup: 0.45,
      work: 0.8,
      rest: 0.35,
      cooldown: 0.4,
    };
    return {
      pct: midPct ?? pctByPhase[step.phase],
      weight:
        step.durationSeconds && step.durationSeconds > 0
          ? step.durationSeconds
          : step.sets && step.sets > 0
            ? step.sets * 180
            : 300,
      phase: step.phase,
    };
  });
  const total = segments.reduce((sum, s) => sum + s.weight, 0);
  if (total <= 0) return segments.length > 0 ? segments : [];
  return segments;
}

export function buildSparklineFromZones(zoneMinutes: number[] | undefined): SparklineSegment[] {
  if (!zoneMinutes || zoneMinutes.length === 0) return [];
  return zoneMinutes
    .map((minutes, index) => ({
      pct: index / Math.max(1, zoneMinutes.length - 1) * 0.9 + 0.1,
      weight: minutes,
      phase: (index >= 3 ? "work" : index <= 0 ? "warmup" : "rest") as LibraryStepPhase,
    }))
    .filter((segment) => segment.weight > 0);
}

function buildCompliance(
  planned: { durationSeconds?: number; tss?: number; rpe?: number; sets?: number },
  actual: { durationSeconds?: number; tss?: number; rpe?: number; sets?: number }
): ComplianceData | undefined {
  const metrics: ComplianceMetric[] = [];
  if (planned.durationSeconds && actual.durationSeconds) {
    metrics.push({
      key: "duration",
      label: "Dauer",
      planned: Math.round(planned.durationSeconds / 60),
      actual: Math.round(actual.durationSeconds / 60),
      unit: "min",
      higherIsBetter: false,
    });
  }
  if (planned.tss && actual.tss) {
    metrics.push({
      key: "tss",
      label: "Load",
      planned: planned.tss,
      actual: actual.tss,
      unit: "TSS",
      higherIsBetter: false,
    });
  }
  if (planned.rpe && actual.rpe) {
    metrics.push({
      key: "rpe",
      label: "Empfindung",
      planned: planned.rpe,
      actual: actual.rpe,
      unit: "RPE",
      higherIsBetter: false,
    });
  }
  if (planned.sets && actual.sets) {
    metrics.push({
      key: "sets",
      label: "Sätze",
      planned: planned.sets,
      actual: actual.sets,
      unit: "",
      higherIsBetter: true,
    });
  }
  return metrics.length > 0 ? { metrics } : undefined;
}

function uniqueMuscles(template: GymTemplate): string[] {
  const muscles = new Set<string>();
  for (const ex of template.exercises) {
    if (ex.muscleGroup) muscles.add(ex.muscleGroup);
    else if (ex.muscles?.length) muscles.add(ex.muscles[0]);
  }
  return Array.from(muscles).slice(0, 4);
}

function gymTemplateToWorkout(
  template: GymTemplate,
  planDayIndex?: number
): LibraryWorkout {
  const discipline: LibraryDiscipline =
    template.type === "gym" ? "gym" : "mobility";
  const totalSets = template.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const durationSeconds = totalSets * 165 + 300;
  const rpeTarget = template.exercises
    .flatMap((ex) => ex.sets)
    .map((set) => set.targetRpe)
    .find((rpe): rpe is number => typeof rpe === "number");
  const steps: LibraryStep[] = template.exercises.map((ex, index) => ({
    id: `gx-${index}`,
    phase: "work",
    label: ex.name,
    sets: ex.sets.length,
    reps: ex.sets.find((s) => typeof s.targetReps === "number")?.targetReps,
    durationSeconds:
      ex.sets.find((s) => typeof s.targetDuration === "number")?.targetDuration ?? undefined,
    notes:
      ex.description ||
      `${ex.sets.length} Sätze${
        ex.sets.some((s) => typeof s.targetReps === "number")
          ? ` × ~${ex.sets.find((s) => s.targetReps)?.targetReps} Wdh`
          : ex.sets.some((s) => typeof s.targetDuration === "number")
            ? ` × ${ex.sets.find((s) => s.targetDuration)?.targetDuration}s`
            : ""
      }`,
  }));
  const searchTextParts = [
    template.name,
    ...template.exercises.flatMap((ex) => [ex.name, ...(ex.muscles ?? []), ex.muscleGroup ?? ""]),
  ];
  return {
    id: `lib-tpl-gym-${template.id}`,
    title: template.name,
    description: undefined,
    discipline,
    status: "planned",
    origin: "template-gym",
    templateKind: template.type,
    templateId: template.id,
    planDayIndex,
    durationSeconds,
    estimatedTss: estimateGymTss(totalSets, durationSeconds, discipline),
    focusTags: deriveFocusTagsForGym(template.exercises),
    primaryMuscles: uniqueMuscles(template),
    rpeTarget,
    steps,
    sparkline: buildSparklineFromSteps(steps),
    searchText: normalizeText(searchTextParts.join(" ")),
  };
}

function enduranceTemplateToWorkout(
  template: EnduranceTemplate,
  profile: FitnessProfile,
  planDayIndex?: number
): LibraryWorkout {
  const generated = generateEnduranceSteps(template.description, template.name, {
    profile,
    totalDurationMins: detectTotalDurationMinutes(
      template.description,
      parseDurationToSeconds(template.estimatedDuration) / 60 || 60
    ),
  });
  const steps = stepsFromGeneratedSteps(generated, profile);
  const focusTags = deriveFocusTagsForEndurance(`${template.name} ${template.description}`);
  const ftpPct =
    extractFtpPctRange(template.description) ??
    (focusTags.includes("sweetspot")
      ? FOCUS_DEFAULT_FTP_PCT.sweetspot
      : focusTags.includes("threshold-vo2max")
        ? FOCUS_DEFAULT_FTP_PCT["threshold-vo2max"]
        : FOCUS_DEFAULT_FTP_PCT.z2);
  const durationSeconds =
    steps.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) ||
    parseDurationToSeconds(template.estimatedDuration) ||
    detectTotalDurationMinutes(template.description, 60) * 60;
  const ifValue = ftpPct ? (ftpPct.low + ftpPct.high) / 2 : 0.65;
  return {
    id: `lib-tpl-end-${template.id}`,
    title: template.name,
    description: template.description,
    discipline: template.type,
    status: "planned",
    origin: "template-endurance",
    templateKind: template.type,
    templateId: template.id,
    planDayIndex,
    durationSeconds,
    estimatedTss: estimateEnduranceTss(durationSeconds, ifValue),
    focusTags,
    ftpPct,
    steps,
    sparkline: buildSparklineFromSteps(steps),
    primaryMuscles: [],
    searchText: normalizeText(`${template.name} ${template.description}`),
  };
}

function planDayToWorkout(
  day: DayPlan,
  todayIndex: number,
  profile: FitnessProfile
): LibraryWorkout | null {
  if (day.workoutType === "rest") return null;
  const isEndurance = day.workoutType === "cycling" || day.workoutType === "running";
  const skipped = day.dayIndex < todayIndex && !day.isCompleted;
  let steps: LibraryStep[] = [];
  if (isEndurance && day.description) {
    steps = stepsFromGeneratedSteps(
      generateEnduranceSteps(day.description, day.title, { profile }),
      profile
    );
  } else {
    steps = [
      {
        id: `plan-${day.dayIndex}-main`,
        phase: "work",
        label: day.title,
        notes: day.description || undefined,
      },
    ];
  }
  const focusTags = isEndurance
    ? deriveFocusTagsForEndurance(`${day.title} ${day.description}`)
    : day.workoutType === "mobility"
      ? []
      : deriveFocusTagsForGym([
          {
            id: "plan-ex",
            name: day.title,
            sets: [{ id: "plan-set", type: "working", targetReps: 10 }],
          },
        ]);
  return {
    id: `lib-plan-${day.dayIndex}`,
    title: day.title,
    description: day.description,
    discipline: day.workoutType as LibraryDiscipline,
    status: skipped ? "skipped" : "planned",
    origin: "plan",
    templateId: day.templateId,
    planDayIndex: day.dayIndex,
    durationSeconds: detectTotalDurationMinutes(day.description, 60) * 60,
    estimatedTss: estimateEnduranceTss(
      detectTotalDurationMinutes(day.description, 60) * 60,
      0.65
    ),
    focusTags,
    steps,
    sparkline: buildSparklineFromSteps(steps),
    primaryMuscles: [],
    searchText: normalizeText(`${day.title} ${day.description}`),
  };
}

function gymSessionToWorkout(session: GymSession, gymTemplates: GymTemplate[]): LibraryWorkout {
  const discipline: LibraryDiscipline =
    session.kind === "gym" ? "gym" : "mobility";
  const totalSets = session.entries.reduce((sum, e) => sum + e.sets.length, 0);
  const completedSets = session.entries.reduce(
    (sum, e) => sum + e.sets.filter((s) => s.isCompleted !== false).length,
    0
  );
  const durationSeconds = totalSets * 165 + 300;
  const steps: LibraryStep[] = session.entries.map((entry, index) => {
    const firstCompleted = entry.sets.find(
      (s) => Number(s.weight) > 0 && Number(s.reps) > 0
    );
    return {
      id: `lg-${session.id}-${index}`,
      phase: "work",
      label: entry.exercise || "Übung",
      sets: entry.sets.length,
      reps:
        entry.sets.find((s) => Number(s.reps) > 0)?.reps !== undefined
          ? Number(entry.sets.find((s) => Number(s.reps) > 0)?.reps)
          : undefined,
      notes: firstCompleted
        ? `Top-Satz: ${firstCompleted.weight} kg × ${firstCompleted.reps}`
        : `${entry.sets.filter((s) => s.isCompleted !== false).length}/${entry.sets.length} Sätze erledigt`,
    };
  });
  const template = session.templateId
    ? gymTemplates.find((t) => t.id === session.templateId)
    : undefined;
  const plannedTss = template
    ? estimateGymTss(
        template.exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
        durationSeconds,
        discipline
      )
    : undefined;
  const compliance = template
    ? buildCompliance(
        {
          durationSeconds,
          tss: plannedTss,
          sets: template.exercises.reduce((sum, ex) => sum + ex.sets.length, 0),
        },
        { tss: estimateGymTss(totalSets, durationSeconds, discipline), sets: completedSets }
      )
    : undefined;
  return {
    id: `lib-log-${session.id}`,
    title: session.templateName || "Krafttraining",
    description: session.notes,
    discipline,
    status: "completed",
    origin: "logged",
    templateKind: session.kind,
    templateId: session.templateId,
    date: session.date,
    durationSeconds,
    estimatedTss: estimateGymTss(totalSets, durationSeconds, discipline),
    focusTags: deriveFocusTagsForGym(
      session.entries.map((e) => ({
        id: e.id,
        name: e.exercise,
        sets: e.sets.map((s) => ({
          id: s.id,
          type: s.type,
          targetReps: Number(s.reps) || undefined,
        })),
      }))
    ),
    primaryMuscles: Array.from(
      new Set(session.entries.map((e) => e.exercise).filter(Boolean))
    ).slice(0, 4),
    rpeTarget: session.rpe,
    steps,
    sparkline: buildSparklineFromSteps(steps),
    compliance,
    sourceLabel: /ki[-\s]|ai[-\s]|coach/i.test(session.templateName ?? "") ? "KI-Coach" : undefined,
    searchText: normalizeText(
      [
        session.templateName,
        session.notes,
        ...session.entries.map((e) => e.exercise),
      ]
        .filter(Boolean)
        .join(" ")
    ),
  };
}

function enduranceSessionToWorkout(
  session: EnduranceSession,
  enduranceTemplates: EnduranceTemplate[]
): LibraryWorkout {
  const durationSeconds = parseDurationToSeconds(session.duration) || 3600;
  const ifValue = rpeToIf(session.rpe);
  const steps: LibraryStep[] = [
    {
      id: `le-${session.id}-main`,
      phase: "work",
      label: session.templateName || (session.activityType === "cycling" ? "Radeinheit" : "Laufeinheit"),
      durationSeconds,
      bpm:
        typeof session.heartRate === "number" && session.heartRate > 0
          ? { min: Math.round(session.heartRate * 0.95), max: Math.round(session.heartRate * 1.05) }
          : undefined,
      notes: session.pace ? `Ø Pace ${session.pace}` : undefined,
    },
  ];
  const template = session.templateId
    ? enduranceTemplates.find((t) => t.id === session.templateId)
    : undefined;
  const plannedIfValue = template
    ? (() => {
        const pct = extractFtpPctRange(template.description);
        return pct ? (pct.low + pct.high) / 2 : 0.65;
      })()
    : undefined;
  const compliance = template
    ? buildCompliance(
        {
          durationSeconds: parseDurationToSeconds(template.estimatedDuration) || 3600,
          tss: estimateEnduranceTss(durationSeconds, plannedIfValue ?? 0.65),
        },
        { durationSeconds, tss: estimateEnduranceTss(durationSeconds, ifValue) }
      )
    : undefined;
  const zoneSparkline = buildSparklineFromZones(session.hrZones);
  return {
    id: `lib-log-${session.id}`,
    title: session.templateName || (session.activityType === "cycling" ? "Radeinheit" : "Laufeinheit"),
    description: session.notes,
    discipline: session.activityType,
    status: "completed",
    origin: "logged",
    templateKind: session.activityType,
    templateId: session.templateId,
    date: session.date,
    durationSeconds,
    estimatedTss: estimateEnduranceTss(durationSeconds, ifValue),
    focusTags: deriveFocusTagsForEndurance(`${session.templateName ?? ""} ${session.notes ?? ""}`),
    rpeTarget: session.rpe,
    primaryMuscles: [],
    steps,
    sparkline:
      zoneSparkline.length > 0 ? zoneSparkline : buildSparklineFromSteps(steps),
    compliance,
    sourceLabel: session.stravaId ? "Strava" : undefined,
    searchText: normalizeText(
      [session.templateName, session.notes].filter(Boolean).join(" ")
    ),
  };
}

function garminActivityToWorkout(activity: GarminActivity): LibraryWorkout {
  const discipline: LibraryDiscipline =
    activity.type === "running"
      ? "running"
      : activity.type === "cycling"
        ? "cycling"
        : /mobil|stretch|yoga|dehn/i.test(activity.name)
          ? "mobility"
          : "gym";
  const durationSeconds = activity.durationSeconds || 0;
  const tss =
    activity.tss ??
    (activity.workKJ ? Math.round(activity.workKJ) : estimateEnduranceTss(durationSeconds, 0.7));
  const steps: LibraryStep[] = [
    {
      id: `ga-${activity.id}-main`,
      phase: "work",
      label: activity.name,
      durationSeconds,
      watts:
        activity.avgPowerWatts && activity.maxPowerWatts
          ? { min: activity.avgPowerWatts, max: activity.maxPowerWatts }
          : undefined,
      bpm:
        activity.avgHeartRate && activity.maxHeartRate
          ? { min: activity.avgHeartRate, max: activity.maxHeartRate }
          : undefined,
      cadence: activity.avgCadenceRpm
        ? { min: Math.round(activity.avgCadenceRpm - 4), max: Math.round(activity.avgCadenceRpm + 4) }
        : undefined,
      notes: [
        activity.distanceMeters > 0
          ? `${(activity.distanceMeters / 1000).toFixed(1)} km`
          : null,
        activity.elevationGainMeters ? `${Math.round(activity.elevationGainMeters)} HM` : null,
        activity.caloriesBurned ? `${activity.caloriesBurned} kcal` : null,
      ]
        .filter(Boolean)
        .join(" • ") || undefined,
    },
  ];
  let compliance: ComplianceData | undefined;
  if (activity.plannedWorkout) {
    const plannedDescription = activity.plannedWorkout.description;
    const plannedDuration = detectTotalDurationMinutes(plannedDescription ?? "", 60) * 60;
    compliance = buildCompliance(
      { durationSeconds: plannedDuration, tss: estimateEnduranceTss(plannedDuration, 0.7) },
      { durationSeconds, tss }
    );
  }
  return {
    id: `lib-garmin-${activity.id}`,
    title: activity.name,
    discipline,
    status: "completed",
    origin: "garmin",
    date: activity.startTime,
    durationSeconds,
    estimatedTss: tss,
    focusTags:
      discipline === "gym" || discipline === "mobility"
        ? []
        : activity.intensityFactor
          ? activity.intensityFactor < 0.85
            ? ["z2"]
            : activity.intensityFactor <= 0.95
              ? ["sweetspot"]
              : ["threshold-vo2max"]
          : [],
    primaryMuscles: [],
    steps,
    sparkline:
      buildSparklineFromZones(activity.timeInZonesMin).length > 0
        ? buildSparklineFromZones(activity.timeInZonesMin)
        : buildSparklineFromSteps(steps),
    compliance,
    sourceLabel: activity.device === "Garmin" ? "Garmin" : activity.device,
    searchText: normalizeText(activity.name),
  };
}

export function buildLibrary(input: BuildLibraryInput): LibraryWorkout[] {
  const { gymTemplates, enduranceTemplates, weeklyPlan, loggedSessions, garminActivities, todayIndex, fitnessProfile } =
    input;

  const planDayByTemplateId = new Map<string, DayPlan>();
  for (const day of weeklyPlan) {
    if (day.templateId && day.workoutType !== "rest" && !planDayByTemplateId.has(day.templateId)) {
      planDayByTemplateId.set(day.templateId, day);
    }
  }

  const workouts: LibraryWorkout[] = [];

  for (const template of gymTemplates) {
    workouts.push(gymTemplateToWorkout(template, planDayByTemplateId.get(template.id)?.dayIndex));
  }
  for (const template of enduranceTemplates) {
    workouts.push(
      enduranceTemplateToWorkout(template, fitnessProfile, planDayByTemplateId.get(template.id)?.dayIndex)
    );
  }

  for (const day of weeklyPlan) {
    if (day.workoutType === "rest") continue;
    if (
      day.templateId &&
      (gymTemplates.some((t) => t.id === day.templateId) ||
        enduranceTemplates.some((t) => t.id === day.templateId))
    ) {
      continue;
    }
    const workout = planDayToWorkout(day, todayIndex, fitnessProfile);
    if (workout) workouts.push(workout);
  }

  const seenLogged = new Set<string>();
  for (const session of loggedSessions) {
    if (seenLogged.has(session.id)) continue;
    seenLogged.add(session.id);
    if (session.kind === "endurance") {
      workouts.push(enduranceSessionToWorkout(session, enduranceTemplates));
    } else {
      workouts.push(gymSessionToWorkout(session as GymSession, gymTemplates));
    }
  }

  for (const activity of garminActivities) {
    workouts.push(garminActivityToWorkout(activity));
  }

  return workouts;
}

export function fuzzyScore(haystack: string, query: string): number {
  const h = normalizeText(haystack);
  const q = normalizeText(query);
  if (!q) return 1;
  if (!h) return 0;
  const directIndex = h.indexOf(q);
  if (directIndex !== -1) {
    const wordStart = directIndex === 0 || h[directIndex - 1] === " ";
    return Math.max(1, (wordStart ? 120 : 90) - directIndex);
  }
  let cursor = 0;
  let points = 0;
  let gaps = 0;
  for (const char of q) {
    const found = h.indexOf(char, cursor);
    if (found === -1) return 0;
    gaps += found - cursor;
    if (found === 0 || h[found - 1] === " ") points += 3;
    else points += 1;
    cursor = found + 1;
  }
  const coverage = points / (q.length * 3);
  const gapPenalty = Math.min(0.8, gaps / (h.length + q.length));
  return Math.max(1, Math.round(coverage * 60 * (1 - gapPenalty)));
}

export function workoutSearchScore(workout: LibraryWorkout, query: string): number {
  if (!query.trim()) return 1;
  return Math.max(
    fuzzyScore(workout.title, query) * 3,
    fuzzyScore(workout.searchText, query),
    fuzzyScore(workout.description ?? "", query)
  );
}

export function filterLibrary(
  items: LibraryWorkout[],
  filters: LibraryFilters
): LibraryWorkout[] {
  const query = filters.query.trim();
  const filtered = items.filter((item) => {
    if (filters.discipline !== "all" && item.discipline !== filters.discipline) return false;
    if (filters.focus !== "all" && !item.focusTags.includes(filters.focus)) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (query && workoutSearchScore(item, query) <= 0) return false;
    return true;
  });
  if (query) {
    return filtered
      .map((item) => ({ item, score: workoutSearchScore(item, query) }))
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }
  return filtered;
}

export function sortLibrary(items: LibraryWorkout[], mode: LibrarySortMode): LibraryWorkout[] {
  const copy = [...items];
  switch (mode) {
    case "duration":
      return copy.sort((a, b) => b.durationSeconds - a.durationSeconds);
    case "tss":
      return copy.sort((a, b) => b.estimatedTss - a.estimatedTss);
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title, "de-DE"));
    case "newest":
    default: {
      const statusOrder: Record<LibraryWorkout["status"], number> = {
        completed: 0,
        skipped: 1,
        planned: 2,
      };
      return copy.sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
    }
  }
}
