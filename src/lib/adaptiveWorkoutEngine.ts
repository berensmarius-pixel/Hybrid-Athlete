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
  const anaerobicMin = health.loadAnaerobicTargetMin || 0;
  const acuteLoad = health.acuteTrainingLoad || 343;
  const maxChronic = health.maxChronicLoad || 328;
  const hrvStatus = health.hrvStatus || "balanced";

  // ── 1. High Aerobic Deficit Fix (e.g. 185 vs 278 min) ─────────────────────────
  const isAlreadyScheduledOrDone =
    todayPlan?.isCompleted ||
    (todayPlan && (todayPlan.title.toLowerCase().includes("schwell") || todayPlan.title.toLowerCase().includes("intervall") || todayPlan.title.toLowerCase().includes("4x4")));

  if (highAerobic < highAerobicMin && readiness >= 55 && !isAlreadyScheduledOrDone) {
    const deficitPoints = highAerobicMin - highAerobic;
    suggestions.push({
      id: "sugg_high_aerobic_fix",
      type: "deficit_fix",
      title: "Schwellen-Intervalle (High-Aerobic Defizit ausgleichen)",
      badge: "Belastungs-Korrektur",
      badgeColor: "text-amber-400 bg-amber-500/10 border-amber-500/30",
      priority: "high",
      reason: `Dein hoch-aerober Belastungsbereich liegt bei ${highAerobic} Punkten (Ziel: ≥ ${highAerobicMin} Punkte). Es fehlen ca. ${deficitPoints} Lastpunkte.`,
      impactExplanation:
        "Schwellentraining steigert deine anaerobe Schwelle (FTP auf dem Rad / Laktatschwelle beim Laufen) und optimiert den Garmin-Formaufbau.",
      recommendedWorkout: {
        workoutType: "cycling",
        sport: "cycling",
        title: "4x4 Min Schwellen-Intervalle (FTP-Booster)",
        description: "15 Min Warmup, 4x 4 Min @ 95-102% FTP (oder HF Zone 4) mit 3 Min lockerem Kurbeln, 15 Min Cooldown.",
        targetDurationMins: 55,
        estimatedLoadGain: 110,
        targetZone: "Zone 4 (Schwelle / 90-95% HFmax)",
        structuredIntervals: [
          { phase: "Warmup", durationMins: 15, intensity: "Zone 2 (Locker)", targetDetail: "Trittfrequenz 90-95 rpm, stetiger Pulsaufbau" },
          { phase: "Intervall", durationMins: 4, intensity: "Zone 4 (Schwelle)", targetDetail: "100% FTP / RPE 8.5 von 10" },
          { phase: "Pause", durationMins: 3, intensity: "Zone 1 (Aktiv)", targetDetail: "Locker rollen lassen, Atmung senken" },
          { phase: "Intervall", durationMins: 4, intensity: "Zone 4 (Schwelle)", targetDetail: "100% FTP / RPE 8.5 von 10" },
          { phase: "Pause", durationMins: 3, intensity: "Zone 1 (Aktiv)", targetDetail: "Locker rollen lassen" },
          { phase: "Intervall", durationMins: 4, intensity: "Zone 4 (Schwelle)", targetDetail: "100% FTP / RPE 8.5 von 10" },
          { phase: "Pause", durationMins: 3, intensity: "Zone 1 (Aktiv)", targetDetail: "Locker rollen lassen" },
          { phase: "Intervall", durationMins: 4, intensity: "Zone 4 (Schwelle)", targetDetail: "Letzter harter Satz! Saubere Form" },
          { phase: "Cooldown", durationMins: 15, intensity: "Zone 1-2 (Ausfahren)", targetDetail: "Beine ausschütteln, HF < 120 bpm" },
        ],
      },
      dayIndexToModify: currentDayIndex,
    });
  }

  // ── 2. Low Aerobic Foundation Fix ─────────────────────────────────────────────
  if (lowAerobic < lowAerobicMin && readiness >= 50) {
    suggestions.push({
      id: "sugg_low_aerobic_fix",
      type: "zone2_foundation",
      title: "Zone 2 Grundlagenausdauer (Fettstoffwechsel-Boost)",
      badge: "Aerobe Basis",
      badgeColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      priority: "medium",
      reason: `Deine aerobe Basis (${lowAerobic} Punkte) liegt unter dem Optimum (${lowAerobicMin} Punkte).`,
      impactExplanation: "Zone-2-Ausdauer stärkt die Mitochondriendichte, schont das ZNS und beschleunigt deine Erholung zwischen Gym-Sätzen.",
      recommendedWorkout: {
        workoutType: "running",
        sport: "running",
        title: "60 Min Zone 2 Basislauf",
        description: "Gleichmäßiger Dauerlauf im Sprechtempo (Zone 2, 65-75% HFmax).",
        targetDurationMins: 60,
        estimatedLoadGain: 75,
        targetZone: "Zone 2 (65-75% HFmax)",
        structuredIntervals: [
          { phase: "Warmup", durationMins: 10, intensity: "Zone 1", targetDetail: "Langsames Einlaufen + Gelenkmobilisation" },
          { phase: "Intervall", durationMins: 40, intensity: "Zone 2 (Reine Grundlage)", targetDetail: "Nasenatmung möglich, konstanter Rhythmus" },
          { phase: "Cooldown", durationMins: 10, intensity: "Zone 1 (Gehen/Auslaufen)", targetDetail: "Puls beruhigen" },
        ],
      },
      dayIndexToModify: currentDayIndex,
    });
  }

  // ── 3. Readiness / Overload Protection (Low Readiness or ACWR > 1.6) ───────────
  if ((readiness < 45 || hrvStatus === "low" || acuteLoad > maxChronic * 1.25) && todayPlan?.workoutType === "gym") {
    suggestions.push({
      id: "sugg_readiness_shift",
      type: "readiness_shift",
      title: "Erholungs-Verschiebung (ZNS-Regeneration)",
      badge: "Readiness-Schutz",
      badgeColor: "text-rose-400 bg-rose-500/10 border-rose-500/30",
      priority: "high",
      reason: `Deine Garmin Readiness (${readiness}/100) oder HRV (${hrvStatus}) signalisieren erhöhte Ermüdung.`,
      impactExplanation:
        "Verschiebt die schwere Kraftsession auf morgen, um Übertraining und Verletzungen zu vermeiden, und ersetzt heute durch 30 Min Mobilität & leichtes Ausrollen.",
      recommendedWorkout: {
        workoutType: "mobility",
        sport: "mobility",
        title: "Aktive Regeneration & Hüft-/Brustwirbelsäulen-Mobility",
        description: "30 Min dynamisches Dehnen, Foam Rolling und Spaziergang zur Durchblutungsförderung.",
        targetDurationMins: 30,
        estimatedLoadGain: 15,
        targetZone: "Zone 1 (Aktive Erholung)",
        structuredIntervals: [
          { phase: "Warmup", durationMins: 5, intensity: "Zone 1", targetDetail: "Leichtes Gehen" },
          { phase: "Intervall", durationMins: 20, intensity: "Mobilität", targetDetail: "90/90 Hips, Cat-Cow, Couch Stretch" },
          { phase: "Cooldown", durationMins: 5, intensity: "Entspannung", targetDetail: "Tiefenatmung (Box Breathing)" },
        ],
      },
      dayIndexToModify: currentDayIndex,
    });
  }

  return suggestions;
}
