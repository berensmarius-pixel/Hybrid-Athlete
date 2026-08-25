"use client";

import { useState } from "react";
import {
  Calendar,
  Dumbbell,
  Activity,
  Bike,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useApp } from "@/context/AppContext";
import { cn, generateId, getLocalDateString } from "@/lib/utils";
import type {
  GymTemplate,
  EnduranceTemplate,
  ActiveGymSession,
  ActiveEnduranceSession,
  DayPlan,
} from "@/types";
import { motion } from "motion/react";

// Modular Tabs
import WeeklyPlanTab from "./WeeklyPlanTab";
import RoutinesTab from "./RoutinesTab";
import RoutesTab from "./RoutesTab";
import AnatomyTab from "./AnatomyTab";
import ActiveGymLogger from "./ActiveGymLogger";
import ActiveEnduranceLogger from "./ActiveEnduranceLogger";

// Dynamic Modals
const PlanEditorModal = dynamic(() => import("@/components/dashboard/PlanEditorModal"), { ssr: false });
const AdaptivePlanModal = dynamic(() => import("./AdaptivePlanModal"), { ssr: false });
const GymTemplateEditorModal = dynamic(() => import("./GymTemplateEditorModal"), { ssr: false });
const EnduranceTemplateEditorModal = dynamic(() => import("./EnduranceTemplateEditorModal"), { ssr: false });
const ExerciseAnatomyModal = dynamic(() => import("./ExerciseAnatomyModal"), { ssr: false });
const CyclingRouteModal = dynamic(() => import("@/components/routes/CyclingRouteModal"), { ssr: false });

import { analyzeAdaptiveTraining } from "@/lib/adaptiveWorkoutEngine";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";

const TABS = [
  { id: "plan", label: "Wochenplan", Icon: Calendar },
  { id: "routines", label: "Routinen", Icon: Dumbbell },
  { id: "routes", label: "Strecken & GPX", Icon: Bike },
  { id: "anatomy", label: "Anatomie & Heatmap", Icon: Activity },
] as const;

