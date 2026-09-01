"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Watch,
  Bike,
  Activity,
  Upload,
  RefreshCw,
  Check,
  Zap,
  Heart,
  Moon,
  Flame,
  ShieldCheck,
  Sliders,
  LogIn,
  AlertCircle,
  KeyRound,
  Lock,
  Trash2,
  Dumbbell,
  Loader2,
  ChevronRight,
  CalendarDays,
  Sparkles,
  Waves,
  Calendar,
  Send,
  Plus,
  ArrowRight,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { parseGarminFile } from "@/lib/garmin/fitParser";
import {
  syncRealGarminData,
  loginToGarminConnect,
  checkGarminConnectionStatus,
  getDefaultGarminHealth,
  scheduleNativeGarminWorkout,
} from "@/lib/garmin/garminService";
import type { GarminDailyHealth, GarminActivity, HrvStatus } from "@/types";
import type { ScheduledGarminWorkout } from "@/lib/garmin/garminCli";
import { cn, getLocalDateString } from "@/lib/utils";
import GarminActivityDetailModal from "./GarminActivityDetailModal";
import GarminQuickWorkoutModal from "./GarminQuickWorkoutModal";

interface GarminHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SportFilter = "all" | "running" | "cycling" | "swimming" | "strength" | "custom";

