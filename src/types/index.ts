// ─── Navigation ───────────────────────────────────────────────────────────────

export type ViewId = "dashboard" | "training" | "nutrition" | "coach";

// ─── Workout types ────────────────────────────────────────────────────────────

export type WorkoutType = "gym" | "cycling" | "running" | "swimming" | "rest" | "stretching" | "warmup" | "mobility";

// ─── Multi-Session Support für Hybrid-Athleten ────────────────────────────────

export interface DaySession {
  id: string;
  workoutType: WorkoutType;
  title: string;
  description?: string;
  templateId?: string;
  isCompleted?: boolean;
  timeOfDay?: "morning" | "afternoon" | "evening";
}

// ─── Weekly plan ──────────────────────────────────────────────────────────────

export interface DayPlan {
  dayIndex: number;   // 0 = Monday … 6 = Sunday
  dayShort: string;   // "Mo", "Di", …
  dayFull: string;    // "Montag", …
  workoutType: WorkoutType;
  title: string;
  description: string;
  isDeload?: boolean;
  templateId?: string; // optional linked template to start directly
  isCompleted?: boolean;
  /** Optionale Multi-Sessions an einem Tag (z.B. Kraft morgens + Schwimmen nachmittags) */
  sessions?: DaySession[];
}

// ─── Set types ────────────────────────────────────────────────────────────────

export type SetType = "warmup" | "working" | "drop";

export interface TemplateSet {
  id: string;
  type: SetType;
  targetReps?: number;
  targetDuration?: number; // seconds, used mainly for stretching/warmup
  targetRir?: number; // Reps in reserve
  /** Ziel-RPE-Obergrenze (1–10), z. B. Deload-Cap bei 6–7 */
  targetRpe?: number;
  restSeconds?: number; // planned rest duration in seconds
}

export interface TemplateExercise {
  id: string;
  name: string;
  sets: TemplateSet[];
  // Wger enrichment (populated when selected from API)
  wgerId?: number;
  description?: string;
  muscleGroup?: string;  // German, e.g. "Brust", "Beine"
  muscles?: string[];    // English muscle names, e.g. ["Pectoralis major"]
  imageUrl?: string;
  // Superset pairing (set by superset-optimizer)
  supersetId?: string;       // groups exactly two exercises into one superset
  supersetOrder?: "A" | "B"; // alternating execution order within the superset
  // Legacy fields (kept optional for migration)
  targetSets?: number;
  targetReps?: number;
}

// ─── Workout Templates (Gym + Endurance) ─────────────────────────────────────

export interface GymTemplate {
  id: string;
  name: string;
  type: "gym" | "stretching" | "warmup" | "mobility"; // gym-style templates
  exercises: TemplateExercise[];
}

export interface EnduranceTemplate {
  id: string;
  name: string;
  type: "cycling" | "running" | "swimming";
  description: string; // e.g. "5x1km @ 4:30/km, 2min Pause"
  estimatedDuration?: string; // e.g. "45 Min"
}

export type WorkoutTemplate = GymTemplate | EnduranceTemplate;

// ─── Gym logger ───────────────────────────────────────────────────────────────

export interface ExerciseSet {
  id: string;
  type: SetType;
  weight: number | "";
  reps: number | "";
  duration?: number | ""; // in seconds/minutes
  rir?: number | ""; // Reps in reserve
  rpe?: number | ""; // Rate of perceived exertion (1-10)
  isCompleted?: boolean;
}

export interface ExerciseEntry {
  id: string;
  exercise: string;
  sets: ExerciseSet[];
  // Legacy / metadata for UI display
  targetReps?: number;
  legacySets?: number | "";
  legacyWeight?: number | "";
  legacyCompletedReps?: number | "";
}

export interface GymSession {
  kind: "gym" | "stretching" | "warmup" | "mobility";
  id: string;
  date: string; // ISO
  templateId?: string;
  templateName?: string;
  entries: ExerciseEntry[];
  notes?: string;
  rpe?: number; // Overall session RPE 1–10
}

// ─── Endurance logger ─────────────────────────────────────────────────────────

export interface EnduranceSession {
  kind: "endurance";
  id: string;
  date: string;
  activityType: "cycling" | "running" | "swimming";
  duration: string;
  heartRate: number | "";
  pace: string;
  rpe: number;
  templateId?: string;
  templateName?: string;
  /** Set when this session was auto-imported from Strava */
  stravaId?: number;
  notes?: string;
  /** Minutes spent in each HR zone (index 0 = zone 1 … index 4 = zone 5) */
  hrZones?: number[];
}

