import type {
  EnduranceTemplate,
  GarminActivity,
  GymTemplate,
  LoggedSession,
  DayPlan,
} from "@/types";
import type { FitnessProfile } from "@/lib/workout/targetEngine";

export type LibraryDiscipline = "gym" | "cycling" | "running" | "mobility";

export type DisciplineFilter = "all" | LibraryDiscipline;

export type IntensityFocus =
  | "z2"
  | "sweetspot"
  | "threshold-vo2max"
  | "hypertrophy"
  | "max-strength";

export type WorkoutStatus = "planned" | "completed" | "skipped";

export type WorkoutOrigin =
  | "template-gym"
  | "template-endurance"
  | "plan"
  | "logged"
  | "garmin";

export type LibraryStepPhase = "warmup" | "work" | "rest" | "cooldown";

export interface LibraryStep {
  id: string;
  phase: LibraryStepPhase;
  label: string;
  durationSeconds?: number;
  distanceMeters?: number;
  ftpPct?: { low: number; high: number };
  watts?: { min: number; max: number };
  bpm?: { min: number; max: number };
  cadence?: { min: number; max: number };
  sets?: number;
  reps?: number;
  notes?: string;
}

export interface SparklineSegment {
  pct: number;
  weight: number;
  phase: LibraryStepPhase;
}

export interface ComplianceMetric {
  key: string;
  label: string;
  planned: number;
  actual: number;
  unit: string;
  higherIsBetter: boolean;
}

export interface ComplianceData {
  metrics: ComplianceMetric[];
}

export interface LibraryWorkout {
  id: string;
  title: string;
  description?: string;
  discipline: LibraryDiscipline;
  status: WorkoutStatus;
  origin: WorkoutOrigin;
  templateKind?: GymTemplate["type"] | EnduranceTemplate["type"];
  templateId?: string;
  date?: string;
  planDayIndex?: number;
  durationSeconds: number;
  estimatedTss: number;
  focusTags: IntensityFocus[];
  ftpPct?: { low: number; high: number };
  rpeTarget?: number;
  primaryMuscles: string[];
  steps: LibraryStep[];
  sparkline: SparklineSegment[];
  compliance?: ComplianceData;
  sourceLabel?: string;
  searchText: string;
}

export interface LibraryFilters {
  discipline: DisciplineFilter;
  focus: IntensityFocus | "all";
  status: WorkoutStatus | "all";
  query: string;
}

export type LibrarySortMode = "newest" | "duration" | "tss" | "title";

export interface BuildLibraryInput {
  gymTemplates: GymTemplate[];
  enduranceTemplates: EnduranceTemplate[];
  weeklyPlan: DayPlan[];
  loggedSessions: LoggedSession[];
  garminActivities: GarminActivity[];
  todayIndex: number;
  fitnessProfile: FitnessProfile;
}

export const DISCIPLINE_FILTER_OPTIONS: Array<{
  id: DisciplineFilter;
  label: string;
}> = [
  { id: "all", label: "Alle" },
  { id: "gym", label: "Gym / Kraft" },
  { id: "cycling", label: "Rennrad / Bike" },
  { id: "running", label: "Laufen" },
  { id: "mobility", label: "Mobility / Prehab" },
];

export const FOCUS_FILTER_OPTIONS: Array<{
  id: IntensityFocus | "all";
  label: string;
}> = [
  { id: "all", label: "Alle Foki" },
  { id: "z2", label: "Z2 Endurance" },
  { id: "sweetspot", label: "Sweetspot" },
  { id: "threshold-vo2max", label: "Threshold / VO2max" },
  { id: "hypertrophy", label: "Hypertrophy" },
  { id: "max-strength", label: "Max Strength" },
];

export const STATUS_FILTER_OPTIONS: Array<{
  id: WorkoutStatus | "all";
  label: string;
}> = [
  { id: "all", label: "Alle Status" },
  { id: "planned", label: "Geplant / Vorlage" },
  { id: "completed", label: "Abgeschlossen" },
  { id: "skipped", label: "Übersprungen" },
];

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  discipline: "all",
  focus: "all",
  status: "all",
  query: "",
};
