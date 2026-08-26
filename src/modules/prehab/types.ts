import type { DayPlan, GymTemplate, LoggedSession } from "@/types";

export type PrehabCategory = "raise" | "mobility" | "activation";

export type BodyRegion =
  | "shoulder"
  | "chest"
  | "thoracic"
  | "wrist"
  | "forearm"
  | "hip"
  | "hipFlexor"
  | "glute"
  | "adductor"
  | "hamstring"
  | "quad"
  | "knee"
  | "ankle"
  | "calf"
  | "lowerBack"
  | "fullBody";

export interface PrehabDrill {
  id: string;
  name: string;
  category: PrehabCategory;
  regions: BodyRegion[];
  icon: string;
  cue: string;
  description: string;
  durationSeconds: number;
}

export type PrehabContext =
  | "upper-push"
  | "upper-pull"
  | "lower-body"
  | "cycling-intervals"
  | "cycling-endurance"
  | "running"
  | "general";

export interface PrehabStep extends PrehabDrill {
  reason?: string;
  isSorenessBoost?: boolean;
}

export interface SorenessFlag {
  region: BodyRegion;
  label: string;
  note: string;
  sessionDate: string;
}

export interface PrehabProtocol {
  context: PrehabContext;
  title: string;
  subtitle: string;
  targetSeconds: number;
  steps: PrehabStep[];
  totalSeconds: number;
  sorenessFlags: SorenessFlag[];
}

export interface GeneratePrehabInput {
  day: DayPlan;
  template?: GymTemplate | null;
  sessions?: LoggedSession[];
  workoutDateOverride?: string;
  targetSeconds?: number;
}
