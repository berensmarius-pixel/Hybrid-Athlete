import { describe, expect, it } from "vitest";
import {
  DELOAD_THRESHOLDS,
  applyDeloadWeek,
  detectDeloadNeed,
  generateDeloadEnduranceTemplate,
  generateDeloadGymTemplate,
  longestTrueStreak,
  matchMainLift,
} from "@/lib/coaching/deload-detector";
import type { IntervalPowerLog } from "@/lib/coaching/deload-detector";
import type {
  DailyCheckIn,
  DayPlan,
  EnduranceTemplate,
  GarminDailyHealth,
  GymSession,
  GymTemplate,
  LoggedSession,
} from "@/types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TODAY = new Date("2026-08-26T09:00:00");

function isoDaysAgo(daysAgo: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function gymSession(
  date: string,
  exerciseName: string,
  weight: number,
  reps: number,
  rpe: number
): GymSession {
  return {
    kind: "gym",
    id: `g-${date}-${exerciseName}`,
    date,
    entries: [
      {
        id: `e-${date}`,
        exercise: exerciseName,
        sets: [
          {
            id: `s-${date}`,
            type: "working",
            weight,
            reps,
            rpe,
            isCompleted: true,
          },
        ],
      },
    ],
  };
}

/** 14 tägige Squat-Sessions: erste Phase stark bei RPE 7.5, danach Einbruch auf RPE 9.5 bei weniger Gewicht. */
function divergingStrengthSessions(): LoggedSession[] {
  const sessions: LoggedSession[] = [];
  for (let ago = 13; ago >= 0; ago--) {
    const latePhase = ago <= 6;
    sessions.push(
      gymSession(isoDaysAgo(ago), "Kniebeugen", latePhase ? 80 : 85, 5, latePhase ? 9.5 : 7.5)
    );
  }
  return sessions;
}

function health(date: string, overrides: Partial<GarminDailyHealth> = {}): GarminDailyHealth {
  return {
    date,
    trainingReadiness: 80,
    bodyBattery: 75,
    hrvStatus: "balanced",
    hrvLastNightMs: 65,
    sleepScore: 88,
    sleepDurationHours: 8,
    recoveryTimeHours: 24,
    restingHeartRate: 48,
    activeCaloriesBurned: 600,
    totalCaloriesBurned: 2900,
    ...overrides,
  };
}

/** Gesunde Historie: 6 Tage vor dem Fenster + 14 Tage im Fenster stabil. */
function healthyLogs(): Record<string, GarminDailyHealth> {
  const logs: Record<string, GarminDailyHealth> = {};
  for (let ago = 19; ago >= 0; ago--) {
    logs[isoDaysAgo(ago)] = health(isoDaysAgo(ago));
  }
  return logs;
}

function suppressedLogs(): Record<string, GarminDailyHealth> {
  const logs = healthyLogs();
  // Letzte 7 Tage: HRV −25 % unter Basis, RHR +7 bpm über Basis
  for (let ago = 6; ago >= 0; ago--) {
    logs[isoDaysAgo(ago)] = health(isoDaysAgo(ago), {
      hrvLastNightMs: 49,
      hrvStatus: "unbalanced",
      restingHeartRate: 55,
    });
  }
  return logs;
}

function fatiguedCheckIns(): DailyCheckIn[] {
  return Array.from({ length: 6 }, (_, i) => ({
    date: isoDaysAgo(i),
    soreness: 8,
    energy: 3,
  }));
}

function lowComplianceLogs(): IntervalPowerLog[] {
  // Jeden zweiten Tag ein Threshold-Satz nur mit 78 % der Ziel-Watt
  return [0, 2, 4, 6, 8].map((ago) => ({
    date: isoDaysAgo(ago),
    kind: "threshold" as const,
    targetWatts: 300,
    achievedAvgWatts: 235,
  }));
}

// ─── Basis-Helfer ────────────────────────────────────────────────────────────

describe("longestTrueStreak", () => {
  it("zählt längste True-Serie", () => {
    expect(longestTrueStreak([false, true, true, false, true, true, true])).toBe(3);
  });

  it("liefert 0 ohne True-Werte", () => {
    expect(longestTrueStreak([false, false])).toBe(0);
  });
});

describe("matchMainLift", () => {
  it("ordnet deutsche und englische Namen zu", () => {
    expect(matchMainLift("Kniebeugen")).toBe("squat");
    expect(matchMainLift("Bankdrücken")).toBe("bench");
    expect(matchMainLift("Kreuzheben")).toBe("deadlift");
    expect(matchMainLift("Deadlift")).toBe("deadlift");
  });

  it("ignoriert Nebenübungen", () => {
    expect(matchMainLift("Latzug")).toBeNull();
    expect(matchMainLift("Seitheben")).toBeNull();
  });
});

// ─── Detektion ───────────────────────────────────────────────────────────────

describe("detectDeloadNeed – gesunder Athlet", () => {
  it("meldet fresh ohne Deload-Empfehlung", () => {
    const result = detectDeloadNeed({
      sessions: [],
      garminHealthLogs: healthyLogs(),
      checkIns: Array.from({ length: 6 }, (_, i) => ({
        date: isoDaysAgo(i),
        soreness: 3,
        energy: 8,
      })),
      today: TODAY,
    });

    expect(result.status).toBe("fresh");
    expect(result.deloadRecommended).toBe(false);
    expect(result.persistentCount).toBe(0);
  });
});

describe("detectDeloadNeed – funktionelle Überreichung", () => {
  it("flaggt Deload bei 2 persistenten Performance-Markern", () => {
    const result = detectDeloadNeed({
      sessions: divergingStrengthSessions(),
      garminHealthLogs: healthyLogs(),
      intervalLogs: lowComplianceLogs(),
      today: TODAY,
    });

    expect(result.deloadRecommended).toBe(true);
    expect(result.status).toBe("deload_recommended");
    expect(result.functionalOverreachingLikely).toBe(true);

    const strength = result.markers.find((m) => m.id === "strength_rpe_divergence");
    expect(strength?.persistent).toBe(true);
    expect(strength?.longestStreakDays).toBeGreaterThan(DELOAD_THRESHOLDS.minConsecutiveDays);

    const power = result.markers.find((m) => m.id === "power_compliance");
    expect(power?.persistent).toBe(true);
    expect(power?.detail).toContain("%");

    const hrv = result.markers.find((m) => m.id === "hrv_suppression");
    expect(hrv?.persistent).toBe(false);
  });
});

describe("detectDeloadNeed – nicht-funktionelle Überreichung", () => {
  it("fordert zwingenden Deload bei ≥3 Markern inkl. autonomer Suppression", () => {
    const result = detectDeloadNeed({
      sessions: divergingStrengthSessions(),
      garminHealthLogs: suppressedLogs(),
      checkIns: fatiguedCheckIns(),
      intervalLogs: lowComplianceLogs(),
      today: TODAY,
    });

    expect(result.deloadRecommended).toBe(true);
    expect(result.status).toBe("non_functional_overreaching");
    expect(result.functionalOverreachingLikely).toBe(false);
    expect(result.persistentCount).toBeGreaterThanOrEqual(3);
    expect(result.headline).toContain("Deload");
  });
});

describe("detectDeloadNeed – Frühwarnung", () => {
  it("gibt watch bei genau einem persistenten Marker aus", () => {
    const result = detectDeloadNeed({
      sessions: [],
      garminHealthLogs: healthyLogs(),
      checkIns: fatiguedCheckIns(),
      today: TODAY,
    });

    expect(result.status).toBe("watch");
    expect(result.deloadRecommended).toBe(false);
    expect(result.headline).toContain("Beobachtung");
  });
});

// ─── Auto-Adjustment Generator ───────────────────────────────────────────────

const sourceTemplate: GymTemplate = {
  id: "tpl-lower-body",
  name: "Lower Body",
  type: "gym",
  exercises: [
    {
      id: "ex-sq",
      name: "Kniebeugen",
      sets: [
        { id: "sq-w1", type: "warmup", targetReps: 8 },
        { id: "sq-1", type: "working", targetReps: 6 },
        { id: "sq-2", type: "working", targetReps: 6 },
        { id: "sq-3", type: "working", targetReps: 6 },
        { id: "sq-4", type: "working", targetReps: 6 },
        { id: "sq-5", type: "working", targetReps: 6 },
      ],
    },
    {
      id: "ex-rdl",
      name: "Rumänisches Kreuzheben",
      sets: [
        { id: "rdl-1", type: "working", targetReps: 8 },
        { id: "rdl-2", type: "working", targetReps: 8 },
        { id: "rdl-3", type: "working", targetReps: 8 },
      ],
    },
  ],
};

describe("generateDeloadGymTemplate", () => {
  const deload = generateDeloadGymTemplate(sourceTemplate);

  it("hängt Deload-Suffix an ID und Name", () => {
    expect(deload.id).toBe("tpl-lower-body-deload");
    expect(deload.name).toBe("Lower Body – Deload");
  });

  it("reduziert Working Sets um 40 % (5 → 3)", () => {
    const squats = deload.exercises[0];
    const working = squats.sets.filter((s) => s.type === "working");
    expect(squats.sets.some((s) => s.type === "warmup")).toBe(true);
    expect(working.length).toBe(3);
  });

  it("kappt RPE bei 6–7 und spiegelt RIR", () => {
    const working = deload.exercises[0].sets.filter((s) => s.type === "working");
    expect(working[0].targetRpe).toBe(7);
    expect(working.slice(1).every((s) => s.targetRpe === 6)).toBe(true);
    working.forEach((s) => expect(s.targetRir).toBe(10 - (s.targetRpe ?? 6)));
  });
});

describe("generateDeloadEnduranceTemplate", () => {
  const ftpIntervals: EnduranceTemplate = {
    id: "tpl-end-ftp-4x4",
    name: "Rad: 4x4 Min Schwellen-Intervalle",
    type: "cycling",
    description: "4x 4 Min @ 95–105 % FTP (Zone 4) mit 3 Min aktiver Kurbelpause.",
    estimatedDuration: "60 Min",
  };

  it("verschiebt Rad-Intervalle in Z1/Z2-AktivErholung", () => {
    const deload = generateDeloadEnduranceTemplate(ftpIntervals);
    expect(deload.id).toBe("tpl-end-ftp-4x4-deload");
    expect(deload.description).toContain("Zone 1–2");
    expect(deload.description.toLowerCase()).toContain("deload");
  });

  it("begrenzt Lauf-Einheiten auf lockere Z1/Z2-Dauer", () => {
    const run: EnduranceTemplate = {
      id: "tpl-end-run-tempo",
      name: "Lauf: Tempo-Intervalle",
      type: "running",
      description: "6x 1000m @ Tempo",
      estimatedDuration: "75 Min",
    };
    const deload = generateDeloadEnduranceTemplate(run);
    expect(deload.estimatedDuration).toBe("60 Min");
    expect(deload.description).toContain("< 70 % HFmax");
  });
});

describe("applyDeloadWeek", () => {
  const weeklyPlan: DayPlan[] = [
    {
      dayIndex: 0,
      dayShort: "Mo",
      dayFull: "Montag",
      workoutType: "gym",
      title: "Lower Body",
      description: "Schwere Krafteinheit",
      templateId: "tpl-lower-body",
    },
    {
      dayIndex: 1,
      dayShort: "Di",
      dayFull: "Dienstag",
      workoutType: "cycling",
      title: "Rad: Schwellen-Intervalle",
      description: "4x4 Min @ Schwelle",
    },
    {
      dayIndex: 2,
      dayShort: "Mi",
      dayFull: "Mittwoch",
      workoutType: "rest",
      title: "Ruhetag",
      description: "Erholung",
    },
  ];

  it("markiert alle Tage als Deload und verlinkt Zwillinge", () => {
    const { plan, templatesToSave } = applyDeloadWeek(weeklyPlan, [sourceTemplate]);

    plan.forEach((d) => expect(d.isDeload).toBe(true));
    expect(plan.every((d) => d.title.startsWith("Deload · "))).toBe(true);

    const gymDay = plan[0];
    expect(gymDay.templateId).toBe("tpl-lower-body-deload");
    expect(gymDay.description).toContain("−40 %");

    const cyclingDay = plan[1];
    expect(cyclingDay.workoutType).toBe("cycling");
    expect(cyclingDay.description).toContain("Zone 1–2");

    expect(templatesToSave.length).toBe(1);
    expect(templatesToSave[0].id).toBe("tpl-lower-body-deload");
  });

  it("ist idempotent – erneutes Anwenden erzeugt keine Doppel-Zwillinge", () => {
    const first = applyDeloadWeek(weeklyPlan, [sourceTemplate]);
    const saved = [...first.templatesToSave];

    const second = applyDeloadWeek(first.plan, [sourceTemplate, ...saved]);
    expect(second.templatesToSave.length).toBe(0);
    expect(second.plan[0].templateId).toBe("tpl-lower-body-deload");
  });
});
