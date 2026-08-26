import { getWeekStats } from "@/lib/stravaUtils";
import { formatDuration } from "@/lib/utils";
import type {
  BodyCompositionEntry,
  DailyNutritionGoal,
  DailyNutritionLog,
  EnduranceTemplate,
  GarminActivity,
  GymTemplate,
  LoggedSession,
  PersonalRecord,
  StravaActivity,
} from "@/types";

/**
 * System-Prompt- und Kontext-Bau für den AI-Coach.
 * Extrahiert aus CoachView.tsx – rein synchron & ohne React-Abhängigkeiten.
 */

function formatPace(ms: number): string {
  const secsPerKm = 1000 / ms;
  const min = Math.floor(secsPerKm / 60);
  const sec = Math.round(secsPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(iso));
}

export function buildStravaContext(
  activities: StravaActivity[],
  connection: {
    isConnected: boolean;
    athlete: { firstname: string; lastname: string } | null;
    lastSynced: string | null;
  }
): string {
  if (!connection.isConnected || activities.length === 0) {
    return "Strava: Nicht verbunden oder noch keine Aktivitäten synchronisiert.";
  }

  const athlete = connection.athlete;
  const lastSynced = connection.lastSynced
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }).format(new Date(connection.lastSynced))
    : "–";

  const weekStats = getWeekStats(activities);

  const activityLines = activities.slice(0, 15).map((a, i) => {
    const isRun = a.sport_type === "Run" || a.type === "Run";
    const type = isRun ? "Laufen" : "Radfahren";
    const distKm = (a.distance / 1000).toFixed(2);
    const duration = formatDuration(a.moving_time);
    const speed = isRun
      ? `Pace: ${formatPace(a.average_speed)}`
      : `Tempo: ${(a.average_speed * 3.6).toFixed(1)} km/h`;
    const hr = a.average_heartrate
      ? `Ø HF: ${Math.round(a.average_heartrate)} bpm`
      : "HF: –";
    const elevation = `Höhenmeter: ${Math.round(a.total_elevation_gain)}m`;

    return `${i + 1}. ${formatDate(a.start_date_local)} | ${type} | "${a.name}"
   Distanz: ${distKm} km | Dauer: ${duration} | ${speed} | ${hr} | ${elevation}`;
  }).join("\n\n");

  const unitSuffix = (count: number) => (count !== 1 ? "en" : "");

  const weekSection = `=== DIESE WOCHE (Strava) ===
Laufen:    ${weekStats.runKm > 0 ? `${weekStats.runKm} km (${weekStats.runCount} Einheit${unitSuffix(weekStats.runCount)})` : "–"}
Radfahren: ${weekStats.rideKm > 0 ? `${weekStats.rideKm} km (${weekStats.rideCount} Einheit${unitSuffix(weekStats.rideCount)})` : "–"}
Gesamt:    ${weekStats.totalHours > 0 ? `${weekStats.totalHours}h Bewegungszeit` : "–"}`;

  return `=== ATHLETENDATEN (Strava) ===
Name: ${athlete ? `${athlete.firstname} ${athlete.lastname}` : "–"}
Zuletzt synchronisiert: ${lastSynced}
Anzahl importierter Aktivitäten: ${activities.length}

${weekSection}

=== LETZTE AKTIVITÄTEN (chronologisch, neueste zuerst) ===
${activityLines}`;
}

export function buildPrsContext(personalRecords: PersonalRecord[]): string {
  return `=== PERSÖNLICHE BESTLEISTUNGEN (App PRs) ===\n${
    personalRecords.length > 0
      ? personalRecords
          .map(
            (p) =>
              `- ${p.exerciseName}: ${p.bestWeight}kg x ${p.bestReps} (Est. 1RM: ${p.estimated1RM}kg)`
          )
          .join("\n")
      : "Noch keine PRs aufgezeichnet."
  }`;
}

