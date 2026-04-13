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
    title: "Radfahren: Intervalle",
    description:
      "4×8 Min bei 95–105 % FTP mit 4 Min Erholung. Gesamtdauer ca. 60–75 Min inkl. Auf- und Abwärmen.",
  },
  {
    dayIndex: 2,
    dayShort: "Mi",
    dayFull: "Mittwoch",
    workoutType: "gym",
    title: "Krafttraining: Upper Pull",
    description:
      "Rücken, Bizeps, Hintere Schulter. Klimmzüge, Rudern, Face Pulls – Fokus auf Zug- & Griffkraft.",
    templateId: "tpl-upper-pull",
  },
  {
    dayIndex: 3,
    dayShort: "Do",
    dayFull: "Donnerstag",
    workoutType: "running",
    title: "Laufen: Easy 15 Min",
    description:
      "Lockeres Dauertempo (Zone 2). Herzfrequenz unter 75 % HFmax. Aktive Erholung, Beintönus erhalten.",
  },
  {
    dayIndex: 4,
    dayShort: "Fr",
    dayFull: "Freitag",
    workoutType: "gym",
    title: "Krafttraining: Unterkörper + Fußstabilität",
    description:
      "Kniebeugen, Kreuzheben, Ausfallschritte. Fußstabilität: einbeinige Übungen, Zehenheben, Fußwölbungstraining.",
    templateId: "tpl-lower-body",
  },
  {
    dayIndex: 5,
    dayShort: "Sa",
    dayFull: "Samstag",
    workoutType: "cycling",
    title: "Radfahren: Lange Ausfahrt",
    description:
      "2–4 Stunden bei niedriger bis mittlerer Intensität (Zone 2). Grundlagenausdauer und Fettstoffwechsel.",
  },
  {
    dayIndex: 6,
    dayShort: "So",
    dayFull: "Sonntag",
    workoutType: "rest",
    title: "Ruhe / Mobilität",
    description:
      "Aktive Erholung: Dehnen, Yoga, Foam Rolling oder leichter Spaziergang. Kein strukturiertes Training.",
  },
];

export const STORAGE_KEY = "hybrid-athlete-weekly-plan";
