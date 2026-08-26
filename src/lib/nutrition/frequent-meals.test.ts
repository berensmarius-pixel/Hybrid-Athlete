import { describe, expect, it } from "vitest";
import type { DailyNutritionLog, FoodItem, MealEntry, MealType } from "@/types";
import {
  getFrequentMeals,
  getTimeOfDayBucket,
  inferMealTypeFromTime,
  isWithinPostWorkoutWindow,
  parseLoggedAtToMinute,
} from "./frequent-meals";

// Fixe Referenzzeit: Mi, 26.08.2026 – 08:00 lokal
const NOW_MORNING = new Date(2026, 7, 26, 8, 0);
const NOW_EVENING = new Date(2026, 7, 26, 19, 30);
const NOW_POST_WORKOUT = new Date(2026, 7, 26, 17, 0);

let seq = 0;

function makeFood(overrides: Partial<FoodItem> = {}): FoodItem {
  seq += 1;
  return {
    id: overrides.id ?? `food-${seq}`,
    name: overrides.name ?? `Food ${seq}`,
    brand: overrides.brand,
    caloriesPer100g: overrides.caloriesPer100g ?? 100,
    proteinPer100g: overrides.proteinPer100g ?? 0,
    carbsPer100g: overrides.carbsPer100g ?? 0,
    fatPer100g: overrides.fatPer100g ?? 0,
  };
}

function makeEntry(
  food: FoodItem,
  mealType: MealType,
  amount: number,
  loggedAt?: string
): MealEntry {
  seq += 1;
  return {
    id: `entry-${seq}`,
    mealType,
    food,
    amount,
    calories: Math.round((food.caloriesPer100g * amount) / 100),
    protein: 0,
    carbs: 0,
    fat: 0,
    loggedAt,
  };
}

function makeLog(date: string, entries: MealEntry[]): DailyNutritionLog {
  return { date, entries, waterMl: 0 };
}

const WHEY_A = makeFood({ id: "whey-a", name: "Whey Isolate", brand: "ESN", caloriesPer100g: 380 });
const WHEY_B = makeFood({ id: "whey-b", name: "Whey Isolate", brand: "ESN", caloriesPer100g: 380 });
const REIS_HAEHNCHEN = makeFood({ name: "Reis + Hähnchen", caloriesPer100g: 150 });

/** Whey 3× morgens (~07:30), Reis 2× abends (19:00), alter Eintrag außerhalb des Fensters. */
function makeBaseLogs(): DailyNutritionLog[] {
  const alt = makeFood({ name: "Sehr Altes Essen" });
  return [
    makeLog("2026-07-10", [makeEntry(alt, "dinner", 200, "19:00")]),
    makeLog("2026-08-24", [makeEntry(WHEY_A, "breakfast", 30, "07:30")]),
    makeLog("2026-08-25", [
      makeEntry(WHEY_B, "breakfast", 40, "07:28"),
      makeEntry(REIS_HAEHNCHEN, "dinner", 400, "19:00"),
    ]),
    makeLog("2026-08-26", [
      makeEntry(makeFood({ id: "whey-c", name: "Whey Isolate", brand: "ESN", caloriesPer100g: 380 }), "breakfast", 50, "07:32"),
      makeEntry(REIS_HAEHNCHEN, "dinner", 500, "19:02"),
    ]),
  ];
}

describe("parseLoggedAtToMinute", () => {
  it("parst HH:mm-Strings (de-DE)", () => {
    expect(parseLoggedAtToMinute("07:30")).toBe(450);
    expect(parseLoggedAtToMinute("13:45")).toBe(825);
    expect(parseLoggedAtToMinute("23:59")).toBe(1439);
  });

  it("parst ISO-Zeitstempel defensiv", () => {
    // Ohne Zeitzonen-Suffix wird lokal geparst
    expect(parseLoggedAtToMinute("2026-08-20T08:15:00")).toBe(495);
  });

  it("liefert null für fehlende oder ungültige Werte", () => {
    expect(parseLoggedAtToMinute(undefined)).toBeNull();
    expect(parseLoggedAtToMinute(null)).toBeNull();
    expect(parseLoggedAtToMinute("kein datum")).toBeNull();
    expect(parseLoggedAtToMinute("25:99")).toBeNull();
  });
});

describe("getTimeOfDayBucket / inferMealTypeFromTime", () => {
  it("ordnet Tageszeit-Blöcke korrekt zu", () => {
    expect(getTimeOfDayBucket(419)).toBe("morning");
    expect(getTimeOfDayBucket(660)).toBe("midday"); // 11:00 exakt
    expect(getTimeOfDayBucket(900)).toBe("afternoon"); // 15:00 exakt
    expect(getTimeOfDayBucket(1050)).toBe("evening"); // 17:30 exakt
  });

  it("leitet daraus den passenden MealType ab", () => {
    expect(inferMealTypeFromTime(480)).toBe("breakfast");
    expect(inferMealTypeFromTime(720)).toBe("lunch");
    expect(inferMealTypeFromTime(960)).toBe("snack");
    expect(inferMealTypeFromTime(1200)).toBe("dinner");
  });
});