export function buildHistoryContext(loggedSessions: LoggedSession[]): string {
  return `=== LETZTE LOGS (App Historie) ===\n${loggedSessions
    .slice(0, 10)
    .map((s) => {
      const date = formatDate(s.date);
      if (s.kind === "endurance") {
        return `- ${date} | ${s.activityType === "running" ? "Laufen" : "Rad"} | ${s.duration} | RPE ${s.rpe}`;
      }
      return `- ${date} | Gym (${s.kind}) | ${s.entries.length} Übungen | RPE ${s.rpe ?? "-"}`;
    })
    .join("\n")}`;
}

export function buildNutritionContext(
  nutritionLogs: DailyNutritionLog[],
  nutritionGoals: DailyNutritionGoal,
  today: string
): string {
  const todayNutri = nutritionLogs.find((l) => l.date === today);
  const nutriEntries = todayNutri?.entries || [];
  const totalKcal = nutriEntries.reduce((s, e) => s + (e.calories || 0), 0);
  const totalProtein = Math.round(nutriEntries.reduce((s, e) => s + (e.protein || 0), 0));

  return `=== ERNÄHRUNG HEUTE (OpenNutriTracker) ===
Ziele: ${nutritionGoals.calories} kcal | ${nutritionGoals.protein}g Protein | ${nutritionGoals.carbs || 280}g Carbs | ${nutritionGoals.fat || 70}g Fett
Getrackt heute: ${totalKcal} kcal | ${totalProtein}g Protein (${nutriEntries.length} Einträge geloggt)`;
}

export interface GarminHealthSnapshot {
  trainingReadiness?: number;
  bodyBattery?: number;
  hrvStatus?: string;
  sleepScore?: number;
  sleepDurationHours?: number;
  activeCaloriesBurned?: number;
  restingHeartRate?: number;
}

export function buildGarminContext(
  health: GarminHealthSnapshot,
  garminActivities: GarminActivity[]
): string {
  const garmin = {
    trainingReadiness: 78,
    bodyBattery: 82,
    hrvStatus: "balanced",
    sleepScore: 85,
    sleepDurationHours: 7.8,
    activeCaloriesBurned: 620,
    restingHeartRate: 46,
    ...health,
  };

  const garminActivitiesDetail = garminActivities
    .map((act) => {
      const distKm = act.distanceMeters
        ? `${(act.distanceMeters / 1000).toFixed(1)} km`
        : "";
      const durationMin = act.durationSeconds
        ? `${Math.round(act.durationSeconds / 60)} Min`
        : "";
      const hrStr = act.avgHeartRate
        ? `Puls: Ø ${act.avgHeartRate} bpm (Max: ${act.maxHeartRate || "-"} bpm)`
        : "";
      const powerStr = act.avgPowerWatts
        ? `Leistung: Ø ${act.avgPowerWatts}W (Max: ${act.maxPowerWatts || "-"}W)`
        : "";
      const eleStr = act.elevationGainMeters
        ? `Höhenmeter: +${act.elevationGainMeters}m`
        : "";
      const teStr = act.trainingEffectAerobic
        ? `Training Effect: Aerob ${act.trainingEffectAerobic} / Anaerob ${act.trainingEffectAnaerobic || 0}`
        : "";
      const dateStr = new Date(act.startTime).toLocaleDateString("de-DE", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      });

      return `- [${act.device || "Garmin"}] ${dateStr}: "${act.name}" (${act.type}) | ${distKm} in ${durationMin} | ${act.caloriesBurned} kcal | ${hrStr} | ${powerStr} | ${eleStr} | ${teStr}`;
    })
    .join("\n");

  return `=== GARMIN CONNECT (Vital-, Erholungs- & Aktivitätsdaten) ===
Training Readiness: ${garmin.trainingReadiness}/100
Body Battery: ${garmin.bodyBattery}%
HRV Status: ${garmin.hrvStatus}
Schlaf: ${garmin.sleepDurationHours}h (Score ${garmin.sleepScore}/100)
Ruhepuls: ${garmin.restingHeartRate} bpm
Aktiv-Kalorien verbrannt: ${garmin.activeCaloriesBurned} kcal

Garmin synchronisierte Aktivitäten (${garminActivities.length}):
${garminActivities.length > 0 ? garminActivitiesDetail : "Keine synchronisierten Garmin-Aktivitäten vorhanden."}`;
}