export type LoggedSession = GymSession | EnduranceSession;

// ─── Active session (in-progress workout) ────────────────────────────────────

export type ActiveGymSession = {
  kind: "gym" | "stretching" | "warmup" | "mobility";
  templateId?: string;
  templateName?: string;
  entries: ExerciseEntry[];
  startTime: string; // ISO timestamp when workout started
};

export type ActiveEnduranceSession = {
  kind: "endurance";
  activityType: "cycling" | "running";
  duration: string;
  heartRate: number | "";
  pace: string;
  rpe: number;
  templateId?: string;
  templateName?: string;
};

export type ActiveSession = ActiveGymSession | ActiveEnduranceSession;

// ─── Strava integration ───────────────────────────────────────────────────────

/** Raw activity shape returned by GET /athlete/activities */
export interface StravaActivity {
  id: number;
  name: string;
  type: string;           // "Run" | "Ride" | etc.
  sport_type: string;     // more granular in newer API versions
  start_date: string;     // ISO 8601
  start_date_local: string;
  distance: number;       // metres
  moving_time: number;    // seconds
  elapsed_time: number;   // seconds
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed: number;  // m/s
  total_elevation_gain: number;
  map?: { summary_polyline?: string };
}

/** Lightweight athlete info returned after OAuth token exchange */
export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile: string; // avatar URL
}

/** Token response from Strava OAuth */
export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: StravaAthlete;
}

