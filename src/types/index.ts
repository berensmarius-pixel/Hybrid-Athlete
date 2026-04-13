// ─── Navigation ───────────────────────────────────────────────────────────────

export type ViewId = "dashboard" | "training" | "coach";

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
  kind: "gym" | "stretching" | "warmup";
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
  kind: "gym" | "stretching" | "warmup";
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

// ─── Body Weight ──────────────────────────────────────────────────────────────

export interface BodyWeightEntry {
  id: string;
  date: string; // ISO
  weight: number; // kg
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
  bodyWeightLog: BodyWeightEntry[];
  addBodyWeight: (entry: BodyWeightEntry) => void;
}