export function buildBodyCompContext(
  bodyWeightLog: BodyCompositionEntry[]
): string {
  const latestComp = bodyWeightLog && bodyWeightLog.length > 0 ? bodyWeightLog[0] : null;
  return latestComp
    ? `=== KÖRPERZUSAMMENSETZUNG (Körperfettwaage) ===
Gewicht: ${latestComp.weight} kg (vom ${latestComp.date.split("T")[0]})
Körperfett: ${latestComp.bodyFatPct ? `${latestComp.bodyFatPct}%` : "nicht gemessen"}
Muskelmasse: ${latestComp.muscleMassKg ? `${latestComp.muscleMassKg} kg (${latestComp.muscleMassPct || ""}% Anteil)` : "nicht gemessen"}
Körperwasser: ${latestComp.waterPct ? `${latestComp.waterPct}%` : "nicht gemessen"}
Viszeralfett: ${latestComp.visceralFat || "-"}
Grundumsatz (BMR): ${latestComp.bmrKcal || "-"} kcal`
    : "=== KÖRPERZUSAMMENSETZUNG ===\nNoch keine Messung vorhanden.";
}

export function buildSystemPrompt(
  stravaContext: string,
  memories: string[],
  prs: string,
  history: string,
  gymTemplates: GymTemplate[],
  enduranceTemplates: EnduranceTemplate[],
  nutritionContext: string,
  garminContext: string,
  bodyCompContext: string,
  athleteName: string = "Athlet",
  scientificGroundingContext?: string
): string {
  const memorySection =
    memories.length > 0
      ? `=== DEIN GEDÄCHTNIS (Fakten über den Nutzer) ===\n${memories.join("\n")}`
      : "";

  const templatesContext = `=== AKTUELLE TEMPLATES (WICHTIG für IDs) ===
Kraft/Mobilität:
${gymTemplates.length > 0 ? gymTemplates.map((t) => `- [${t.type}] ${t.name} (ID: ${t.id})`).join("\n") : "Keine Kraft-Templates vorhanden."}

Ausdauer:
${enduranceTemplates.length > 0 ? enduranceTemplates.map((t) => `- [${t.type}] ${t.name} (ID: ${t.id})`).join("\n") : "Keine Ausdauer-Templates vorhanden."}`;

  // Scientific Grounding: nur wenn der Retrieval-Step relevante Chunks lieferte.
  const scienceSection = scientificGroundingContext?.trim()
    ? `=== WISSENSCHAFTLICHE LEITPLANKEN (STRIKT EINZUHALTEN) ===
Du planst und begründest dein Training primär nach den belegten Prinzipien aus dem Scientific Grounding Context unten. Verstoße nicht ohne triftigen, erklärten Grund gegen diese Prinzipien:
- Konkurrierende Belastungen entkoppeln: Zwischen schweren Krafteinheiten (v. a. tiefe Kniebeugen) und intensiven VO2max-Intervallen liegen mindestens 6 Stunden – besser verschiedene Tage.
- Progressive Überlastung schrittweise: Faustregel max. ~10 % Volumensteigerung pro Woche; bei ACWR > 1,5 oder deutlicher Ermüdungssignalen Deload statt Mehr.
- Wenn du eine Empfehlung auf eine gelieferte Quelle stützt, zitiere sie im Text im Format „Basierend auf <Autoren> (<Jahr>)…“.
- Erfinde NIEMALS Quellen, Studien oder Zahlen, die nicht im Grounding-Kontext stehen.

${scientificGroundingContext.trim()}
`
    : "";

  return `Du bist ein ganzheitlicher KI-Coach für Hybrid-Athleten (Kombination aus Kraft- und Ausdauertraining, Schlaf, Erholung und Ernährung). \
Antworte immer auf Deutsch, hilfreich, präzise und motivierend.

Du sprichst mit dem Athleten "${athleteName}". Sprich ihn respektvoll mit "${athleteName}" an (verwende NIEMALS statische Fallback-Namen wie "Max", außer der Nutzer stellt sich explizit so vor).

Du hast Zugriff auf:
- Die Garmin Connect Vital- und Erholungsdaten (Training Readiness, Body Battery, HRV Status, Schlaf, Ruhepuls, verbrannte Aktiv-Kalorien).
- Die Körperzusammensetzungsdaten der Körperfettwaage (Gewicht, KFA %, Muskelmasse in kg, Wasser %, Viszeralfett).
- Den aktuellen Ernährungs- und Kalorientracker (OpenNutriTracker).
- Die Strava- und internen Trainings-Logs und Bestleistungen (PRs).

=== AUTOMATISCHER REKALKULATIONS-LOOP BEI GEWICHTSKORREKTUR ===
Wenn der Nutzer sein Körpergewicht korrigiert oder einen Messfehler meldet:
1. Speichere das neue Gewicht via \`log_body_weight\`.
2. Bestätige nicht nur trocken den Eintrag, sondern berechne PROAKTIV den neuen Grundumsatz (BMR nach Mifflin-St Jeor) und gib eine sportwissenschaftliche Einschätzung zur Gelenkbelastung (z. B. Sehnen- & Knieentlastung beim Laufen und Kniebeugen).
3. Biete sofort interaktiv an: "Möchtest du, dass ich deinen Trainingsplan und dein Kalorienziel mit dem korrigierten Gewicht für die Woche neu anpasse?"
4. Halte den Status der offenen Anfrage aktiv.

=== WOCHENPLAN-FORMATIERUNG IM CHAT ===
Wenn du einen 7-Tage-Trainingsplan vorstellst, formatiere ihn als kompakte, übersichtliche Markdown-Tabelle (| Tag | Sportart | Einheit | Intensität/Fokus |), damit die Nachricht kompakt und angenehm lesbar bleibt.

=== DEINE MÖGLICHKEITEN & TOOLS ===

1. KRAFT & MOBILITÄT: Erstelle Kraft-, Stretching- oder Mobilitäts-Routinen mit create_gym_template. (Mobilität wird in der App rosa markiert).
2. AUSDAUERTRAINING: Erstelle Vorlagen mit create_endurance_template.
3. WOCHENPLANUNG: Plane die Woche mit update_weekly_plan.
4. ABHAKEN: Nutze complete_planned_activity.
5. ADMINISTRATIVE KONTROLLE: Du kannst alte Routinen löschen mit delete_gym_template oder delete_endurance_template.
6. GEDÄCHTNIS/GEWICHT: Nutze save_memory und log_body_weight.

=== WICHTIGE REGEL FÜR ÄNDERUNGEN ===
BEVOR du ein Tool ausführst, das etwas erstellt, löscht oder massiv ändert, MUSST du:
1. Den Inhalt der Änderung kurz zusammenfassen (was wird gelöscht? was kommt neu?).
2. Den Nutzer explizit um Erlaubnis fragen.
Führe den Tool-Call ERST aus, wenn der Nutzer im nächsten Schritt zugestimmt hat. Ausnahme: Der Nutzer hat dich explizit in seiner Nachricht dazu aufgefordert ("Lösche ID X").

=== AKTUELLER KONTEXT ===
${memorySection}
${scienceSection}${templatesContext}
${prs}

${history}

${garminContext}

${bodyCompContext}

${nutritionContext}

${stravaContext}`;
}
