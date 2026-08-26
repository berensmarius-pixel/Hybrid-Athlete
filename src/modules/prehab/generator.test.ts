import { describe, expect, it } from "vitest";
import {
  detectPrehabContext,
  deriveWorkoutDate,
  extractSorenessFlags,
  generatePrehabProtocol,
} from "@/modules/prehab/generator";
import { DEFAULT_GYM_TEMPLATES } from "@/data/gymTemplates";
import { DEFAULT_WEEKLY_PLAN } from "@/data/weeklyPlan";
import type { GymSession } from "@/types";

function makeSession(date: string, notes?: string): GymSession {
  return {
    kind: "gym",
    id: `s-${date}-${Math.random().toString(36).slice(2, 6)}`,
    date,
    entries: [],
    notes,
  };
}

const UPPER_PUSH_TEMPLATE = DEFAULT_GYM_TEMPLATES.find((t) => t.id === "tpl-upper-push")!;
const LOWER_TEMPLATE = DEFAULT_GYM_TEMPLATES.find((t) => t.id === "tpl-lower-body")!;

describe("deriveWorkoutDate", () => {
  it("bildet den Wochentag relativ zu heute ab", () => {
    const now = new Date();
    const jsDay = now.getDay();
    const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
    const expected = new Date(now);
    expected.setDate(now.getDate() + (3 - todayIdx));
    const iso = deriveWorkoutDate(3);
    expect(iso).toBe(
      `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(expected.getDate()).padStart(2, "0")}`
    );
  });
});

describe("detectPrehabContext", () => {
  it("mappt Upper Push auf rotator-cuff-lastigen Kontext", () => {
    const day = DEFAULT_WEEKLY_PLAN[0];
    expect(detectPrehabContext(day, UPPER_PUSH_TEMPLATE)).toBe("upper-push");
  });

  it("mappt Unterkörper-Tag auf lower-body", () => {
    const day = DEFAULT_WEEKLY_PLAN[2];
    expect(detectPrehabContext(day, LOWER_TEMPLATE)).toBe("lower-body");
  });

  it("mappt Rad-Intervalle auf cycling-intervals", () => {
    expect(detectPrehabContext(DEFAULT_WEEKLY_PLAN[1])).toBe("cycling-intervals");
  });

  it("mappt Zone-2-Spin auf cycling-endurance", () => {
    expect(detectPrehabContext(DEFAULT_WEEKLY_PLAN[3])).toBe("cycling-endurance");
  });

  it("mappt Ruhetag auf general", () => {
    expect(detectPrehabContext(DEFAULT_WEEKLY_PLAN[6])).toBe("general");
  });

  it("erkennt running", () => {
    expect(
      detectPrehabContext({
        workoutType: "running",
        title: "Lauf: Zone 2",
        description: "",
      })
    ).toBe("running");
  });
});

describe("extractSorenessFlags", () => {
  const workoutDate = "2026-08-26";

  it("findet Soreness im Log vom Vortag", () => {
    const flags = extractSorenessFlags(
      [makeSession("2026-08-25", "tight hamstrings nach RDL")],
      workoutDate
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].region).toBe("hamstring");
  });

  it("findet shoulder twinge in englischer Notiz", () => {
    const flags = extractSorenessFlags(
      [makeSession("2026-08-25", "Bankdrücken ok, aber shoulder twinge bei Dips")],
      workoutDate
    );
    expect(flags.map((f) => f.region)).toContain("shoulder");
  });

  it("ignoriert Sessions älter als 3 Tage und vom selben Tag", () => {
    const flags = extractSorenessFlags(
      [makeSession("2026-08-20", "hamstrings tight"), makeSession("2026-08-26", "schulter zwickt")],
      workoutDate
    );
    expect(flags).toHaveLength(0);
  });

  it("nimmt nur die jüngste Session-Gruppe vor dem Trainingstag", () => {
    const flags = extractSorenessFlags(
      [
        makeSession("2026-08-25", "wade spannt"),
        makeSession("2026-08-24", "handgelenk drückt"),
      ],
      workoutDate
    );
    expect(flags.map((f) => f.region)).toEqual(["calf"]);
  });

  it("löst nicht bei Kniebeugen-Erwähnung aus", () => {
    const flags = extractSorenessFlags(
      [makeSession("2026-08-25", "Kniebeugen liefen stark")],
      workoutDate
    );
    expect(flags).toHaveLength(0);
  });

  it("dedupliziert Regionen über mehrere Notizen", () => {
    const flags = extractSorenessFlags(
      [
        makeSession("2026-08-25", "hüftbeuger eng"),
        makeSession("2026-08-25T18:00:00.000Z", "hüftbeuger zwickt beim Sprint"),
      ],
      workoutDate
    );
    expect(flags.filter((f) => f.region === "hipFlexor")).toHaveLength(1);
    expect(new Set(flags.map((f) => f.region)).size).toBe(flags.length);
  });
});

