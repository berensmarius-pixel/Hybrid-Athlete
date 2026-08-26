import { describe, expect, it } from "vitest";
import { normalizeBlueprints } from "./contentGenerator";

describe("normalizeBlueprints", () => {
  it("koerziert LLM-Rohausgabe in valide Blueprints", () => {
    const result = normalizeBlueprints([
      {
        title: "Heavy Squats",
        sport: "gym",
        category: "strength_heavy_lower",
        duration_min: 91,
        intensity_tier: "high",
        target_muscle_groups: ["Quads", " GLUTES ", "x"],
        aerobic_impact: "Low",
        priority: 1,
      },
      {
        title: "VO2 Intervalle",
        sport: "cycling",
        category: "intervals_high",
        duration_min: 7,
        intensity_tier: "Medium",
      },
      "kein objekt",
      null,
      { title: 42 },
    ]);

    expect(result).toHaveLength(2);

    const first = result[0];
    expect(first.duration_min).toBe(90);
    expect(first.intensity_tier).toBe("High");
    expect(first.target_muscle_groups).toEqual(["quads", "glutes"]);
    expect(first.priority).toBe(1);
    expect(first.id).toBe("heavy-squats-1");

    const second = result[1];
    expect(second.duration_min).toBe(15);
    expect(second.intensity_tier).toBe("Med");
    expect(second.id).toBe("vo2-intervalle-2");
  });

  it("leitet Kategorie ab, wenn das LLM sie weglässt", () => {
    const result = normalizeBlueprints([
      { title: "Beine", sport: "gym", intensity_tier: "High", target_muscle_groups: ["quads"], duration_min: 80 },
      { title: "Lange Fahrt", sport: "cycling", duration_min: 180, intensity_tier: "Low" },
      { title: "Spin", sport: "cycling", duration_min: 40, intensity_tier: "Low" },
    ]);

    expect(result[0].category).toBe("strength_heavy_lower");
    expect(result[1].category).toBe("endurance_long");
    expect(result[2].category).toBe("recovery");
  });

  it("akzeptiert { sessions: [...] } Wrapper und dedupliziert IDs", () => {
    const raw = {
      sessions: [
        { id: "dup", title: "A" },
        { id: "Dup", title: "B" },
      ],
    };
    const result = normalizeBlueprints(raw);
    expect(result).toHaveLength(1);
  });

  it("liefert leeres Array bei Müll-Input", () => {
    expect(normalizeBlueprints(undefined)).toEqual([]);
    expect(normalizeBlueprints("nope")).toEqual([]);
    expect(normalizeBlueprints({})).toEqual([]);
  });
});