/** Internal connection state persisted to localStorage */
export interface StravaConnection {
  isConnected: boolean;
  athlete: StravaAthlete | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;  // unix timestamp
  lastSynced: string | null; // ISO date string
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessageAction {
  id: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  actionType: "apply_plan" | "recalculate_metrics" | "custom_prompt" | "confirm";
  /** Kontext je actionType: DayPlan[] (apply_plan), {weight} (recalc), Prompt-Text (custom_prompt) */
  payload?: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "coach";
  text: string;
  timestamp: Date;
  model?: string;
  images?: string[]; // base64 encoded strings
  actions?: ChatMessageAction[];
  planProposal?: DayPlan[];
}

// ─── Personal Records ─────────────────────────────────────────────────────────

export interface PersonalRecord {
  exerciseName: string;
  /** Estimated 1RM using Epley formula */
  estimated1RM: number;
  /** Best single set: weight × reps */
  bestWeight: number;
  bestReps: number;
  date: string; // ISO
}

// ─── Body Weight & Composition (Insmart / Fitdays / Scale) ───────────────────

export interface BodyCompositionEntry {
  id: string;
  date: string; // ISO or YYYY-MM-DD
  weight: number; // kg (e.g. 78.4)
  bodyFatPct?: number; // % (e.g. 13.8)
  fatMassKg?: number; // kg (e.g. 14.0)
  fatFreeMassKg?: number; // kg (e.g. 83.6)
  muscleMassKg?: number; // kg (e.g. 64.2)
  muscleMassPct?: number; // % (e.g. 81.8)
  skeletalMusclePct?: number; // % (e.g. 55.3)
  waterKg?: number; // kg (e.g. 60.4)
  waterPct?: number; // % (e.g. 62.4)
  proteinKg?: number; // kg (e.g. 19.1)
  proteinPct?: number; // % (e.g. 19.5)
  boneMassKg?: number; // kg (e.g. 3.4)
  visceralFat?: number; // 1-15 (e.g. 4)
  bmrKcal?: number; // kcal (e.g. 1820)
  bmi?: number; // e.g. 23.4
  metabolicAge?: number; // years (e.g. 24)
  subcutaneousFatPct?: number; // % (e.g. 11.2)
  impedanceOhm?: number; // Ohm (e.g. 444)
  athlete?: boolean; // Fitdays "Sport"-Modus
  weightSource?: string; // "stabilized-frame" | "live-fallback"
  source?: "Insmart BLE" | "Insmart FG260" | "Fitdays CSV" | "Manual";
}

export type BodyWeightEntry = BodyCompositionEntry;

// ─── Nutrition / OpenNutriTracker ─────────────────────────────────────────────

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  caloriesPer100g: number; // kcal
  proteinPer100g: number;  // g
  carbsPer100g?: number;    // g
  fatPer100g?: number;      // g
  servingSize?: number;    // e.g. 100g or package portion in g
  servingUnit?: string;    // e.g. "g", "ml", "Portion"
  barcode?: string;
  imageUrl?: string;
  isCustom?: boolean;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealEntry {
  id: string;
  mealType: MealType;
  food: FoodItem;
  amount: number;         // in grams or ml
  calories: number;       // total kcal for this entry
  protein: number;        // total protein (g)
  carbs: number;          // total carbs (g)
  fat: number;            // total fat (g)
  loggedAt?: string;      // ISO or HH:mm
}

export interface DailyNutritionGoal {
  calories: number; // kcal e.g. 2500
  protein: number;  // g e.g. 160
  carbs: number;    // g e.g. 280
  fat: number;      // g e.g. 70
  waterMl: number;  // ml e.g. 3000
  isAutoPilot?: boolean; // true if AI Coach automatically manages targets
  athleteGoal?: "recomp" | "hypertrophy" | "endurance" | "cut" | "maintain" | "bulk";
  proteinPerKg?: number; // e.g. 2.0 or 2.2
  lastAutoAdjustedAt?: string;
  autoAdjustReason?: string;
}

export interface DailyNutritionLog {
  date: string; // YYYY-MM-DD
  entries: MealEntry[];
  waterMl: number;
}

// ─── Smart Pantry & Expiry-Driven Recipes ─────────────────────────────────────

export type PantryUnit = "g" | "kg" | "ml" | "l" | "stk";

export type PantryUrgency = "expired" | "critical" | "warning" | "stable";

export interface MacroBreakdown {
  calories: number; // kcal
  protein: number;  // g
  carbs: number;    // g
  fat: number;      // g
}

export interface PantryItem {
  id: string;
  barcode?: string;
  name: string;
  brand?: string;
  quantity: number;
  unit: PantryUnit;
  /** MHD / Verfallsdatum, optional – ISO-Datum (YYYY-MM-DD) */
  expirationDate?: string;
  addedAt: string; // ISO
  caloriesPer100g: number; // pro 100 g/ml (bzw. pro Stück bei "stk")
  macros: { protein: number; carbs: number; fat: number }; // pro 100 g/ml
  category?: string;
  imageUrl?: string;
  /** Gramm pro Stück – nur relevant bei unit "stk" */
  gramsPerPiece?: number;
}

export type RecipeGeneratorMode = "strict" | "minimal";

export interface RecipeIngredientUse {
  pantryItemId: string;
  name: string;
  amountUsed: number;
  unit: PantryUnit;
  daysUntilExpiry?: number;
}

export interface MissingIngredient {
  name: string;
  amount?: string;
}

export interface RecipeSuggestion {
  id: string;
  title: string;
  description: string;
  totalPrepTimeMin: number;
  servings: number;
  /** Makros pro Portion */
  totalMacros: MacroBreakdown;
  pantryItemsUsed: RecipeIngredientUse[];
  missingIngredients: MissingIngredient[];
  steps: string[];
  /** 0–100: wie gut das Rezept dringend verbrauchte Zutaten verwertet */
  expiryScore: number;
}

// ─── Garmin & Holistic Health Metrics ─────────────────────────────────────────

export type HrvStatus = "balanced" | "unbalanced" | "low" | "poor";
export type TrainingStatusType = "productive" | "maintaining" | "recovery" | "unproductive" | "overreaching" | "peaking";

export interface GarminDailyHealth {
  date: string; // YYYY-MM-DD
  trainingReadiness: number; // 0-100
  bodyBattery: number; // 0-100
  bodyBatteryCharged?: number;
  bodyBatteryDrained?: number;
  hrvStatus: HrvStatus;
  hrvWeeklyAvgMs?: number;
  hrvLastNightMs?: number;
  sleepScore: number; // 0-100
  sleepDurationHours: number; // e.g. 7.5
  deepSleepSeconds?: number;
  lightSleepSeconds?: number;
  remSleepSeconds?: number;
  awakeSleepSeconds?: number;
  recoveryTimeHours: number; // e.g. 24
  restingHeartRate: number; // bpm e.g. 48
  minHeartRate?: number;
  maxHeartRate?: number;
  activeCaloriesBurned: number; // kcal e.g. 850
  totalCaloriesBurned: number; // kcal e.g. 2950
  bmrCalories?: number;
  steps?: number;
  dailyStepGoal?: number;
  totalDistanceMeters?: number;
  floorsClimbed?: number;
  avgStressLevel?: number; // 0-100
  maxStressLevel?: number;
  stressDurationRestMinutes?: number;
  stressDurationLowMinutes?: number;
  stressDurationMediumMinutes?: number;
  stressDurationHighMinutes?: number;
  acuteTrainingLoad?: number; // e.g. 343
  minChronicLoad?: number; // e.g. 175
  maxChronicLoad?: number; // e.g. 328
  chronicLoad?: number; // e.g. 219
  acwrRatio?: number; // e.g. 1.5
  loadLowAerobic?: number;
  loadLowAerobicTargetMin?: number;
  loadLowAerobicTargetMax?: number;
  loadHighAerobic?: number;
  loadHighAerobicTargetMin?: number;
  loadHighAerobicTargetMax?: number;
  loadAnaerobic?: number;
  loadAnaerobicTargetMin?: number;
  loadAnaerobicTargetMax?: number;
  trainingBalancePhrase?: string;
  trainingStatus?: TrainingStatusType;
  vo2MaxRunning?: number; // e.g. 54
  vo2MaxCycling?: number; // e.g. 58
  fitnessAge?: number; // e.g. 20
  avgWakingRespiration?: number; // breaths/min
  avgSleepRespiration?: number;
  spO2AvgPct?: number; // %
  /** Lokale Bettgehzeit "HH:mm" (Garmin Schlaf-Sync, für Circadian-Gate) */
  bedtimeLocal?: string;
  /** Lokale Aufwachzeit "HH:mm" (Garmin Schlaf-Sync, für Circadian-Gate) */
  waketimeLocal?: string;
  lastSyncedAt?: string; // ISO
  deviceSource?: string;
}

/** Verknüpfung auf das geplante Workout aus dem Wochenplan (Planned-vs-Actual). */
export interface PlannedWorkoutLink {
  title: string;
  description?: string;
  workoutType?: WorkoutType;
  templateId?: string;
  date: string; // YYYY-MM-DD
}

export interface GarminActivity {
  id: string;
  /** Native Garmin Connect Activity-ID (für Detail-Telemetrie) */
  garminId?: string;
  name: string;
  type: "running" | "cycling" | "gym" | "other";
  device: "Forerunner 265" | "Edge 840" | "Garmin";
  startTime: string; // ISO
  durationSeconds: number;
  distanceMeters: number;
  caloriesBurned: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPowerWatts?: number; // Power meter on Edge 840
  maxPowerWatts?: number;
  elevationGainMeters?: number;
  trainingEffectAerobic?: number; // 0.0 - 5.0
  trainingEffectAnaerobic?: number; // 0.0 - 5.0
  // ─── Webhook-Parser-Anreicherung (ACTIVITY_DETAILS-Pipeline) ────────────────
  normalizedPowerWatts?: number;
  /** Zum Aktivitätszeitpunkt gültige FTP (Garmin-Summary, für Adhärenz-Bewertung) */
  functionalThresholdPowerWatts?: number;
  /** Arbeit in kJ = Avg Power × Moving Duration / 1000 */
  workKJ?: number;
  /** Training Stress Score (Garmin oder kJ-basiert geschätzt) */
  tss?: number;
  intensityFactor?: number;
  avgCadenceRpm?: number;
  /** Minuten je Zone (Index 0 = Zone 1 …) – HR oder Power, je nach Sport */
  timeInZonesMin?: number[];
  movingDurationSeconds?: number;
  /** Verknüpftes geplantes Workout aus dem Wochenplan */
  plannedWorkout?: PlannedWorkoutLink;
  /** Herkunft des Datensatzes */
  source?: "sync" | "webhook" | "import";
}

// ─── Training Load (ATL / CTL / TSB) ─────────────────────────────────────────

/** Tages-Snapshot der Formkurve (berechnet vom Webhook-Worker & Client). */
export interface TrainingLoadSnapshot {
  date: string; // YYYY-MM-DD
  atl: number; // Acute Training Load (7-Tage-EMA der Daily-TSS)
  ctl: number; // Chronic Training Load (42-Tage-EMA)
  tsb: number; // Training Stress Balance = CTL − ATL (Form)
  dailyTss: number;
  /** Grobe Form-Einordnung für UI-Badges */
  status: "fresh" | "neutral" | "fatigued" | "overreaching";
  updatedAt: string;
}

/** Nach einer Einheit angepasste Auffüll-Ziele (basierend auf gemessenem kJ). */
export interface ReplenishmentTarget {
  date: string; // YYYY-MM-DD
  activityId?: string;
  activityName?: string;
  energyExpenditureKcal: number; // aus kJ umgerechnet
  additionalCarbsG: number; // über Basis-Ziel hinaus
  additionalCalories: number;
  hydrationMl: number;
  updatedAt: string;
}

/** AI-Debrief nach abgeschlossener Einheit (2–3 Sätze, Mobile-first). */
export interface PostWorkoutDebrief {
  id: string;
  activityId?: string;
  activityName: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO
  /** 2–3 Sätze Planned-vs-Actual im Deutschen */
  debrief: string;
  headline?: string;
  /** Kennzahlen-Kürzel für Chips in der Feed-Card */
  stats?: { label: string; value: string }[];
  plannedWorkout?: PlannedWorkoutLink;
  /** Wie der Debrief erstellt wurde (Fallback-Template vs. Gemini) */
  generator: "ai" | "template";
}

// ─── Garmin Activity Detail-Telemetrie (On-Demand von Garmin Connect) ────────

export interface GarminActivitySeries {
  values: number[];
}

export interface GarminSplit {
  lapIndex?: number;
  distance?: number;
  duration?: number;
  elapsedDuration?: number;
  averageMovingSpeed?: number;
  averageSpeed?: number;
  averageHR?: number;
  averagePower?: number;
  elevationGain?: number;
  [key: string]: unknown;
}

export interface GarminWeather {
  weatherTypeDTO?: { desc?: string };
  temp?: number;
  windSpeed?: number;
  windDirectionCompassPoint?: string;
  relativeHumidity?: number;
  [key: string]: unknown;
}

export interface GarminGear {
  displayName?: string;
  customMakeModel?: string;
  modelName?: string;
  [key: string]: unknown;
}

export interface GarminActivityDetails {
  success: boolean;
  activityId: string;
  error?: string;
  fetchedAt?: string;
  summary?: Record<string, unknown> & {
    activityId?: number;
    activityName?: string;
    startTimeLocal?: string;
    startTimeGMT?: string;
    distance?: number;
    duration?: number;
    movingDuration?: number;
    elapsedDuration?: number;
    elevationGain?: number;
    elevationLoss?: number;
    maxElevation?: number;
    minElevation?: number;
    averageSpeed?: number;
    averageMovingSpeed?: number;
    maxSpeed?: number;
    calories?: number;
    averageHR?: number;
    maxHR?: number;
    minHR?: number;
    averagePower?: number;
    maxPower?: number;
    normalizedPower?: number;
    functionalThresholdPower?: number;
    trainingStressScore?: number;
    intensityFactor?: number;
    activityTrainingLoad?: number;
    moderateIntensityMinutes?: number;
    vigorousIntensityMinutes?: number;
    aerobicTrainingEffect?: number;
    anaerobicTrainingEffect?: number;
    trainingEffectLabel?: string;
    aerobicTrainingEffectMessage?: string;
    anaerobicTrainingEffectMessage?: string;
    averageBikeCadence?: number;
    averageTemperature?: number;
    waterConsumed?: number;
  };
  /** Messreihen in ~Sekunden-Auflösung (downgesampelt, Index-aligniert) */
  series?: Record<string, number[]>;
  seriesUnits?: Record<string, string>;
  sampleStepSeconds?: number;
  timestampsMs?: number[];
  gpsTrack?: { lat: number; lon: number; alt?: number }[];
  bounds?: {
    minLat?: number;
    maxLat?: number;
    minLon?: number;
    maxLon?: number;
  };
  splits?: GarminSplit[];
  hrTimeInZones?: { zones?: Array<{ zoneNumber?: number; secsInZone?: number; zoneLowBoundary?: number }> } | null;
  powerTimeInZones?: { zones?: Array<{ zoneNumber?: number; secsInZone?: number; zoneLowBoundary?: number }> } | null;
  exerciseSets?: { exerciseSets?: Array<Record<string, unknown>> } | null;
  weather?: GarminWeather | null;
  gear?: GarminGear[] | null;
}

export interface HolisticDayGuidance {
  readinessCategory: "optimal" | "moderate" | "fatigued" | "recovery_needed";
  trainingAdvice: {
    headline: string;
    description: string;
    suggestedAction: "proceed" | "push" | "reduce_intensity" | "active_recovery" | "rest";
    suggestedWorkoutTitle?: string;
  };
  nutritionAdvice: {
    headline: string;
    adjustedCalories: number;
    burnedCalories: number;
    recommendedCarbs: number;
    recommendedProtein: number;
    recommendedFat: number;
    fuelingTips: string[];
    mealSuggestions: {
      timing: string;
      title: string;
      description: string;
      carbsG: number;
      proteinG: number;
    }[];
  };
}

// ─── Coach Memory ─────────────────────────────────────────────────────────────

export interface CoachMemory {
  id: string;
  content: string;
  createdAt: string; // ISO
}

// ─── Subjective Check-ins (Tagesbefinden für Deload-Erkennung) ───────────────

export interface DailyCheckIn {
  date: string; // YYYY-MM-DD
  /** Muskelkater / lokale Erschöpfung: 0 (nichts) – 10 (maximal) */
  soreness: number; // 0-10
  /** Subjektive Energie / Erholung: 0 (erschöpft) – 10 (frisch) */
  energy: number; // 0-10
  sleepQuality?: number; // 0-10
  stress?: number; // 0-10
  notes?: string;
}

// ─── App context ──────────────────────────────────────────────────────────────

export interface AppContextValue {
  activeView: ViewId;
  setActiveView: (view: ViewId) => void;
  loggedSessions: LoggedSession[];
  addSession: (session: LoggedSession) => void;
  /** Batch-Import (z. B. Strava-Sync) – überspringt IDs, die bereits existieren. */
  addSessions: (sessions: LoggedSession[]) => void;
  weeklyPlan: DayPlan[];
  updateWeeklyPlan: (plan: DayPlan[]) => void;
  gymTemplates: GymTemplate[];
  saveGymTemplate: (template: GymTemplate) => void;
  deleteGymTemplate: (id: string) => void;
  enduranceTemplates: EnduranceTemplate[];
  saveEnduranceTemplate: (template: EnduranceTemplate) => void;
  deleteEnduranceTemplate: (id: string) => void;
  activeSession: ActiveSession | null;
  setActiveSession: (session: ActiveSession | null) => void;
  chatMessages: ChatMessage[];
  /** Akzeptiert auch funktionale Updates – nötig für React-konforme Batch-Updates. */
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  personalRecords: PersonalRecord[];
  coachMemories: CoachMemory[];
  addCoachMemory: (content: string) => void;
  deleteCoachMemory: (id: string) => void;
  newPRs: PersonalRecord[];
  clearNewPRs: () => void;
  bodyWeightLog: BodyCompositionEntry[];
  addBodyWeight: (entry: BodyCompositionEntry) => void;
  importMultipleBodyCompositionEntries: (entries: BodyCompositionEntry[]) => void;

