import type { DayPlan } from "@/types";

export const DEFAULT_WEEKLY_PLAN: DayPlan[] = [
  {
    dayIndex: 0,
    dayShort: "Mo",
    dayFull: "Montag",
    workoutType: "gym",
    title: "Krafttraining: Upper Push",
    description:
      "Brust, Schultern, Trizeps. Fokus auf progressive Überlastung bei Bankdrücken und Schulterdrücken.",
    templateId: "tpl-upper-push",
  },
  {
    dayIndex: 1,
    dayShort: "Di",
    dayFull: "Dienstag",
    workoutType: "cycling",
    title: "Radfahren: 4x4 Min Schwellen-Intervalle",
    description:
      "4x 4 Min @ 95–105% FTP (Zone 4) mit 3 Min aktiver Kurbelpause. Gesamtdauer ca. 60 Min inkl. Warmup & Cooldown.",
  },
  {
    dayIndex: 2,
    dayShort: "Mi",
    dayFull: "Mittwoch",
    workoutType: "gym",
    title: "Krafttraining: Unterkörper & Core",
    description:
      "Kniebeugen, Kreuzheben, Ausfallschritte. Durch die Platzierung am Mittwoch bleiben 48h zur vollständigen Erholung vor der langen Samstagsausfahrt.",
    templateId: "tpl-lower-body",
  },
  {
    dayIndex: 3,
    dayShort: "Do",
    dayFull: "Donnerstag",
    workoutType: "cycling",
    title: "Radfahren: Zone 2 Active Recovery Spin",
    description:
      "60 Min lockeres Kurbeln im aeroben Grundlagentempo (Zone 2, 60–70% FTP / HF < 130 bpm). Fördert Laktatabbau und schont die Beine.",
  },
  {
    dayIndex: 4,
    dayShort: "Fr",
    dayFull: "Freitag",
    workoutType: "gym",
    title: "Krafttraining: Upper Pull & Rumpf",
    description:
      "Rücken, Bizeps, Hintere Schulter (Klimmzüge, Rudern). Schont die Beine für die lange Ausfahrt am Samstag.",
    templateId: "tpl-upper-pull",
  },
  {
    dayIndex: 5,
    dayShort: "Sa",
    dayFull: "Samstag",
    workoutType: "cycling",
    title: "Radfahren: Lange Ausfahrt (Zone 2)",
    description:
      "2–4 Stunden bei niedriger bis mittlerer Intensität (Zone 2). Grundlagenausdauer, Fettstoffwechsel und Pacing.",
  },
  {
    dayIndex: 6,
    dayShort: "So",
    dayFull: "Sonntag",
    workoutType: "rest",
    title: "Ruhetag & Regeneration",
    description:
      "Vollständige Regeneration: 30 Min sanftes Dehnen, Foam Rolling oder Spaziergang. Kein strukturiertes Training.",
  },
];

export const STORAGE_KEY = "hybrid-athlete-weekly-plan";