export default function GarminHubModal({ isOpen, onClose }: GarminHubModalProps) {
  const {
    garminHealthLogs,
    updateGarminHealth,
    garminActivities,
    addGarminActivity,
    gymTemplates,
    enduranceTemplates,
  } = useApp();

  const todayStr = getLocalDateString();
  const currentHealth: GarminDailyHealth =
    garminHealthLogs[todayStr] || getDefaultGarminHealth(todayStr);

  const [activeTab, setActiveTab] = useState<"connect" | "upload" | "workouts">("connect");
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Quick Workout Creator modal state
  const [isQuickWorkoutOpen, setIsQuickWorkoutOpen] = useState(false);

  // Template dispatcher modal state
  const [isTemplateDispatcherOpen, setIsTemplateDispatcherOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<{ id: string; name: string; type: "gym" | "endurance"; data: any } | null>(null);
  const [templateDate, setTemplateDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  });
  const [isDispatchingTemplate, setIsDispatchingTemplate] = useState(false);

  // Sport Filter in workouts tab
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");

  // Workouts management state
  const [garminWorkoutsList, setGarminWorkoutsList] = useState<any[]>([]);
  const [isLoadingWorkouts, setIsLoadingWorkouts] = useState(false);
  const [deletingWorkoutId, setDeletingWorkoutId] = useState<number | string | null>(null);
  const [workoutMsg, setWorkoutMsg] = useState<string | null>(null);

  // Geplante Kalender-Termine (was WIRKLICH im Garmin-Kalender steht)
  const [scheduledList, setScheduledList] = useState<ScheduledGarminWorkout[]>([]);
  const [isLoadingScheduled, setIsLoadingScheduled] = useState(false);
  const [unschedulingId, setUnschedulingId] = useState<number | string | null>(null);

  // Quick Schedule from Library
  const [schedulingLibraryId, setSchedulingLibraryId] = useState<string | number | null>(null);

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [requiresMfa, setRequiresMfa] = useState(false);

  // Activity detail view
  const [detailActivity, setDetailActivity] = useState<GarminActivity | null>(null);

  // Manual metrics edit state
  const [readiness, setReadiness] = useState<number>(currentHealth.trainingReadiness);
  const [battery, setBattery] = useState<number>(currentHealth.bodyBattery);
  const loadGarminWorkouts = async () => {
    setIsLoadingWorkouts(true);
    setWorkoutMsg(null);
    try {
      void loadScheduledWorkouts();
      const res = await fetch("/api/garmin/workouts");
      const data = await res.json();
      if (data.success && Array.isArray(data.workouts)) {
        setGarminWorkoutsList(data.workouts);
      } else {
        setWorkoutMsg(data.error || "Fehler beim Laden der Workouts");
      }
    } catch (err: any) {
      setWorkoutMsg(err.message || "Netzwerkfehler");
    } finally {
      setIsLoadingWorkouts(false);
    }
  };

  const loadScheduledWorkouts = async () => {
    setIsLoadingScheduled(true);
    try {
      const res = await fetch("/api/garmin/schedule");
      const data = await res.json();
      if (data.success && Array.isArray(data.workouts)) {
        setScheduledList(data.workouts);
      }
    } catch {
      // still – Bibliotheksliste bleibt unabhängig nutzbar
    } finally {
      setIsLoadingScheduled(false);
    }
  };

  const handleUnscheduleWorkout = async (
    scheduledWorkoutId: number | string,
    name: string
  ) => {
    if (!confirm(`Termin "${name}" aus dem Garmin-Kalender entfernen?`)) return;
    setUnschedulingId(scheduledWorkoutId);
    setWorkoutMsg(null);
    try {
      const res = await fetch(
        `/api/garmin/schedule?id=${encodeURIComponent(String(scheduledWorkoutId))}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setScheduledList((prev) =>
          prev.filter((s) => String(s.scheduledWorkoutId) !== String(scheduledWorkoutId))
        );
        setWorkoutMsg(`✅ Termin "${name}" wurde aus dem Garmin-Kalender entfernt.`);
      } else {
        setWorkoutMsg(`❌ ${data.error || "Entfernen fehlgeschlagen"}`);
      }
    } catch (err: any) {
      setWorkoutMsg(`❌ ${err.message || "Fehler beim Entfernen"}`);
    } finally {
      setUnschedulingId(null);
    }
  };

  const handleDeleteWorkout = async (workoutId: number | string, workoutName: string) => {
    if (!confirm(`Möchtest du das Workout "${workoutName}" wirklich aus Garmin Connect löschen?`)) {
      return;
    }
    setDeletingWorkoutId(workoutId);
    setWorkoutMsg(null);
    try {
      const res = await fetch(`/api/garmin/workouts?id=${encodeURIComponent(String(workoutId))}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setGarminWorkoutsList((prev) => prev.filter((w) => w.workoutId !== workoutId && w.id !== workoutId));
        setWorkoutMsg(`✅ Workout "${workoutName}" erfolgreich gelöscht!`);
      } else {
        setWorkoutMsg(`❌ ${data.error || "Löschen fehlgeschlagen"}`);
      }
    } catch (err: any) {
      setWorkoutMsg(`❌ ${err.message || "Fehler beim Löschen"}`);
    } finally {
      setDeletingWorkoutId(null);
    }
  };

  useEffect(() => {
    if (activeTab === "workouts") {
      loadGarminWorkouts();
    }
  }, [activeTab]);

  const [hrv, setHrv] = useState<HrvStatus>(currentHealth.hrvStatus);
  const [sleepScore, setSleepScore] = useState<number>(currentHealth.sleepScore);
  const [sleepHours, setSleepHours] = useState<number>(currentHealth.sleepDurationHours);
  const [activeCalories, setActiveCalories] = useState<number>(currentHealth.activeCaloriesBurned);
  const [restingHr, setRestingHr] = useState<number>(currentHealth.restingHeartRate);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check connection status on open
  useEffect(() => {
    if (isOpen) {
      checkGarminConnectionStatus().then((connected) => {
        setIsConnected(connected);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSyncError(null);
    setSyncStatus(null);
    setIsLoggingIn(true);

    try {
      const res = await loginToGarminConnect(email, password, mfaCode || undefined);
      if (res.mfa_required) {
        setRequiresMfa(true);
        setSyncStatus("⚠️ Bitte gib den Garmin Zwei-Faktor-Code (MFA) ein.");
      } else if (res.success) {
        setIsConnected(true);
        setRequiresMfa(false);
        setSyncStatus("✅ Erfolgreich mit Garmin Connect verbunden!");
        // Immediately trigger sync
        handleSync();
      } else {
        setSyncError(res.error || "Login fehlgeschlagen. Bitte Zugangsdaten prüfen.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSync = async () => {
    setSyncError(null);
    setIsSyncing(true);
    setSyncStatus("Lade echte Garmin Gesundheits- & Aktivitätsdaten...");

    try {
      const res = await syncRealGarminData(todayStr);
      if (res.success && res.health) {
        updateGarminHealth(todayStr, res.health);
        if (res.health.trainingReadiness !== undefined) setReadiness(res.health.trainingReadiness);
        if (res.health.bodyBattery !== undefined) setBattery(res.health.bodyBattery);
        if (res.health.hrvStatus !== undefined) setHrv(res.health.hrvStatus);
        if (res.health.sleepScore !== undefined) setSleepScore(res.health.sleepScore);
        if (res.health.sleepDurationHours !== undefined) setSleepHours(res.health.sleepDurationHours);
        if (res.health.activeCaloriesBurned !== undefined) setActiveCalories(res.health.activeCaloriesBurned);
        if (res.health.restingHeartRate !== undefined) setRestingHr(res.health.restingHeartRate);

        if (res.activities && res.activities.length > 0) {
          for (const act of res.activities) {
            addGarminActivity(act);
          }
        }

        setSyncStatus(`✅ Synchronisation erfolgreich! ${res.activities?.length || 0} Aktivitäten & Vitalwerte geladen.`);
        setIsConnected(true);
      } else {
        setSyncError(res.error || "Sync fehlgeschlagen. Bitte erneut anmelden.");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSyncStatus("FIT-Datei wird verarbeitet...");
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const activity = await parseGarminFile(file);
        addGarminActivity(activity);
      }
      setSyncStatus(`✅ ${files.length} Garmin Datei(en) erfolgreich importiert!`);
    } catch {
      setSyncError("Fehler beim Parsen der Datei.");
    }
  };

  const handleSaveManualMetrics = (e: React.FormEvent) => {
    e.preventDefault();
    updateGarminHealth(todayStr, {
      trainingReadiness: readiness,
      bodyBattery: battery,
      hrvStatus: hrv,
      sleepScore,
      sleepDurationHours: sleepHours,
      activeCaloriesBurned: activeCalories,
      restingHeartRate: restingHr,
      deviceSource: "Manual",
    });
    onClose();
  };

  // Handle scheduling from library
  const handleScheduleLibraryWorkout = async (w: any, date: string) => {
    const wid = w.workoutId || w.id;
    setSchedulingLibraryId(wid);
    setWorkoutMsg(null);
    try {
      const sportKey = w.sportType?.sportTypeKey || w.sport || "custom";
      const payload: any = {
        name: w.workoutName || "Workout",
        type: sportKey,
        sport: sportKey,
        description: w.description || "",
        exercises: [],
      };
      const res = await scheduleNativeGarminWorkout(date, payload);
      if (res.success) {
        setWorkoutMsg(`✅ '${w.workoutName || "Workout"}' erfolgreich für ${date} im Kalender geplant!`);
        void loadScheduledWorkouts();
      } else {
        setWorkoutMsg(`❌ ${res.error || "Planen fehlgeschlagen"}`);
      }
    } catch (err: any) {
      setWorkoutMsg(`❌ ${err.message || "Fehler beim Planen"}`);
    } finally {
      setSchedulingLibraryId(null);
    }
  };

  // Handle template dispatch
  const handleDispatchTemplate = async () => {
    if (!selectedTemplate) return;
    setIsDispatchingTemplate(true);
    setWorkoutMsg(null);
    try {
      let payload: any;
      if (selectedTemplate.type === "gym") {
        const gym = selectedTemplate.data;
        payload = {
          name: gym.name,
          type: "strength",
          sport: "strength",
          description: `${gym.name} (Krafttraining)`,
          exercises: (gym.exercises || []).map((e: any) => ({
            name: e.name,
            sets: Array.from({ length: e.sets || 3 }).map(() => ({
              targetReps: typeof e.reps === "number" ? e.reps : 10,
              targetWeight: e.weight || 0,
              restSeconds: e.restSeconds || 90,
            })),
          })),
        };
      } else {
        const end = selectedTemplate.data;
        payload = {
          name: end.name,
          type: end.type || "running",
          description: end.description || `${end.estimatedDuration || "45 Min"} Ausdauertraining`,
          exercises: [],
        };
      }

      const res = await scheduleNativeGarminWorkout(templateDate, payload);
      if (res.success) {
        setWorkoutMsg(`✅ Template '${selectedTemplate.name}' erfolgreich für ${templateDate} an Garmin gesendet!`);
        setIsTemplateDispatcherOpen(false);
        setSelectedTemplate(null);
        void loadScheduledWorkouts();
      } else {
        setWorkoutMsg(`❌ ${res.error || "Senden fehlgeschlagen"}`);
      }
    } catch (err: any) {
      setWorkoutMsg(`❌ ${err.message || "Fehler beim Senden"}`);
    } finally {
      setIsDispatchingTemplate(false);
    }
  };

  const matchesSportFilter = (sportTypeStr: string | undefined | null) => {
    if (sportFilter === "all") return true;
    const s = (sportTypeStr || "").toLowerCase();
    if (sportFilter === "running") return s.includes("run") || s.includes("lauf");
    if (sportFilter === "cycling") return s.includes("cycl") || s.includes("bike") || s.includes("rad");
    if (sportFilter === "swimming") return s.includes("swim") || s.includes("schwimm");
    if (sportFilter === "strength") return s.includes("strength") || s.includes("gym") || s.includes("kraft");
    if (sportFilter === "custom") return s.includes("custom") || s.includes("other") || s.includes("warmup") || s.includes("mobility") || s.includes("yoga") || s.includes("pilates");
    return true;
  };

  const filteredScheduledList = scheduledList.filter((s) => matchesSportFilter(s.sportType || s.name));
  const filteredWorkoutsList = garminWorkoutsList.filter((w) =>
    matchesSportFilter(w.sportType?.sportTypeKey || w.sport || w.workoutName)
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col max-h-[92vh] shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Watch size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Garmin Sync Center &amp; Workout-Manager
                {isConnected && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Verbunden
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Forerunner 265 &amp; Edge 840 Kalender &amp; Vorlagen-Steuerung
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/40 px-5 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("connect")}
            className={cn(
              "pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === "connect"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Zap size={13} />
            Status &amp; Vitaldaten
          </button>

          <button
            onClick={() => setActiveTab("workouts")}
            className={cn(
              "pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === "workouts"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            <CalendarDays size={13} />
            Workouts &amp; Planer ({scheduledList.length})
          </button>

          <button
            onClick={() => setActiveTab("upload")}
            className={cn(
              "pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === "upload"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Upload size={13} />
            FIT-Upload
          </button>
        </div>

        {/* Tab 1: Connect / Sync */}
        {activeTab === "connect" && (
          <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
            {/* Sync status / action */}
            <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2.5 rounded-xl border",
                  isConnected
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                )}>
                  {isConnected ? <ShieldCheck size={18} /> : <AlertCircle size={18} />}
                </div>
                <div>
                  <p className="font-bold text-zinc-200">
                    {isConnected ? "Garmin Connect aktiv" : "Nicht verbunden"}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {syncStatus || (isConnected ? "Bereit für automatische Synchronisation" : "Bitte anmelden oder Zugangsdaten eingeben")}
                  </p>
                </div>
              </div>

              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <RefreshCw size={13} className={cn(isSyncing && "animate-spin text-cyan-400")} />
                <span>{isSyncing ? "Lädt..." : "Sync"}</span>
              </button>
            </div>

            {/* Health Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-2xl bg-zinc-950/40 border border-zinc-800">
                <span className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1 mb-1">
                  <Zap size={11} className="text-cyan-400" /> Readiness
                </span>
                <span className="text-lg font-mono font-bold text-cyan-400">{currentHealth.trainingReadiness}</span>
                <span className="text-[10px] text-zinc-500 block">/ 100</span>
              </div>
              <div className="p-3 rounded-2xl bg-zinc-950/40 border border-zinc-800">
                <span className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1 mb-1">
                  <Flame size={11} className="text-orange-400" /> Body Battery
                </span>
                <span className="text-lg font-mono font-bold text-orange-400">{currentHealth.bodyBattery}</span>
                <span className="text-[10px] text-zinc-500 block">/ 100</span>
              </div>
              <div className="p-3 rounded-2xl bg-zinc-950/40 border border-zinc-800">
                <span className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1 mb-1">
                  <Heart size={11} className="text-rose-400" /> Ruhepuls
                </span>
                <span className="text-lg font-mono font-bold text-rose-400">{currentHealth.restingHeartRate || 48}</span>
                <span className="text-[10px] text-zinc-500 block">bpm</span>
              </div>
              <div className="p-3 rounded-2xl bg-zinc-950/40 border border-zinc-800">
                <span className="text-zinc-500 text-[10px] uppercase font-bold flex items-center gap-1 mb-1">
                  <Moon size={11} className="text-indigo-400" /> Schlaf
                </span>
                <span className="text-lg font-mono font-bold text-indigo-400">{currentHealth.sleepScore || 85}</span>
                <span className="text-[10px] text-zinc-500 block">Score</span>
              </div>
            </div>

            {/* Login form if not connected */}
            {!isConnected && (
              <form onSubmit={handleLogin} className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800 space-y-3">
                <h4 className="font-bold text-zinc-200 text-xs">Mit Garmin Connect anmelden</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="email"
                    placeholder="Garmin E-Mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <input
                    type="password"
                    placeholder="Passwort"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200 text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
                {requiresMfa && (
                  <input
                    type="text"
                    placeholder="Garmin MFA Code (6-stellig)"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    className="w-full bg-zinc-900 border border-amber-500/50 rounded-xl px-3 py-2 text-zinc-200 text-xs font-mono text-center"
                  />
                )}
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogIn size={14} />
                  <span>{isLoggingIn ? "Verbinde..." : "Anmelden & Synchronisieren"}</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Tab 2: Upload */}
        {activeTab === "upload" && (
          <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-8 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-cyan-400/50 bg-zinc-950/60 hover:bg-zinc-900/60 transition-all cursor-pointer flex flex-col items-center justify-center gap-2.5 text-center group"
            >
              <div className="p-3 rounded-full bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
                <Upload size={22} />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-200">.FIT oder .GPX Datei hier ablegen</p>
                <p className="text-xs text-zinc-400 mt-1">Direkter Upload von Edge 840 / Forerunner 265 Aktivitäten</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".fit,.gpx,.tcx"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* Tab 3: Workouts Manager */}
        {activeTab === "workouts" && (
          <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
            {/* Top Quick Actions Bar */}
            <div className="flex items-center justify-between gap-2 flex-wrap bg-zinc-950/60 p-3 rounded-2xl border border-zinc-800">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setIsQuickWorkoutOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-zinc-950 font-bold text-xs hover:from-cyan-400 hover:to-blue-400 transition-all cursor-pointer shadow-md shadow-cyan-500/20 active:scale-95"
                >
                  <Plus size={13} className="stroke-[3]" />
                  <span>Neues Workout erstellen</span>
                </button>

                <button
                  onClick={() => setIsTemplateDispatcherOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-cyan-400/50 text-zinc-200 hover:text-cyan-300 font-bold text-xs transition-all cursor-pointer active:scale-95"
                >
                  <Send size={12} className="text-cyan-400" />
                  <span>Template senden</span>
                </button>
              </div>

              <button
                onClick={() => {
                  loadScheduledWorkouts();
                  loadGarminWorkouts();
                }}
                disabled={isLoadingScheduled || isLoadingWorkouts}
                className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
                title="Aktualisieren"
              >
                <RefreshCw size={13} className={cn((isLoadingScheduled || isLoadingWorkouts) && "animate-spin text-cyan-400")} />
              </button>
            </div>

            {/* Sport Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setSportFilter("all")}
                className={cn(
                  "px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer text-[11px]",
                  sportFilter === "all"
                    ? "bg-zinc-100 text-zinc-950"
                    : "bg-zinc-950/60 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                )}
              >
                Alle ({scheduledList.length})
              </button>
              <button
                onClick={() => setSportFilter("running")}
                className={cn(
                  "px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer text-[11px] flex items-center gap-1",
                  sportFilter === "running"
                    ? "bg-emerald-500 text-zinc-950"
                    : "bg-zinc-950/60 border border-zinc-800 text-zinc-400 hover:text-emerald-400"
                )}
              >
                <Activity size={11} /> Laufen
              </button>
              <button
                onClick={() => setSportFilter("cycling")}
                className={cn(
                  "px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer text-[11px] flex items-center gap-1",
                  sportFilter === "cycling"
                    ? "bg-orange-500 text-zinc-950"
                    : "bg-zinc-950/60 border border-zinc-800 text-zinc-400 hover:text-orange-400"
                )}
              >
                <Bike size={11} /> Rad
              </button>
              <button
                onClick={() => setSportFilter("strength")}
                className={cn(
                  "px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer text-[11px] flex items-center gap-1",
                  sportFilter === "strength"
                    ? "bg-purple-500 text-zinc-950"
                    : "bg-zinc-950/60 border border-zinc-800 text-zinc-400 hover:text-purple-400"
                )}
              >
                <Dumbbell size={11} /> Kraft
              </button>
              <button
                onClick={() => setSportFilter("custom")}
                className={cn(
                  "px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer text-[11px] flex items-center gap-1",
                  sportFilter === "custom"
                    ? "bg-indigo-500 text-zinc-100"
                    : "bg-zinc-950/60 border border-zinc-800 text-zinc-400 hover:text-indigo-400"
                )}
              >
                <Sparkles size={11} /> Warm-up &amp; Mobility
              </button>
            </div>

            {workoutMsg && (
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-medium text-zinc-200 flex items-center gap-2">
                <span>{workoutMsg}</span>
              </div>
            )}

            {/* Geplante Kalender-Termine */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <CalendarDays size={13} className="text-cyan-400" />
                Geplante Termine im Garmin-Kalender ({filteredScheduledList.length})
              </h3>

              {isLoadingScheduled ? (
                <div className="py-6 flex items-center justify-center gap-2 text-zinc-500 text-xs">
                  <Loader2 size={15} className="animate-spin text-cyan-400" />
                  <span>Lade Garmin-Kalender…</span>
                </div>
              ) : filteredScheduledList.length === 0 ? (
                <div className="py-4 text-center text-zinc-500 text-xs bg-zinc-950/40 rounded-2xl border border-zinc-800/80">
                  Keine Termine für diesen Filter im Garmin-Kalender geplant.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {filteredScheduledList.map((s) => {
                    const isUnscheduling = unschedulingId === s.scheduledWorkoutId;
                    const isToday = s.date === getLocalDateString();
                    const isCycling = (s.sportType || "").includes("cycl") || (s.sportType || "").includes("bike");
                    const isRunning = (s.sportType || "").includes("run") || (s.sportType || "").includes("lauf");
                    const isStrength = (s.sportType || "").includes("strength") || (s.sportType || "").includes("gym");
                    const isCustom = (s.sportType || "").includes("custom") || (s.sportType || "").includes("other");

                    return (
                      <div
                        key={String(s.scheduledWorkoutId)}
                        className={cn(
                          "p-2.5 rounded-2xl border flex items-center justify-between gap-3 transition-all",
                          isToday
                            ? "bg-cyan-500/10 border-cyan-500/30"
                            : "bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700/80"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                            isCycling ? "bg-orange-500/15 text-orange-400 border border-orange-500/30" :
                            isRunning ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                            isStrength ? "bg-purple-500/15 text-purple-400 border border-purple-500/30" :
                            isCustom ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30" :
                            "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                          )}>
                            {isCycling ? <Bike size={14} /> :
                             isRunning ? <Activity size={14} /> :
                             isStrength ? <Dumbbell size={14} /> :
                             isCustom ? <Sparkles size={14} /> :
                             <CalendarDays size={14} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-zinc-100 truncate">{s.name || "Workout"}</p>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                              <span className="font-mono">{new Date(`${s.date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                              {isToday && (
                                <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">Heute</span>
                              )}
                              {s.sportType && <span className="capitalize text-zinc-500">· {s.sportType}</span>}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleUnscheduleWorkout(s.scheduledWorkoutId, s.name || "Workout")}
                          disabled={isUnscheduling}
                          title="Termin aus dem Garmin-Kalender entfernen"
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer shrink-0"
                        >
                          {isUnscheduling ? (
                            <Loader2 size={13} className="animate-spin text-rose-400" />
                          ) : (
                            <X size={14} />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Workout-Bibliothek */}
            <div className="space-y-2 pt-3 border-t border-zinc-800">
              <h3 className="text-xs font-bold text-zinc-200">Garmin Bibliothek ({filteredWorkoutsList.length})</h3>

              {isLoadingWorkouts ? (
                <div className="py-6 flex items-center justify-center gap-2 text-zinc-500 text-xs">
                  <Loader2 size={15} className="animate-spin text-cyan-400" />
                  <span>Lade Workouts…</span>
                </div>
              ) : filteredWorkoutsList.length === 0 ? (
                <div className="py-4 text-center text-zinc-500 text-xs bg-zinc-950/40 rounded-2xl border border-zinc-800/80">
                  Keine Bibliotheks-Workouts für diesen Filter gefunden.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {filteredWorkoutsList.map((w: any) => {
                    const wid = w.workoutId || w.id;
                    const isDeleting = deletingWorkoutId === wid;
                    const isScheduling = schedulingLibraryId === wid;
                    const sportKey = w.sportType?.sportTypeKey || w.sport || "workout";
                    const dateStr = w.updateDate ? new Date(w.updateDate).toLocaleDateString("de-DE") : "";

                    return (
                      <div
                        key={wid}
                        className="p-2.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold",
                            sportKey === "cycling" ? "bg-orange-500/10 text-orange-400" :
                            sportKey === "running" ? "bg-emerald-500/10 text-emerald-400" :
                            sportKey === "strength_training" ? "bg-purple-500/10 text-purple-400" :
                            "bg-cyan-500/10 text-cyan-400"
                          )}>
                            {sportKey === "cycling" ? <Bike size={13} /> :
                             sportKey === "running" ? <Activity size={13} /> :
                             sportKey === "strength_training" ? <Dumbbell size={13} /> :
                             <Sparkles size={13} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-zinc-100 truncate">{w.workoutName || "Workout"}</p>
                            <p className="text-[10px] text-zinc-500">{sportKey} {dateStr ? `• ${dateStr}` : ""}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              const targetDate = prompt(
                                `Für welches Datum soll "${w.workoutName}" geplant werden? (YYYY-MM-DD)`,
                                getLocalDateString()
                              );
                              if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
                                handleScheduleLibraryWorkout(w, targetDate);
                              }
                            }}
                            disabled={isScheduling}
                            title="Auf Datum planen"
                            className="px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Calendar size={11} />
                            <span>Planen</span>
                          </button>

                          <button
                            onClick={() => handleDeleteWorkout(wid, w.workoutName || "Workout")}
                            disabled={isDeleting}
                            title="Workout löschen"
                            className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Template Dispatcher Modal ────────────────────────────────────── */}
        {isTemplateDispatcherOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                    <Send size={15} />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-100 text-sm">Template an Garmin senden</h3>
                    <p className="text-zinc-400 text-[11px]">Wähle ein Template und das Zieldatum</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsTemplateDispatcherOpen(false);
                    setSelectedTemplate(null);
                  }}
                  className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded-lg"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Template Pickers */}
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                    🏋️ Krafttraining Templates
                  </span>
                  <div className="space-y-1">
                    {gymTemplates.map((gt) => (
                      <button
                        key={gt.id}
                        onClick={() => setSelectedTemplate({ id: gt.id, name: gt.name, type: "gym", data: gt })}
                        className={cn(
                          "w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer",
                          selectedTemplate?.id === gt.id
                            ? "bg-purple-500/15 border-purple-500/40 text-purple-200"
                            : "bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                        )}
                      >
                        <div>
                          <p className="font-bold text-xs">{gt.name}</p>
                          <p className="text-[10px] text-zinc-500">{gt.exercises?.length || 0} Übungen</p>
                        </div>
                        {selectedTemplate?.id === gt.id && <Check size={14} className="text-purple-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                    🏃 Ausdauer &amp; Intervalle
                  </span>
                  <div className="space-y-1">
                    {enduranceTemplates.map((et) => (
                      <button
                        key={et.id}
                        onClick={() => setSelectedTemplate({ id: et.id, name: et.name, type: "endurance", data: et })}
                        className={cn(
                          "w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer",
                          selectedTemplate?.id === et.id
                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                            : "bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                        )}
                      >
                        <div>
                          <p className="font-bold text-xs">{et.name}</p>
                          <p className="text-[10px] text-zinc-500">{et.estimatedDuration || "45 Min"} · {et.type}</p>
                        </div>
                        {selectedTemplate?.id === et.id && <Check size={14} className="text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Date selection */}
              <div>
                <label className="text-[10px] font-bold text-zinc-400 mb-1 block">Zieldatum</label>
                <input
                  type="date"
                  value={templateDate}
                  onChange={(e) => setTemplateDate(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <button
                  onClick={() => {
                    setIsTemplateDispatcherOpen(false);
                    setSelectedTemplate(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 text-zinc-400 font-bold text-xs hover:text-zinc-200"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleDispatchTemplate}
                  disabled={!selectedTemplate || isDispatchingTemplate}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-zinc-950 font-bold text-xs hover:from-cyan-400 hover:to-blue-400 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-cyan-500/20"
                >
                  {isDispatchingTemplate ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span>Sende...</span>
                    </>
                  ) : (
                    <>
                      <Send size={12} />
                      <span>An Garmin senden</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Workout Modal */}
      <GarminQuickWorkoutModal
        isOpen={isQuickWorkoutOpen}
        onClose={() => setIsQuickWorkoutOpen(false)}
        onSuccess={(workoutName, date) => {
          setWorkoutMsg(`✅ '${workoutName}' erfolgreich für ${date} im Garmin-Kalender geplant!`);
          void loadScheduledWorkouts();
          void loadGarminWorkouts();
        }}
      />

      <GarminActivityDetailModal
        isOpen={detailActivity !== null}
        onClose={() => setDetailActivity(null)}
        activity={detailActivity}
      />
    </div>
  );
}
