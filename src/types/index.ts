// ─── Navigation ───────────────────────────────────────────────────────────────

export type ViewId = "dashboard" | "training" | "nutrition" | "coach";

// ─── Workout types ────────────────────────────────────────────────────────────

export type WorkoutType = "gym" | "cycling" | "running" | "rest" | "stretching" | "warmup" | "mobility";

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
}

// ─── Set types ────────────────────────────────────────────────────────────────

export type SetType = "warmup" | "working" | "drop";

export interface TemplateSet {
  id: string;
  type: SetType;
  targetReps?: number;
  targetDuration?: number; // seconds, used mainly for stretching/warmup
  targetRir?: number; // Reps in reserve
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
  type: "cycling" | "running";
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
  activityType: "cycling" | "running";
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

export interface ChatMessage {
  id: string;
  role: "user" | "coach";
  text: string;
  timestamp: Date;
  model?: string;
  images?: string[]; // base64 encoded strings
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
  muscleMassKg?: number; // kg (e.g. 64.2)
  muscleMassPct?: number; // % (e.g. 81.8)
  waterPct?: number; // % (e.g. 62.4)
  boneMassKg?: number; // kg (e.g. 3.4)
  visceralFat?: number; // 1-15 (e.g. 4)
  bmrKcal?: number; // kcal (e.g. 1820)
  bmi?: number; // e.g. 23.4
  metabolicAge?: number; // years (e.g. 24)
  subcutaneousFatPct?: number; // % (e.g. 11.2)
  proteinPct?: number; // % (e.g. 19.5)
  source?: "Insmart BLE" | "Fitdays CSV" | "Manual";
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
}

export interface DailyNutritionLog {
  date: string; // YYYY-MM-DD
  entries: MealEntry[];
  waterMl: number;
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
  lastSyncedAt?: string; // ISO
  deviceSource?: string;
}

export interface GarminActivity {
  id: string;
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

// ─── App context ──────────────────────────────────────────────────────────────

export interface AppContextValue {
  activeView: ViewId;
  setActiveView: (view: ViewId) => void;
  loggedSessions: LoggedSession[];
  addSession: (session: LoggedSession) => void;
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
  setChatMessages: (messages: ChatMessage[]) => void;
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

  // Garmin & Holistic state
  garminHealthLogs: Record<string, GarminDailyHealth>; // keyed by date (YYYY-MM-DD)
  updateGarminHealth: (date: string, health: Partial<GarminDailyHealth>) => void;
  garminActivities: GarminActivity[];
  addGarminActivity: (activity: GarminActivity) => void;
}
