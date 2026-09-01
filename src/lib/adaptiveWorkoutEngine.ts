// ─── Adaptive Workout Engine ──────────────────────────────────────────────────
// Automatically analyzes Garmin Training Load Balance, Readiness, and HRV
// to suggest and generate targeted corrective workouts and adjust the weekly plan.

import { DayPlan, GarminDailyHealth, WorkoutType } from "@/types";

export interface AdaptiveWorkoutSuggestion {
  id: string;
  type: "deficit_fix" | "readiness_shift" | "overload_protection" | "zone2_foundation";
  title: string;
  badge: string;
  badgeColor: string;
  priority: "high" | "medium" | "low";
  reason: string;
  impactExplanation: string;
  recommendedWorkout: {
    workoutType: WorkoutType;
    sport: "cycling" | "running" | "gym" | "mobility";
    title: string;
    description: string;
    targetDurationMins: number;
    estimatedLoadGain: number; // estimated load points
    targetZone: string; // e.g. "Zone 4 (Schwelle 88-92% HFmax)"
    structuredIntervals?: Array<{
      phase: "Warmup" | "Intervall" | "Pause" | "Cooldown";
      durationMins: number;
      intensity: string;
      targetDetail: string;
    }>;
  };
  dayIndexToModify: number; // 0 = Monday ... 6 = Sunday
}