describe("generatePrehabProtocol", () => {
  it("erstellt exakt das 5-Minuten-Budget mit gültigen Drills", () => {
    const protocol = generatePrehabProtocol({
      day: DEFAULT_WEEKLY_PLAN[0],
      template: UPPER_PUSH_TEMPLATE,
      sessions: [],
      workoutDateOverride: "2026-08-26",
    });
    expect(protocol.totalSeconds).toBe(300);
    for (const step of protocol.steps) {
      expect(step.durationSeconds).toBeGreaterThanOrEqual(25);
      expect(step.durationSeconds).toBeLessThanOrEqual(90);
      expect(step.durationSeconds % 5).toBe(0);
      expect(step.isSorenessBoost ?? false).toBe(false);
    }
  });

  it("enthält Rotator-Cuff-Aktivierung für Upper Push", () => {
    const protocol = generatePrehabProtocol({
      day: DEFAULT_WEEKLY_PLAN[0],
      template: UPPER_PUSH_TEMPLATE,
      sessions: [],
      workoutDateOverride: "2026-08-26",
    });
    const names = protocol.steps.map((s) => s.name.toLowerCase()).join(" | ");
    expect(names).toContain("pull-apart");
    expect(names).toContain("face pull");
    expect(protocol.context).toBe("upper-push");
  });

  it("enthält Hüfte/Knöchel/Glutes für Squat-Day", () => {
    const protocol = generatePrehabProtocol({
      day: DEFAULT_WEEKLY_PLAN[2],
      template: LOWER_TEMPLATE,
      sessions: [],
      workoutDateOverride: "2026-08-26",
    });
    const ids = protocol.steps.map((s) => s.id);
    expect(ids).toContain("hip-9090-switch");
    expect(ids).toContain("ankle-dorsiflexion-rock");
    expect(ids).toContain("glute-bridge");
    expect(ids).toContain("adductor-frog-rock");
  });

  it("enthält Hüftbeuger & Hamstrings für Rad-Intervalle", () => {
    const protocol = generatePrehabProtocol({
      day: DEFAULT_WEEKLY_PLAN[1],
      sessions: [],
      workoutDateOverride: "2026-08-26",
    });
    const ids = protocol.steps.map((s) => s.id);
    expect(ids).toContain("hip-flexor-opener");
    expect(ids).toContain("hamstring-dynamic-swing");
    expect(ids).toContain("activation-spin");
  });

  it("injiziert Zusatz-Drills bei Hamstring-Soreness vom Vortag", () => {
    const base = generatePrehabProtocol({
      day: DEFAULT_WEEKLY_PLAN[1],
      sessions: [],
      workoutDateOverride: "2026-08-26",
    });
    const boosted = generatePrehabProtocol({
      day: DEFAULT_WEEKLY_PLAN[1],
      sessions: [makeSession("2026-08-25", "tight hamstrings nach RDL")],
      workoutDateOverride: "2026-08-26",
    });

    expect(boosted.sorenessFlags[0]?.region).toBe("hamstring");
    const boostSteps = boosted.steps.filter((s) => s.isSorenessBoost);
    expect(boostSteps.length).toBeGreaterThan(0);
    expect(boostSteps.some((s) => s.id === "hamstring-floss")).toBe(true);
    expect(boosted.totalSeconds).toBe(300);
    expect(boosted.steps.length).toBe(base.steps.length + 1);
    expect(boostSteps[0].reason).toContain("Feedback vom Vortag");
  });

  it("injiziert Rotator-Cuff-Drill bei Schulter-Twinge am Upper-Day", () => {
    const boosted = generatePrehabProtocol({
      day: DEFAULT_WEEKLY_PLAN[0],
      template: UPPER_PUSH_TEMPLATE,
      sessions: [makeSession("2026-08-25", "shoulder twinge bei Dips")],
      workoutDateOverride: "2026-08-26",
    });
    const boostIds = boosted.steps.filter((s) => s.isSorenessBoost).map((s) => s.id);
    expect(boostIds).toContain("band-external-rotation");
  });

  it("kein Boost ohne Feedback-Notizen", () => {
    const protocol = generatePrehabProtocol({
      day: DEFAULT_WEEKLY_PLAN[4],
      sessions: [makeSession("2026-08-25", "Alles top gelaufen")],
      workoutDateOverride: "2026-08-26",
    });
    expect(protocol.sorenessFlags).toHaveLength(0);
    expect(protocol.steps.every((s) => !s.isSorenessBoost)).toBe(true);
  });

  it("respektiert ein abweichendes Zielbudget", () => {
    const protocol = generatePrehabProtocol({
      day: DEFAULT_WEEKLY_PLAN[5],
      targetSeconds: 480,
      workoutDateOverride: "2026-08-26",
    });
    expect(protocol.targetSeconds).toBe(480);
    for (const step of protocol.steps) {
      expect(step.durationSeconds).toBeLessThanOrEqual(120);
    }
  });
});
