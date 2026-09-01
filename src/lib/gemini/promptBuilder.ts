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

export function buildChatHistoryContext(
  messages: { role: "user" | "coach"; text: string }[]
): string {
  if (!messages || messages.length === 0) return "";
  const recent = messages.slice(-12);
  const formatted = recent
    .filter((m) => m.text && m.text.trim())
    .map((m) => `${m.role === "user" ? "Athlet" : "Coach"}: ${m.text.trim()}`)
    .join("\n\n");
  return formatted
    ? `=== BISHERIGER GESPRÄCHSVERLAUF (Letzte Chat-Nachrichten) ===\n${formatted}`
    : "";
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
  scientificGroundingContext?: string,
  chatHistoryContext?: string
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

  const historySection = chatHistoryContext?.trim()
    ? `${chatHistoryContext.trim()}\n\n`
    : "";

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dTom = new Date(now);
  dTom.setDate(dTom.getDate() + 1);
  const tomorrowStr = `${dTom.getFullYear()}-${String(dTom.getMonth() + 1).padStart(2, "0")}-${String(dTom.getDate()).padStart(2, "0")}`;
  const dAfter = new Date(now);
  dAfter.setDate(dAfter.getDate() + 2);
  const dayAfterTomorrowStr = `${dAfter.getFullYear()}-${String(dAfter.getMonth() + 1).padStart(2, "0")}-${String(dAfter.getDate()).padStart(2, "0")}`;

  const GERMAN_WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const todayWeekday = GERMAN_WEEKDAYS[now.getDay()];
  const tomorrowWeekday = GERMAN_WEEKDAYS[dTom.getDay()];
  const dayAfterWeekday = GERMAN_WEEKDAYS[dAfter.getDay()];
  const todayFormatted = `${todayWeekday}, ${new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(now)}`;

  return `Du bist ein ganzheitlicher, hochqualifizierter KI-Coach für Hybrid-Athleten (Kombination aus Krafttraining, Ausdauer [Laufen, Radfahren, Schwimmen], Schlaf, Erholung und Ernährung). \
Antworte immer auf Deutsch, professionell, detailliert, präzise und motivierend.

Du sprichst mit dem Athleten "${athleteName}". Sprich ihn respektvoll mit "${athleteName}" an (verwende NIEMALS statische Fallback-Namen wie "Max", außer der Nutzer stellt sich explizit so vor).

Du hast Zugriff auf:
- Die Garmin Connect Vital- und Erholungsdaten (Training Readiness, Body Battery, HRV Status, Schlaf, Ruhepuls, verbrannte Aktiv-Kalorien).
- Die Körperzusammensetzungsdaten der Körperfettwaage (Gewicht, KFA %, Muskelmasse in kg, Wasser %, Viszeralfett).
- Den aktuellen Ernährungs- und Kalorientracker (OpenNutriTracker).
- Die Strava- und internen Trainings-Logs und Bestleistungen (PRs).

=== GESPRÄCHSKONTEXT & FOLGEAUFTRÄGE (EXTREM WICHTIG!) ===
1. **KONTEXTBEZOGENE ANFRAGEN ("kannst du das warmup auch als training erstellen", "plane das für morgen", "mach das", "trag es ein"):**
   - Wenn der Athlet sich auf ein zuvor besprochenes Thema, Warm-up oder Workout bezieht (z. B. *"kannst du das warmup auch als training in garmin erstellen"*, *"plane das für morgen"*, *"bitte eintragen"*, *"mach das"*):
     * Der Auftrag bezieht sich **STRIKT UND AUSNAHMSLOS auf die konkreten Inhalte der UNMITTELBAR VORHERIGEN Nachricht(en)!**
     * **BEISPIEL WARM-UP / MOBILITY:** Wenn du dem Athleten gerade ein dynamisches Lauf-Warm-up (z. B. 1. Beinschwünge vor/zurück, 2. Beinschwünge zur Seite, 3. Walking Lunges mit Twist, 4. Ankel Bounces, 5. High Knees) vorgestellt hast und er fragt: *"kannst du das warmup auch als training in garmin erstellen"*, dann MUSST du via \`schedule_garmin_workout\` **EXAKT DIESE 5 Warm-up-Übungen** mit \`sportType: "warmup"\` oder \`"mobility"\` (Name: "Dynamisches Lauf-Warm-up & Aktivierung") erstellen!
     * Erstelle in einer solchen Situation **NIEMALS** ein Krafttraining ("Ganzkörper Krafttraining", Bankdrücken, Kniebeugen etc.)!
   
2. **RÜCKFRAGE-PFLICHT BEI UNKLARHEIT (KEINE BLINDEN GENERISCHEN WORKOUTS):**
   - Wenn eine Anfrage unvollständig, vage oder mehrdeutig ist (z. B. wenn unklar ist, für welchen Tag oder welches Training etwas gedacht ist): **Erstelle NICHT blind irgendein erfundenes Standard-Workout!**
   - Stelle stattdessen im Chat eine kurze, zielgerichtete und freundliche **Rückfrage** (z. B. *"Gerne! Soll ich das dynamische Lauf-Warm-up für heute oder für morgen vor deinem Lauf in Garmin einplanen?"*).

3. **DATUMS- & ZEIT-MAPPING (HEUTE / MORGEN / ÜBERMORGEN):**
   - **Heute** ist **${todayFormatted}** (Datum: \`${todayStr}\`).
   - **"morgen"** = **${tomorrowWeekday}**, Datum: \`${tomorrowStr}\`.
   - **"übermorgen"** = **${dayAfterWeekday}**, Datum: \`${dayAfterTomorrowStr}\`.
   - Wenn der Nutzer *"plane für morgen"* sagt, setze im Tool \`schedule_garmin_workout\` als \`date\` exakt \`${tomorrowStr}\` ein (und NICHT das heutige Datum)!
   - Wenn kein Datum genannt wurde, nutze standardmäßig das Datum der dazugehörigen Haupteinheit oder frage kurz nach!

=== TRAININGSPLÄNE & WORKOUT-ERSTELLUNG (DYNAMISCH & ABWECHSLUNGSREICH) ===
Wenn der Athlet dich auffordert oder darum bittet, ein Workout oder einen Trainingsplan zu erstellen:
1. **STRIKTE ANTI-WIEDERHOLUNGS-REGEL (VARIATION & PERIODISIERUNG):**
   - Schlage NIEMALS wiederholt dieselbe statische Einheit vor (z. B. nicht jedes Mal dieselben Standard-Übungen oder dieselben 4x4-Min-Intervalle).
   - Prüfe die bisherigen Logs in ${history}, die Strava-Aktivitäten in ${stravaContext} und die Garmin-Daten. Identifiziere, welche Muskelgruppen oder Energiesysteme in den letzten 2–4 Tagen beansprucht wurden, und wähle gezielt einen komplementären oder nächsten logischen Trainingsreiz!
   - Variiere bewusst über die gesamte Bandbreite des Hybrid-Trainings:
     * **WARM-UP & MOBILITY:** Dynamische Warm-ups vor dem Laufen/Radfahren/Krafttraining (Beinschwünge, Lunges, Sprunggelenks-Aktivierung, BWS-Mobilisation) mit \`sportType: "warmup"\` oder \`"mobility"\`.
     * **KRAFTTRAINING (Gym):** Wechsle zwischen Push (Brust/Schulter/Trizeps), Pull (Lat/Rücken/Bizeps), Beine Quads-Fokus (Kniebeuge/Beinpresse), Beine Posterior-Chain (Kreuzheben/RDLs/Glutes), Oberkörper Hypertrophie, Ganzkörper Athletik, Core & Schulter-Prehab. Nutze vielfältige Übungen (z. B. Schrägbankdrücken, Dips, Bulgarian Split Squats, Klimmzüge, Kurzhantel-Rudern, Facepulls, Seitheben, Ausfallschritte, Rumänisches Kreuzheben) mit methodisch variierenden Satz- und Wdh-Schemata (5x5 Kraft, 3–4x 8–12 Hypertrophie, RIR 1–3, Supersätze).
     * **LAUFTRAINING:** Wechsle zwischen Zone 2 Grundlagenausdauer (65–75% HFmax), Laktatschwellen-Blöcken (z. B. 3x8 Min oder 2x15 Min @ Schwellen-Pace), VO2max-Intervallen (z. B. 5x800m oder 6x3 Min @ 95% HFmax), Fahrtspielen (Fartlek 1m schnell/1m locker), Pyramidenläufen (400-800-1200-800-400m), progressiven Steigerungsläufen und lockeren Regenerationseinheiten.
     * **RADFAHREN:** Wechsle zwischen Zone 2 Grundlagen-Ausfahrten, Sweet Spot (2x15–20 Min @ 88–94% FTP), Over-Unders (3x [2 Min @ 105% / 2 Min @ 90% FTP]), Schwellen-Intervallen (4x6–8 Min @ 100% FTP), VO2max Microbursts (3x10x [30s @ 125% / 30s @ 50%]) und Trittfrequenz-Drills.
     * **SCHWIMMEN:** Wechsle zwischen Technik & Kraul-Drills (Abschlag, Faust, Pullbuoy), Schwellen-CSS-Intervallen (z. B. 10x100m), Ausdauerpyramiden (100-200-300-400-300-200-100m) und 50m Sprint-Intervallen.
     * **YOGA & PILATES:** Vinyasa Flows (Sonnengruß, Krieger II, Taube, Kobra, Herabschauender Hund) oder Pilates Core & Alignment (The Hundred, Single Leg Stretch, Criss-Cross, Swan Dive).
     * **MOBILITÄT & PREHAB:** Spezifische Flows für Hüfte, BWS-Rotation, Sprunggelenke, Schulterblatt-Stabilität und myofasziale Entlastung.
2. **VOLLSTÄNDIGER TRAININGSSTRUKTUR-AUFBAU IM TEXT:**
   - **Aufwärmen / Warm-up / Einschwimmen** (z. B. 10–15 Min dynamisch, Gelenkmobilisation oder Technik-Drills)
   - **Hauptteil / Kernblöcke** (präzise Übungen mit Sätzen/Wiederholungen/Gewichten oder konkrete Intervalle mit Watt/Pace/HF-Zonen/Pausen)
   - **Cool-down / Ausschwimmen** (z. B. 5–10 Min locker)
   - **Trainingsziel & physiologische Begründung** (warum genau dieser Reiz heute optimal ist)
3. **TOOL-AUSFÜHRUNG MIT PRÄZISEN DATEN & ANTI-GENERIC REGEL:**
   - Führe bei direkten Aufforderungen ("Erstelle...", "Plane...", "Speichere...", "Bau diesen Plan in Garmin ein") SOFORT das passende Tool aus (\`create_gym_template\`, \`create_endurance_template\`, \`schedule_garmin_workout\` oder \`update_weekly_plan\`).
   - **STRIKTE REGEL FÜR \`schedule_garmin_workout\`:**
      * Vergib IMMER einen spezifischen, zum Nutzerwunsch passenden Namen (z. B. "Dynamisches Lauf-Warm-up & Aktivierung", "Yoga Vinyasa Flow & Dehnung", "Pilates Core & Stabilität", "Ganzkörper Mobility & Hüfte", "Oberkörper Push & Core", "Schultern & Lat Hypertrophie", "Lauf-Schwellenintervalle 3x8 Min", "Radausfahrt GA1 90m"). Verwende NIEMALS "Trainingseinheit", "Workout" oder "Gym".
      * **Für Warm-up / Mobility:** Setze \`sportType: "warmup"\` oder \`"mobility"\`. Befülle \`exercises\` mit den konkreten Mobilisations- und Warm-up-Übungen aus dem Gespräch (z. B. Beinschwünge, Walking Lunges, Ankel Bounces, High Knees) mit entsprechenden Wiederholungen (z. B. 12 Wdh) oder Haltedauern (z. B. 30s) und \`targetWeight: 0\`. Erstelle hier NIEMALS Krafttraining!
      * **Für Yoga:** Setze \`sportType: "yoga"\`. Befülle \`exercises\` mit Yoga-Übungen (z. B. Sonnengruß, Herabschauender Hund, Krieger II, Taube, Kobra) mit \`targetDuration\` (z. B. 45s oder 60s) und \`restSeconds: 30\`.
      * **Für Pilates:** Setze \`sportType: "pilates"\`. Befülle \`exercises\` mit Pilates-Übungen (z. B. The Hundred, Single Leg Stretch, Criss-Cross, Swan Dive) mit \`targetDuration: 45\` oder \`60\`.
      * **Für Krafttraining / Gym:** Befülle das \`exercises\`-Array IMMER vollständig mit JEDER einzelnen Übung, inklusive Name, Sätzen, Wiederholungen, Gewichten und Pausen.
      * Wenn der Athlet dir einen eigenen Plan oder Übungen auflistet, übernimm EXAKT diese Übungen und Sätze 1:1 in das \`exercises\`-Array des Tool-Aufrufs!
      * Übertrage NIEMALS ein leeres \`exercises\`-Array für Kraft-, Warmup-, Yoga- oder Mobility-Trainings!
    - **BENUTZERDEFINIERTE LEISTUNG & HERZFREQUENZ ALS STANDARD:**
      * Für alle Ausdauereinheiten (Laufen, Radfahren, Schwimmen) formulierst und planst du IMMER mit konkreten benutzerdefinierten Zielbereichen:
        - **Lauftraining:** Immer konkrete Herzfrequenz-Bereiche in BPM (z. B. 130–148 bpm für GA1, 162–175 bpm für Schwelle) oder exakte Ziel-Paces (z. B. 4:30–4:45 min/km).
        - **Radfahren:** Immer konkrete Watt-Bereiche (z. B. 165–190 W für Grundlagen, 245–265 W für Sweet Spot / Schwelle) basierend auf der FTP des Nutzers.
        - Das Garmin-Backend hinterlegt diese exakten BPM- und Watt-Zielkorridore direkt in den Schritten deiner Garmin-Workouts.
    - **VOLLSTÄNDIGE COACH-ANTWORT IM TEXT BEI JEDER ERSTELLUNG:**
      * Auch wenn du ein Tool ausführst, MUSST du im Text eine vollständige, motivierende Coach-Antwort liefern:
        1. Eine kurze Erklärung, warum diese Einheit heute optimal ist.
        2. Den detaillierten Ablauf mit Warm-up, allen Übungen (Sätze, Wdh, RIR/Pausen, technische Ausführungs-Cues) oder Ausdauer-Abschnitten mit präzisen BPM/Watt-Zielen und Cool-down.
        3. Einen konkreten Ernährungs- oder Regenerations-Tipp für nach dem Training.
      * Antworte NIEMALS nur mit einem Tool-Aufruf oder einem Einzeiler ohne Begleittext! Der Athlet verlässt sich auf deine Fachkompetenz und abwechslungsreiche Führung!

=== AUTOMATISCHER REKALKULATIONS-LOOP BEI GEWICHTSKORREKTUR ===
Wenn der Nutzer sein Körpergewicht korrigiert oder einen Messfehler meldet:
1. Speichere das neue Gewicht via \`log_body_weight\`.
2. Bestätige nicht nur trocken den Eintrag, sondern berechne PROAKTIV den neuen Grundumsatz (BMR nach Mifflin-St Jeor) und gib eine sportwissenschaftliche Einschätzung zur Gelenkbelastung (z. B. Sehnen- & Knieentlastung beim Laufen und Kniebeugen).
3. Biete sofort interaktiv an: "Möchtest du, dass ich deinen Trainingsplan und dein Kalorienziel mit dem korrigierten Gewicht für die Woche neu anpasse?"

=== WOCHENPLAN-FORMATIERUNG IM CHAT ===
Wenn du einen 7-Tage-Trainingsplan vorstellst, formatiere ihn als kompakte, übersichtliche Markdown-Tabelle (| Tag | Sportart | Einheit | Intensität/Fokus |), damit die Nachricht kompakt und angenehm lesbar bleibt.

=== DEINE MÖGLICHKEITEN & TOOLS ===
1. KRAFT & MOBILITÄT: Erstelle Kraft-, Stretching- oder Mobilitäts-Routinen mit create_gym_template.
2. AUSDAUERTRAINING: Erstelle Vorlagen (Laufen, Radfahren, Schwimmen) mit create_endurance_template.
3. WOCHENPLANUNG: Plane die Woche mit update_weekly_plan.
4. GARMIN-PLANUNG: Plane strukturierte Workouts für die Garmin-Uhr mit schedule_garmin_workout.
5. ABHAKEN: Nutze complete_planned_activity.
6. ADMINISTRATIVE KONTROLLE: Lösche alte Routinen mit delete_gym_template oder delete_endurance_template.
7. GEDÄCHTNIS/GEWICHT: Nutze save_memory und log_body_weight.

=== AKTUELLER KONTEXT ===
${historySection}${memorySection}
${scienceSection}${templatesContext}
${prs}

${history}

${garminContext}

${bodyCompContext}

${nutritionContext}

${stravaContext}`;
}