export function analyzeAdaptiveTraining(
  health: GarminDailyHealth,
  weeklyPlan: DayPlan[]
): AdaptiveWorkoutSuggestion[] {
  const suggestions: AdaptiveWorkoutSuggestion[] = [];
  const currentDayIndex = (new Date().getDay() + 6) % 7; // 0 = Mo ... 6 = Su
  const todayPlan = weeklyPlan.find((p) => p.dayIndex === currentDayIndex);

  const readiness = health.trainingReadiness || 64;
  const highAerobic = health.loadHighAerobic || 185;
  const highAerobicMin = health.loadHighAerobicTargetMin || 278;
  const lowAerobic = health.loadLowAerobic || 298;
  const lowAerobicMin = health.loadLowAerobicTargetMin || 203;
  const anaerobic = health.loadAnaerobic || 83;
  const anaerobicMin = health.loadAnaerobicTargetMin || 50;
  const acuteLoad = health.acuteTrainingLoad || 343;
  const maxChronic = health.maxChronicLoad || 328;
  const hrvStatus = health.hrvStatus || "balanced";

  // ── 1. High Aerobic Deficit Fix ─────────────────────────────────────────────
  const isAlreadyHighAerobicScheduled =
    todayPlan?.isCompleted ||
    (todayPlan &&
      (todayPlan.title.toLowerCase().includes("schwell") ||
        todayPlan.title.toLowerCase().includes("intervall") ||
        todayPlan.title.toLowerCase().includes("vo2max") ||
        todayPlan.title.toLowerCase().includes("over-under") ||
        todayPlan.title.toLowerCase().includes("sweet-spot")));

  if (highAerobic < highAerobicMin && readiness >= 55 && !isAlreadyHighAerobicScheduled) {
    const deficitPoints = highAerobicMin - highAerobic;

    // Dynamisch rotieren basierend auf Wochentag für maximale Abwechslung
    const highAerobicOptions = [
      {
        workoutType: "cycling" as WorkoutType,
        sport: "cycling" as const,
        title: "Over-Under Schwellen-Intervalle (3x9 Min)",
        description: "15 Min Warmup, 3x (3x 2 Min @ 105% FTP / 1 Min @ 90% FTP) mit 4 Min Erholungspause, 10 Min Cooldown.",
        targetDurationMins: 60,
        estimatedLoadGain: 115,
        targetZone: "Zone 4–5 (FTP-Über/Unter-Schwellenbereich)",
        structuredIntervals: [
          { phase: "Warmup" as const, durationMins: 15, intensity: "Zone 2", targetDetail: "Puls & Trittfrequenz (90 rpm) aufbauen" },
          { phase: "Intervall" as const, durationMins: 9, intensity: "Zone 4-5 (Over-Under)", targetDetail: "Wechsel: 2 Min 105% FTP / 1 Min 90% FTP" },
          { phase: "Pause" as const, durationMins: 4, intensity: "Zone 1 (Aktiv)", targetDetail: "Locker kurbeln" },
          { phase: "Intervall" as const, durationMins: 9, intensity: "Zone 4-5 (Over-Under)", targetDetail: "Zweiter Block: Fokus auf Laktatverstoffwechselung" },
          { phase: "Pause" as const, durationMins: 4, intensity: "Zone 1 (Aktiv)", targetDetail: "Locker kurbeln" },
          { phase: "Intervall" as const, durationMins: 9, intensity: "Zone 4-5 (Over-Under)", targetDetail: "Finaler Satz: Hohe Trittfrequenz halten" },
          { phase: "Cooldown" as const, durationMins: 10, intensity: "Zone 1-2", targetDetail: "Ausfahren, HF < 120 bpm" },
        ],
      },
      {
        workoutType: "running" as WorkoutType,
        sport: "running" as const,
        title: "Laktatschwellen-Lauf (3x 8 Min @ LT2)",
        description: "12 Min Einlaufen & ABC, 3x 8 Min im Schwellentempo (ca. 88–92% HFmax / RPE 8) mit je 2:30 Min Trabpause, 10 Min Auslaufen.",
        targetDurationMins: 50,
        estimatedLoadGain: 95,
        targetZone: "Zone 4 (Laktatschwelle LT2)",
        structuredIntervals: [
          { phase: "Warmup" as const, durationMins: 12, intensity: "Zone 1-2", targetDetail: "Locker einlaufen + 3 Steigerungen" },
          { phase: "Intervall" as const, durationMins: 8, intensity: "Zone 4 (LT2)", targetDetail: "Konstantes Schwellentempo / Sprechen nur wortweise" },
          { phase: "Pause" as const, durationMins: 2.5, intensity: "Zone 1 (Trab)", targetDetail: "Locker traben, Puls senken" },
          { phase: "Intervall" as const, durationMins: 8, intensity: "Zone 4 (LT2)", targetDetail: "Gleiche Pace halten, saubere Armführung" },
          { phase: "Pause" as const, durationMins: 2.5, intensity: "Zone 1 (Trab)", targetDetail: "Locker traben" },
          { phase: "Intervall" as const, durationMins: 8, intensity: "Zone 4 (LT2)", targetDetail: "Letztes Schwellenintervall! Durchziehen" },
          { phase: "Cooldown" as const, durationMins: 10, intensity: "Zone 1", targetDetail: "Auslaufen & Dehnen" },
        ],
      },
      {
        workoutType: "running" as WorkoutType,
        sport: "running" as const,
        title: "VO2max Intervall-Pyramide (5x 800m)",
        description: "15 Min Warmup, 5x 800m @ 95% HFmax (3k-5k Wettkampftempo) mit je 2 Min Geh-/Trabpause, 10 Min Cooldown.",
        targetDurationMins: 45,
        estimatedLoadGain: 105,
        targetZone: "Zone 5 (VO2max / 92-97% HFmax)",
        structuredIntervals: [
          { phase: "Warmup" as const, durationMins: 15, intensity: "Zone 2", targetDetail: "Einlaufen, Hopserlauf, 2x 60m Steigerung" },
          { phase: "Intervall" as const, durationMins: 3.5, intensity: "Zone 5 (VO2max)", targetDetail: "800m @ 5k-Race-Pace" },
          { phase: "Pause" as const, durationMins: 2, intensity: "Zone 1 (Gehen/Traben)", targetDetail: "Atmung normalisieren" },
          { phase: "Intervall" as const, durationMins: 3.5, intensity: "Zone 5 (VO2max)", targetDetail: "800m @ 5k-Race-Pace" },
          { phase: "Pause" as const, durationMins: 2, intensity: "Zone 1", targetDetail: "Locker bleiben" },
          { phase: "Intervall" as const, durationMins: 3.5, intensity: "Zone 5 (VO2max)", targetDetail: "800m @ 5k-Race-Pace" },
          { phase: "Pause" as const, durationMins: 2, intensity: "Zone 1", targetDetail: "Locker bleiben" },
          { phase: "Intervall" as const, durationMins: 3.5, intensity: "Zone 5 (VO2max)", targetDetail: "800m @ 5k-Race-Pace" },
          { phase: "Pause" as const, durationMins: 2, intensity: "Zone 1", targetDetail: "Locker bleiben" },
          { phase: "Intervall" as const, durationMins: 3.5, intensity: "Zone 5 (VO2max)", targetDetail: "800m finaler Durchgang" },
          { phase: "Cooldown" as const, durationMins: 10, intensity: "Zone 1", targetDetail: "Auslaufen" },
        ],
      },
      {
        workoutType: "cycling" as WorkoutType,
        sport: "cycling" as const,
        title: "Sweet Spot Power-Session (2x 20 Min)",
        description: "15 Min Warmup, 2x 20 Min @ 88–93% FTP (hohe aerobe Effizienz) mit 6 Min Kurbelpause, 10 Min Cooldown.",
        targetDurationMins: 70,
        estimatedLoadGain: 120,
        targetZone: "Zone 3–4 (Sweet Spot / 88-93% FTP)",
        structuredIntervals: [
          { phase: "Warmup" as const, durationMins: 15, intensity: "Zone 2", targetDetail: "Gleichmäßiger Tritt, Kadenz 90" },
          { phase: "Intervall" as const, durationMins: 20, intensity: "Sweet Spot (88-93% FTP)", targetDetail: "Hohe aerobe Dauerleistung ohne Laktatflutung" },
          { phase: "Pause" as const, durationMins: 6, intensity: "Zone 1", targetDetail: "Locker rollen lassen, trinken" },
          { phase: "Intervall" as const, durationMins: 20, intensity: "Sweet Spot (88-93% FTP)", targetDetail: "Zweiter 20-Minuten-Block: Rhythmus halten" },
          { phase: "Cooldown" as const, durationMins: 10, intensity: "Zone 1", targetDetail: "Ausfahren Beine lockern" },
        ],
      },
    ];

    const selectedOption = highAerobicOptions[currentDayIndex % highAerobicOptions.length];

    suggestions.push({
      id: `sugg_high_aerobic_${selectedOption.sport}_${currentDayIndex}`,
      type: "deficit_fix",
      title: `${selectedOption.title} (High-Aerobic Defizit ausgleichen)`,
      badge: "Belastungs-Korrektur",
      badgeColor: "text-amber-400 bg-amber-500/10 border-amber-500/30",
      priority: "high",
      reason: `Dein hoch-aerober Belastungsbereich liegt bei ${highAerobic} Punkten (Ziel: ≥ ${highAerobicMin} Punkte). Es fehlen ca. ${deficitPoints} Lastpunkte.`,
      impactExplanation:
        "Schwellentraining steigert deine anaerobe Schwelle (FTP / Laktatschwelle) und optimiert den Garmin-Formaufbau.",
      recommendedWorkout: selectedOption,
      dayIndexToModify: currentDayIndex,
    });
  }

  // ── 2. Low Aerobic Foundation Fix ─────────────────────────────────────────────
  if (lowAerobic < lowAerobicMin && readiness >= 50) {
    const lowAerobicOptions = [
      {
        workoutType: "running" as WorkoutType,
        sport: "running" as const,
        title: "60 Min Zone 2 Basislauf (Fettstoffwechsel)",
        description: "Gleichmäßiger Dauerlauf im Sprechtempo (Zone 2, 65–75% HFmax).",
        targetDurationMins: 60,
        estimatedLoadGain: 75,
        targetZone: "Zone 2 (65–75% HFmax)",
        structuredIntervals: [
          { phase: "Warmup" as const, durationMins: 10, intensity: "Zone 1", targetDetail: "Langsames Einlaufen + Gelenkmobilisation" },
          { phase: "Intervall" as const, durationMins: 40, intensity: "Zone 2 (Reine Grundlage)", targetDetail: "Nasenatmung möglich, konstanter Rhythmus" },
          { phase: "Cooldown" as const, durationMins: 10, intensity: "Zone 1 (Gehen/Auslaufen)", targetDetail: "Puls beruhigen" },
        ],
      },
      {
        workoutType: "cycling" as WorkoutType,
        sport: "cycling" as const,
        title: "90 Min Zone 2 Base Ride & Kadenz-Drills",
        description: "Lockere Grundlagenausfahrt bei 60–70% FTP mit kurzen Trittfrequenz-Pyramiden zur Nervensystem-Aktivierung.",
        targetDurationMins: 90,
        estimatedLoadGain: 85,
        targetZone: "Zone 2 (60–70% FTP / HF < 130 bpm)",
        structuredIntervals: [
          { phase: "Warmup" as const, durationMins: 15, intensity: "Zone 1-2", targetDetail: "Locker einrollen" },
          { phase: "Intervall" as const, durationMins: 60, intensity: "Zone 2", targetDetail: "Konstante Wattleistung, aerobe Verbrennung" },
          { phase: "Cooldown" as const, durationMins: 15, intensity: "Zone 1", targetDetail: "Ausfahren" },
        ],
      },
      {
        workoutType: "running" as WorkoutType,
        sport: "running" as const,
        title: "45 Min Progressiver Grundlagendauerlauf",
        description: "30 Min lockere Zone 2, gesteigert in die letzten 15 Min obere Zone 2 / leichte Zone 3.",
        targetDurationMins: 45,
        estimatedLoadGain: 60,
        targetZone: "Zone 2 (Progressiv)",
        structuredIntervals: [
          { phase: "Warmup" as const, durationMins: 10, intensity: "Zone 1", targetDetail: "Einlaufen" },
          { phase: "Intervall" as const, durationMins: 25, intensity: "Zone 2", targetDetail: "Grundlage" },
          { phase: "Intervall" as const, durationMins: 10, intensity: "Obere Zone 2", targetDetail: "Leichte Tempo-Progression" },
        ],
      },
    ];

    const selectedLowOption = lowAerobicOptions[currentDayIndex % lowAerobicOptions.length];

    suggestions.push({
      id: `sugg_low_aerobic_${selectedLowOption.sport}_${currentDayIndex}`,
      type: "zone2_foundation",
      title: `${selectedLowOption.title}`,
      badge: "Aerobe Basis",
      badgeColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      priority: "medium",
      reason: `Deine aerobe Basis (${lowAerobic} Punkte) liegt unter dem Optimum (${lowAerobicMin} Punkte).`,
      impactExplanation: "Zone-2-Ausdauer stärkt die Mitochondriendichte, schont das ZNS und beschleunigt deine Erholung zwischen Gym-Sätzen.",
      recommendedWorkout: selectedLowOption,
      dayIndexToModify: currentDayIndex,
    });
  }

  // ── 3. Readiness / Overload Protection (Low Readiness or ACWR > 1.6) ───────────
  if ((readiness < 45 || hrvStatus === "low" || acuteLoad > maxChronic * 1.25) && todayPlan?.workoutType === "gym") {
    const recoveryOptions = [
      {
        workoutType: "mobility" as WorkoutType,
        sport: "mobility" as const,
        title: "Aktive Regeneration & Hüft-/Brustwirbelsäulen-Mobility",
        description: "30 Min dynamisches Dehnen, Foam Rolling und Spaziergang zur Durchblutungsförderung.",
        targetDurationMins: 30,
        estimatedLoadGain: 15,
        targetZone: "Zone 1 (Aktive Erholung)",
        structuredIntervals: [
          { phase: "Warmup" as const, durationMins: 5, intensity: "Zone 1", targetDetail: "Leichtes Gehen" },
          { phase: "Intervall" as const, durationMins: 20, intensity: "Mobilität", targetDetail: "90/90 Hips, Cat-Cow, Couch Stretch" },
          { phase: "Cooldown" as const, durationMins: 5, intensity: "Entspannung", targetDetail: "Tiefenatmung (Box Breathing)" },
        ],
      },
      {
        workoutType: "mobility" as WorkoutType,
        sport: "mobility" as const,
        title: "Ganzkörper Dehn- & Faszien-Flow (Core & Beinbeuger)",
        description: "25 Min myofasziales Ausrollen (Quadrizeps, Waden, Lat) und statisch-dynamisches Dehnen für Knie- und Rückengesundheit.",
        targetDurationMins: 25,
        estimatedLoadGain: 10,
        targetZone: "Zone 1 (Regeneration)",
        structuredIntervals: [
          { phase: "Warmup" as const, durationMins: 5, intensity: "Faszienrolle", targetDetail: "Waden, Glutes & Rücken sanft ausrollen" },
          { phase: "Intervall" as const, durationMins: 15, intensity: "Mobilität & Dehnen", targetDetail: "Hamstring Stretch, Pigeon Pose, World's Greatest Stretch" },
          { phase: "Cooldown" as const, durationMins: 5, intensity: "Meditation & Atem", targetDetail: "Vagusnerv-Aktivierung" },
        ],
      },
    ];

    const selectedRecovery = recoveryOptions[currentDayIndex % recoveryOptions.length];

    suggestions.push({
      id: `sugg_readiness_shift_${currentDayIndex}`,
      type: "readiness_shift",
      title: "Erholungs-Verschiebung (ZNS-Regeneration)",
      badge: "Readiness-Schutz",
      badgeColor: "text-rose-400 bg-rose-500/10 border-rose-500/30",
      priority: "high",
      reason: `Deine Garmin Readiness (${readiness}/100) oder HRV (${hrvStatus}) signalisieren erhöhte Ermüdung.`,
      impactExplanation:
        "Verschiebt die schwere Kraftsession auf morgen, um Übertraining und Verletzungen zu vermeiden, und ersetzt heute durch Mobilität & leichtes Ausrollen.",
      recommendedWorkout: selectedRecovery,
      dayIndexToModify: currentDayIndex,
    });
  }

  return suggestions;
}
