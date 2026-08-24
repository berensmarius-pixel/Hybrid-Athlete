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
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { parseGarminFile } from "@/lib/garmin/fitParser";
import {
  syncRealGarminData,
  loginToGarminConnect,
  checkGarminConnectionStatus,
  getDefaultGarminHealth,
} from "@/lib/garmin/garminService";
import type { GarminDailyHealth, HrvStatus } from "@/types";
import { cn } from "@/lib/utils";

interface GarminHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GarminHubModal({ isOpen, onClose }: GarminHubModalProps) {
  const {
    garminHealthLogs,
    updateGarminHealth,
    garminActivities,
    addGarminActivity,
  } = useApp();

  const todayStr = new Date().toISOString().split("T")[0];
  const currentHealth: GarminDailyHealth =
    garminHealthLogs[todayStr] || getDefaultGarminHealth(todayStr);

  const [activeTab, setActiveTab] = useState<"connect" | "upload" | "metrics">("connect");
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [requiresMfa, setRequiresMfa] = useState(false);

  // Manual metrics edit state
  const [readiness, setReadiness] = useState<number>(currentHealth.trainingReadiness);
  const [battery, setBattery] = useState<number>(currentHealth.bodyBattery);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col max-h-[92vh] shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Zap size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Garmin Connect Integration
                {isConnected && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Verbunden
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Automatische Synchronisation von Vital- & Trainingsdaten
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/40 px-3">
          <button
            onClick={() => setActiveTab("connect")}
            className={cn(
              "flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors",
              activeTab === "connect"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            <ShieldCheck size={14} />
            Garmin Connect Sync
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            className={cn(
              "flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors",
              activeTab === "upload"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Upload size={14} />
            FIT-Upload
          </button>
          <button
            onClick={() => setActiveTab("metrics")}
            className={cn(
              "flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors",
              activeTab === "metrics"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Sliders size={14} />
            Manuell
          </button>
        </div>

        {/* Tab 1: Garmin Connect Cloud Sync */}
        {activeTab === "connect" && (
          <div className="p-4 overflow-y-auto space-y-4 flex-1">
            {/* Status alerts */}
            {syncStatus && (
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-xs font-medium flex items-center gap-2">
                <Check size={15} className="shrink-0" />
                <span>{syncStatus}</span>
              </div>
            )}
            {syncError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-medium flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{syncError}</span>
              </div>
            )}

            {/* If already connected: big Sync button */}
            {isConnected ? (
              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <ShieldCheck size={16} />
                    <span>Garmin Session aktiv</span>
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    Letzter Sync: {currentHealth.lastSyncedAt ? new Date(currentHealth.lastSyncedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "Heute"}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Ruft deine aktuellen Werte (Readiness, Body Battery, HRV, Schlaf, Ruhepuls & Aktivitäten) direkt von Garmin Connect ab.
                </p>
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 disabled:opacity-60 text-zinc-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
                  <span>{isSyncing ? "Synchronisiere mit Garmin..." : "Jetzt Garmin Daten synchronisieren"}</span>
                </button>
              </div>
            ) : (
              /* Login Form */
              <form onSubmit={handleLogin} className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                  <Lock size={15} className="text-cyan-400" />
                  <span>Garmin Connect Zugangsdaten</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Melde dich einmalig an. Die Sitzungstokens werden lokal auf deinem Computer gespeichert (wie in <em>garmin-grafana</em>).
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                      Garmin E-Mail Adresse
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="deine.email@garmin.de"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs placeholder:text-zinc-600 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                      Garmin Passwort
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs placeholder:text-zinc-600 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  {requiresMfa && (
                    <div className="pt-1">
                      <label className="block text-[11px] font-semibold text-amber-300 mb-1 flex items-center gap-1">
                        <KeyRound size={12} />
                        Zwei-Faktor / MFA Code (aus E-Mail oder SMS)
                      </label>
                      <input
                        type="text"
                        placeholder="123456"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-amber-500/50 text-amber-200 text-xs font-mono tracking-widest text-center"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 disabled:opacity-60 text-zinc-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <LogIn size={15} className={isLoggingIn ? "animate-spin" : ""} />
                  <span>{isLoggingIn ? "Verbinde mit Garmin..." : requiresMfa ? "MFA Code bestätigen" : "Mit Garmin verbinden & synchronisieren"}</span>
                </button>
              </form>
            )}

            {/* Connected devices overview */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
                Unterstützte Garmin Geräte
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                    <Watch size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200">Forerunner 265</h4>
                    <p className="text-[10px] text-zinc-500">Readiness & HRV</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
                    <Bike size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200">Edge 840</h4>
                    <p className="text-[10px] text-zinc-500">Power & Training Load</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: FIT / GPX File Upload */}
        {activeTab === "upload" && (
          <div className="p-4 overflow-y-auto space-y-4 flex-1">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-8 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-cyan-400/50 bg-zinc-950/60 hover:bg-zinc-900/60 transition-all cursor-pointer flex flex-col items-center justify-center gap-2.5 text-center group"
            >
              <div className="p-3 rounded-full bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
                <Upload size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-200">
                  .FIT oder .GPX Datei hier ablegen
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Direkter Upload von Edge 840 / Forerunner 265 Aktivitäten
                </p>
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

            {/* Imported list */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
                Aktivitäten ({garminActivities.length})
              </h4>
              {garminActivities.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {garminActivities.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-zinc-200">{act.name}</p>
                        <p className="text-zinc-500 text-[11px]">
                          {act.device} • {(act.distanceMeters / 1000).toFixed(1)} km •{" "}
                          {Math.round(act.durationSeconds / 60)} Min
                        </p>
                      </div>
                      <span className="font-bold text-emerald-400">
                        {act.caloriesBurned} kcal
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 p-3 rounded-xl bg-zinc-950/40 text-center">
                  Noch keine Aktivitäten vorhanden.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Metrics Adjuster */}
        {activeTab === "metrics" && (
          <form onSubmit={handleSaveManualMetrics} className="p-4 overflow-y-auto space-y-3.5 flex-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <label className="block text-xs font-semibold text-zinc-300 flex justify-between">
                  <span>Training Readiness</span>
                  <span className="text-cyan-400 font-bold">{readiness}/100</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={readiness}
                  onChange={(e) => setReadiness(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <label className="block text-xs font-semibold text-zinc-300 flex justify-between">
                  <span>Body Battery</span>
                  <span className="text-blue-400 font-bold">{battery}/100</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={battery}
                  onChange={(e) => setBattery(Number(e.target.value))}
                  className="w-full accent-blue-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-300">
                  HRV Status
                </label>
                <select
                  value={hrv}
                  onChange={(e) => setHrv(e.target.value as HrvStatus)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs"
                >
                  <option value="balanced">Ausgeglichen (Optimal)</option>
                  <option value="unbalanced">Unbalanciert (Erhöht)</option>
                  <option value="low">Niedrig (Belastet)</option>
                  <option value="poor">Schlecht (Regeneration)</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <label className="block text-xs font-semibold text-zinc-300 flex justify-between">
                  <span>Schlaf Score</span>
                  <span className="text-violet-400 font-bold">{sleepScore}/100</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sleepScore}
                  onChange={(e) => setSleepScore(Number(e.target.value))}
                  className="w-full accent-violet-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <label className="block text-xs font-semibold text-zinc-300 flex justify-between">
                  <span>Aktiv-Kalorien</span>
                  <span className="text-emerald-400 font-bold">{activeCalories} kcal</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  step="50"
                  value={activeCalories}
                  onChange={(e) => setActiveCalories(Number(e.target.value))}
                  className="w-full px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-bold"
                />
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <label className="block text-xs font-semibold text-zinc-300 flex justify-between">
                  <span>Ruhepuls (RHR)</span>
                  <span className="text-rose-400 font-bold">{restingHr} bpm</span>
                </label>
                <input
                  type="number"
                  min="30"
                  max="100"
                  value={restingHr}
                  onChange={(e) => setRestingHr(Number(e.target.value))}
                  className="w-full px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-bold"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 mt-2"
            >
              <Check size={16} />
              Manuelle Werte übernehmen
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