  // Nutrition state & actions
  nutritionLogs: DailyNutritionLog[];
  nutritionGoals: DailyNutritionGoal;
  setNutritionGoals: (goals: DailyNutritionGoal) => void;
  addMealEntry: (date: string, entry: Omit<MealEntry, "id" | "calories" | "protein" | "carbs" | "fat"> & { amount: number }) => void;
  addMultipleMealEntries: (date: string, entries: Array<Omit<MealEntry, "id" | "calories" | "protein" | "carbs" | "fat"> & { amount: number }>) => void;
  removeMealEntry: (date: string, entryId: string) => void;
  updateMealEntryAmount: (date: string, entryId: string, newAmount: number) => void;
  quickAddCalories: (date: string, mealType: MealType, name: string, calories: number, protein: number, carbs?: number, fat?: number) => void;
  addWaterIntake: (date: string, amountMl: number) => void;
  customFoods: FoodItem[];
  saveCustomFood: (food: FoodItem) => void;
  deleteCustomFood: (id: string) => void;

  // Pantry state & actions
  pantryItems: PantryItem[];
  addPantryItem: (item: Omit<PantryItem, "id" | "addedAt"> & { id?: string; addedAt?: string }) => void;
  updatePantryItem: (id: string, patch: Partial<Omit<PantryItem, "id">>) => void;
  removePantryItem: (id: string) => void;
  /** Zieht verwendete Mengen ab; leere Items werden entfernt. */
  consumePantryItems: (uses: RecipeIngredientUse[]) => void;

  // Garmin & Holistic state
  garminHealthLogs: Record<string, GarminDailyHealth>; // keyed by date (YYYY-MM-DD)
  updateGarminHealth: (date: string, health: Partial<GarminDailyHealth>) => void;
  garminActivities: GarminActivity[];
  addGarminActivity: (activity: GarminActivity) => void;
}