describe("isWithinPostWorkoutWindow", () => {
  it("ist true innerhalb von ~3 h nach Trainingsstart", () => {
    const workouts = { "2026-08-26": ["2026-08-26T16:00:00"] };
    expect(isWithinPostWorkoutWindow(NOW_POST_WORKOUT, workouts)).toBe(true);
  });

  it("ist false ohne heutiges Training oder nach Ablauf des Fensters", () => {
    expect(isWithinPostWorkoutWindow(NOW_POST_WORKOUT, {})).toBe(false);
    expect(
      isWithinPostWorkoutWindow(NOW_POST_WORKOUT, { "2026-08-26": ["2026-08-26T13:00:00"] })
    ).toBe(false);
  });
});

describe("getFrequentMeals – Gruppierung & Aggregation", () => {
  it("gruppiert über IDs hinweg nach Name + Marke und aggregiert Median-Portion", () => {
    const meals = getFrequentMeals(makeBaseLogs(), { now: NOW_MORNING });
    expect(meals).toHaveLength(2);

    const top = meals[0];
    expect(top.key).toBe("whey isolate|esn");
    expect(top.count).toBe(3);
    expect(top.dominantMealType).toBe("breakfast");
    expect(top.defaultAmount).toBe(40); // Median aus 30/40/50, auf 5 g gerundet
    expect(top.macros.calories).toBe(Math.round((380 * 40) / 100));
    expect(top.typicalTimeLabel).toBe("07:30");
    expect(top.lastLoggedDate).toBe("2026-08-26");
  });

  it("filtert Einträge außerhalb des 30-Tage-Fensters heraus", () => {
    const meals = getFrequentMeals(makeBaseLogs(), { now: NOW_MORNING });
    expect(meals.some((m) => m.food.name === "Sehr Altes Essen")).toBe(false);
  });

  it("rundet Median-Portionen auf 5 g und fällt bei ungültigen Mengen auf 100 g zurück", () => {
    const logs = [
      makeLog("2026-08-25", [
        makeEntry(REIS_HAEHNCHEN, "lunch", 28, "12:00"),
        makeEntry(REIS_HAEHNCHEN, "lunch", 33, "12:05"),
      ]),
    ];
    const meals = getFrequentMeals(logs, { now: NOW_MORNING });
    expect(meals[0].defaultAmount).toBe(30);

    const broken = [
      makeLog("2026-08-25", [makeEntry(REIS_HAEHNCHEN, "lunch", 0)]),
    ];
    expect(getFrequentMeals(broken, { now: NOW_MORNING })[0].defaultAmount).toBe(100);
  });
});

describe("getFrequentMeals – Tageszeit-Kontext-Rank", () => {
  it("zeigt morgens die Frühstücksfavoriten zuerst, abends die Abendessen", () => {
    const logs = makeBaseLogs();

    const morning = getFrequentMeals(logs, { now: NOW_MORNING });
    expect(morning[0].key).toBe("whey isolate|esn");

    const evening = getFrequentMeals(logs, { now: NOW_EVENING });
    expect(evening[0].key).toBe("reis + hähnchen|");
  });

  it("boostet Post-Workout-Mahlzeiten im Trainingsfenster über häufigere Mahlzeiten", () => {
    const shake = makeFood({ name: "Recovery Shake", caloriesPer100g: 90 });
    const brot = makeFood({ name: "Brot mit Käse", caloriesPer100g: 280 });
    const workoutsByDate = {
      "2026-08-24": ["2026-08-24T15:30:00"],
      "2026-08-25": ["2026-08-25T15:30:00"],
      "2026-08-26": ["2026-08-26T15:30:00"],
    };
    const logs: DailyNutritionLog[] = [
      // Shake: immer direkt nach dem Training (Affinität 1.0)
      makeLog("2026-08-24", [makeEntry(shake, "snack", 300, "16:30")]),
      makeLog("2026-08-25", [makeEntry(shake, "snack", 300, "16:35")]),
      makeLog("2026-08-26", [makeEntry(shake, "snack", 300, "16:30")]),
      // Brot: häufiger, aber nie trainingsnah
      ...["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26"].map((date) =>
        makeLog(date, [makeEntry(brot, "lunch", 80, "12:00")])
      ),
    ];

    // Ohne aktives Trainingsfenster gewinnt die häufigeren Mahlzeit
    const neutral = getFrequentMeals(logs, { now: NOW_POST_WORKOUT, workoutsByDate: {} });
    expect(neutral[0].food.name).toBe("Brot mit Käse");

    // Jetzt direkt nach dem heutigen Training: Shake springt nach vorn
    const boosted = getFrequentMeals(logs, { now: NOW_POST_WORKOUT, workoutsByDate });
    expect(boosted[0].food.name).toBe("Recovery Shake");
    expect(boosted[0].postWorkoutAffinity).toBe(1);
    expect(boosted.find((m) => m.food.name === "Brot mit Käse")?.postWorkoutAffinity).toBe(0);
  });
});

describe("getFrequentMeals – Grenzen", () => {
  it("respektiert das Limit (Standard 10)", () => {
    const logs = Array.from({ length: 12 }, (_, i) =>
      makeLog("2026-08-25", [
        makeEntry(makeFood({ name: `Meal ${i}` }), "lunch", 100, "12:00"),
      ])
    );
    expect(getFrequentMeals(logs, { now: NOW_MORNING })).toHaveLength(10);
  });

  it("liefert ein leeres Array ohne Logs bzw. ohne Entries im Fenster", () => {
    expect(getFrequentMeals([], { now: NOW_MORNING })).toEqual([]);
    expect(getFrequentMeals([makeLog("2026-01-01", [])], { now: NOW_MORNING })).toEqual([]);
  });
});
