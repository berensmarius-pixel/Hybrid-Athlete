// ─── ACWR (Acute-to-Chronic Workload Ratio) & Injury Risk Sentinel ───────────

import { GarminDailyHealth, GarminActivity } from "@/types";

export interface AcwrSentinelReport {
  acwrRatio: number; // e.g. 1.25
  acuteLoad: number; // 7-day rolling load
  chronicLoad: number; // 28-day rolling average load
  riskLevel: "optimal" | "elevated" | "high_danger" | "underloaded";
  riskBadge: string;
  riskColor: string;
  riskExplanation: string;
  recommendations: string[];
  fatigueScore: number; // 0-100
}

export function computeAcwrSentinel(
  garminHealth: GarminDailyHealth | undefined,
  garminActivities: GarminActivity[] = []
): AcwrSentinelReport {
  // Acute load from Garmin or default
  const acute = garminHealth?.acuteTrainingLoad || 343;
  // Chronic baseline
  const chronic = garminHealth?.chronicLoad || 228;
  const ratio = Math.round((acute / chronic) * 100) / 100;

  let riskLevel: AcwrSentinelReport["riskLevel"] = "optimal";
  let riskBadge = "Optimaler Bereich (Sweet Spot)";
  let riskColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  let riskExplanation = "Deine akute Belastung (letzte 7 Tage) steht in einem gesunden Verhältnis zu deiner 28-Tage-Grundlage. Das Verletzungsrisiko ist minimal.";
  let recommendations: string[] = [
    "Geplantes Trainingsvolumen kann wie vorgesehen absolviert werden.",
    "Achte auf gleichmäßige Proteinzufuhr (2g/kg) und min. 7.5h Schlaf.",
  ];

  if (ratio > 1.5) {
    riskLevel = "high_danger";
    riskBadge = "⚠️ Akute Überlastungs-Gefahr (ACWR > 1.5)";
    riskColor = "text-rose-400 bg-rose-500/10 border-rose-500/30";
    riskExplanation = `Dein Belastungsverhältnis liegt bei ${ratio}. Laut Tim Gabbett Modellen steigt das Risiko für Sehnen- & Muskelverletzungen bei Werten über 1.5 um das 2- bis 4-Fache!`;
    recommendations = [
      "Reduziere das Ausdauer-Volumen heute um 20–30% oder mache aktiven Rest.",
      "Vermeide heute schwere Maximalversuche (1RM) und All-Out Sprints.",
      "Nutze Faszienrolle, Dehnen und lege den Fokus auf Schlaf & Hydratation.",
    ];
  } else if (ratio > 1.3) {
    riskLevel = "elevated";
    riskBadge = "Erhöhte Belastung (Vorsicht geboten)";
    riskColor = "text-amber-400 bg-amber-500/10 border-amber-500/30";
    riskExplanation = `Dein Verhältnis liegt bei ${ratio}. Du baust zügig Form auf, näherst dich aber der oberen Belastungsgrenze.`;
    recommendations = [
      "Halte hochintensive Einheiten (Zone 4/5) kurz und konzentriert.",
      "Plane in 2–3 Tagen einen Deload- oder Ruhetag ein.",
    ];
  } else if (ratio < 0.8) {
    riskLevel = "underloaded";
    riskBadge = "Unterfordert / Formverlust";
    riskColor = "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";
    riskExplanation = `Dein Verhältnis liegt bei ${ratio}. Das Trainingsvolumen ist aktuell geringer als deine chronische Fitness.`;
    recommendations = [
      "Erhöhe die Trainingsfrequenz oder Dauer schrittweise um 10% pro Woche.",
    ];
  }

  // Fatigue score calculation based on readiness, body battery, sleep
  const readiness = garminHealth?.trainingReadiness || 64;
  const battery = garminHealth?.bodyBattery || 69;
  const fatigueScore = Math.max(0, Math.min(100, Math.round(100 - (readiness * 0.6 + battery * 0.4))));

  return {
    acwrRatio: ratio,
    acuteLoad: acute,
    chronicLoad: chronic,
    riskLevel,
    riskBadge,
    riskColor,
    riskExplanation,
    recommendations,
    fatigueScore,
  };
}