export default function TrainingView() {
  const {
    activeSession,
    setActiveSession,
    gymTemplates,
    enduranceTemplates,
    saveGymTemplate,
    saveEnduranceTemplate,
    weeklyPlan,
    updateWeeklyPlan,
    garminHealthLogs,
  } = useApp();

  const [topTab, setTopTab] = useState<"plan" | "routines" | "routes" | "anatomy">("plan");

  // Suggestion
  const todayStr = getLocalDateString();
  const health = garminHealthLogs[todayStr] || getDefaultGarminHealth(todayStr);
  const suggestions = analyzeAdaptiveTraining(health, weeklyPlan);
  const topSuggestion = suggestions.length > 0 ? suggestions[0] : null;

  // Modal states
  const [gymEditorTarget, setGymEditorTarget] = useState<GymTemplate | null | undefined>(null);
  const [enduranceEditorTarget, setEnduranceEditorTarget] = useState<EnduranceTemplate | null | undefined>(null);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [adaptiveModalOpen, setAdaptiveModalOpen] = useState(false);
  const [anatomyOpen, setAnatomyOpen] = useState(false);
  const [routesOpen, setRoutesOpen] = useState(false);

  // ── Helper: Start workouts ────────────────────────────────────────────────
  function templateToEntries(template: GymTemplate) {
    return template.exercises.map((ex) => ({
      id: generateId(),
      exercise: ex.name,
      sets: ex.sets.map((s) => ({
        id: generateId(),
        type: s.type,
        weight: "",
        reps: s.targetReps ? String(s.targetReps) : "",
      })),
    }));
  }

  function startEmptyGym() {
    setActiveSession({
      kind: "gym",
      entries: [{ id: generateId(), exercise: "", sets: [{ id: generateId(), type: "working", weight: "", reps: "" }] }],
      startTime: new Date().toISOString(),
    } as ActiveGymSession);
  }

  function startEmptyEndurance(activityType: "running" | "cycling") {
    setActiveSession({
      kind: "endurance",
      activityType,
      duration: "",
      heartRate: "",
      pace: "",
      rpe: 5,
      startTime: new Date().toISOString(),
    } as ActiveEnduranceSession);
  }

  function startEmptyMobility() {
    setActiveSession({
      kind: "mobility",
      entries: [{ id: generateId(), exercise: "", sets: [{ id: generateId(), type: "working", weight: "", reps: "" }] }],
      startTime: new Date().toISOString(),
    } as ActiveGymSession);
  }

  function startGymTemplate(template: GymTemplate) {
    setActiveSession({
      kind: template.type === "warmup" ? "warmup" : template.type === "stretching" ? "stretching" : "gym",
      templateId: template.id,
      templateName: template.name,
      entries: templateToEntries(template),
      startTime: new Date().toISOString(),
    } as ActiveGymSession);
  }

  function startEnduranceTemplate(template: EnduranceTemplate) {
    setActiveSession({
      kind: "endurance",
      activityType: template.type,
      duration: "",
      heartRate: "",
      pace: "",
      rpe: 5,
      templateId: template.id,
      templateName: template.name,
      startTime: new Date().toISOString(),
    } as ActiveEnduranceSession);
  }

  function startDayPlanWorkout(day: DayPlan) {
    if (day.workoutType === "rest") return;
    if (day.templateId) {
      const gymT = gymTemplates.find((t) => t.id === day.templateId);
      if (gymT) {
        startGymTemplate(gymT);
        return;
      }
      const endT = enduranceTemplates.find((t) => t.id === day.templateId);
      if (endT) {
        startEnduranceTemplate(endT);
        return;
      }
    }
    if (day.workoutType === "cycling" || day.workoutType === "running") {
      startEmptyEndurance(day.workoutType);
    } else if (day.workoutType === "mobility") {
      startEmptyMobility();
    } else {
      startEmptyGym();
    }
  }

  // ── Active session screen ─────────────────────────────────────────────────
  if (activeSession) {
    if (activeSession.kind === "endurance") {
      return <ActiveEnduranceLogger session={activeSession as ActiveEnduranceSession} onDiscard={() => setActiveSession(null)} />;
    }
    return <ActiveGymLogger session={activeSession as ActiveGymSession} onDiscard={() => setActiveSession(null)} />;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950">
      {/* ── Top Header & Tab Navigation ─────────────────────────────────────── */}
      <header className="px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-3 border-b border-white/5 bg-zinc-950/80 backdrop-blur-2xl sticky top-0 z-10 space-y-3 sm:space-y-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-2 font-mono">
            <span>TRAINING & PERIODISIERUNG</span>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">
              PRO
            </span>
          </h1>
          <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">Wochenplan, Routinen, Outdoor GPX & Muskel-Heatmap</p>
        </div>

        {/* Top 4 Navigation Tabs */}
        <div className="flex glass-panel p-1 rounded-2xl border border-white/10 w-full sm:max-w-2xl overflow-x-auto scrollbar-none relative">
          {TABS.map(({ id, label, Icon }) => {
            const active = topTab === id;
            return (
              <button
                key={id}
                onClick={() => setTopTab(id)}
                className={cn(
                  "relative flex-1 min-w-[95px] py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap z-10",
                  active ? "text-black font-black" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {active && (
                  <motion.div
                    layoutId="trainingTabIndicator"
                    className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-xl shadow-md shadow-cyan-500/25 -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon size={14} className={active ? "text-black" : "text-zinc-400"} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Tab 1: Wochenplan & Periodisierung ──────────────────────────────── */}
      {topTab === "plan" && (
        <WeeklyPlanTab
          onStartDayPlan={startDayPlanWorkout}
          onOpenPlanEditor={() => setPlanEditorOpen(true)}
          onOpenAdaptiveModal={() => setAdaptiveModalOpen(true)}
        />
      )}

      {/* ── Tab 2: Routinen & Logger ────────────────────────────────────────── */}
      {topTab === "routines" && (
        <RoutinesTab
          onStartEmptyGym={startEmptyGym}
          onStartEmptyEndurance={startEmptyEndurance}
          onStartEmptyMobility={startEmptyMobility}
          onStartGymTemplate={startGymTemplate}
          onStartEnduranceTemplate={startEnduranceTemplate}
          onEditGymTemplate={(t) => setGymEditorTarget(t)}
          onEditEnduranceTemplate={(t) => setEnduranceEditorTarget(t)}
        />
      )}

      {/* ── Tab 3: Strecken & GPX (Outdoor/Ausdauer) ────────────────────────── */}
      {topTab === "routes" && (
        <RoutesTab onOpenFullModal={() => setRoutesOpen(true)} />
      )}

      {/* ── Tab 4: Anatomie & Heatmap (Regeneration/Muskelbelastung) ─────────── */}
      {topTab === "anatomy" && (
        <AnatomyTab onOpenFullModal={() => setAnatomyOpen(true)} />
      )}

      {/* Modals */}
      {gymEditorTarget !== null && (
        <GymTemplateEditorModal
          template={gymEditorTarget}
          onSave={saveGymTemplate}
          onClose={() => setGymEditorTarget(null)}
        />
      )}
      {enduranceEditorTarget !== null && (
        <EnduranceTemplateEditorModal
          template={enduranceEditorTarget}
          onSave={saveEnduranceTemplate}
          onClose={() => setEnduranceEditorTarget(null)}
        />
      )}
      {planEditorOpen && (
        <PlanEditorModal
          plan={weeklyPlan}
          onSave={updateWeeklyPlan}
          onClose={() => setPlanEditorOpen(false)}
        />
      )}
      {adaptiveModalOpen && topSuggestion && (
        <AdaptivePlanModal
          suggestion={topSuggestion}
          isOpen={adaptiveModalOpen}
          onClose={() => setAdaptiveModalOpen(false)}
        />
      )}
      {anatomyOpen && (
        <ExerciseAnatomyModal isOpen={anatomyOpen} onClose={() => setAnatomyOpen(false)} />
      )}
      {routesOpen && (
        <CyclingRouteModal isOpen={routesOpen} onClose={() => setRoutesOpen(false)} />
      )}
    </div>
  );
}
