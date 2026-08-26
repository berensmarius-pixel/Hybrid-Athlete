"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Plug,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Unplug,
  Zap,
  AlertTriangle,
} from "lucide-react";
import {
  fetchGoogleCalendars,
  useGoogleCalendar,
} from "@/hooks/useGoogleCalendar";
import {
  DEFAULT_SCHEDULING_SETTINGS,
  SCHEDULABLE_TYPES,
  type GoogleCalendarInfo,
  type PreferredWindow,
  type ScheduleProposal,
  type ScheduledGoogleWorkout,
  type SchedulableWorkoutType,
  type SkippedDay,
  type SchedulingSettings,
} from "@/lib/calendar/gcal/types";
import { addMinutesToTime } from "@/lib/calendar/gcal/timezone";

const TYPE_EMOJI: Record<SchedulableWorkoutType, string> = {
  gym: "🏋️",
  cycling: "🚴",
  running: "🏃",
  stretching: "🧘",
  warmup: "🔥",
  mobility: "🤸",
};

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
        {title}
      </span>
      {children}
    </div>
  );
}

function NumberSelect({
  value,
  onChange,
  options,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  options: number[];
  suffix: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <span className="text-[10px] text-zinc-500">{suffix}</span>
    </div>
  );
}

export default function AutoSchedulingTab({ isActive }: { isActive: boolean }) {
  const { status, connect, disconnect } = useGoogleCalendar();

  const [settings, setSettings] = useState<SchedulingSettings>(DEFAULT_SCHEDULING_SETTINGS);
  const [calendars, setCalendars] = useState<GoogleCalendarInfo[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);

  const [previewing, setPreviewing] = useState(false);
  const [proposals, setProposals] = useState<ScheduleProposal[] | null>(null);
  const [skipped, setSkipped] = useState<SkippedDay[]>([]);
  const [applying, setApplying] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [applyResultMsg, setApplyResultMsg] = useState<string | null>(null);

  const [scheduledItems, setScheduledItems] = useState<ScheduledGoogleWorkout[]>([]);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [moveStart, setMoveStart] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Laden ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive) return;
    fetch("/api/calendar/google/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success && d.settings) setSettings(d.settings);
      })
      .catch(() => {});
  }, [isActive]);

  useEffect(() => {
    if (!status.connected || !isActive) return;
    let cancelled = false;
    fetchGoogleCalendars().then((cals) => {
      if (!cancelled) setCalendars(cals);
    });
    fetch("/api/calendar/google/scheduled")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.success && Array.isArray(d.items)) setScheduledItems(d.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status.connected, isActive]);

  // ── Aktionen ─────────────────────────────────────────────────────────────

  async function persistSettings(patch: Partial<SchedulingSettings>) {
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    setSavingSettings(true);
    try {
      const res = await fetch("/api/calendar/google/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await res.json();
      if (d?.success && d.settings) setSettings(d.settings);
    } catch {
      // Optimistischer Stand bleibt
    } finally {
      setSavingSettings(false);
    }
  }

  function updateProposal(id: string, patch: { startTime?: string; durationMinutes?: number }) {
    setProposals((prev) =>
      prev
        ? prev.map((p) => {
            if (p.id !== id) return p;
            const startTime = patch.startTime ?? p.startTime;
            const durationMinutes = patch.durationMinutes ?? p.durationMinutes;
            return {
              ...p,
              startTime,
              durationMinutes,
              endTime: addMinutesToTime(startTime, durationMinutes),
            };
          })
        : prev
    );
  }

  async function runPreview() {
    setPreviewing(true);
    setApplyResultMsg(null);
    setActionError(null);
    try {
      const res = await fetch("/api/calendar/google/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview" }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        setActionError(d.error ?? "Vorschau fehlgeschlagen.");
        return;
      }
      setProposals(d.proposals ?? []);
      setSkipped(d.skipped ?? []);
    } catch {
      setActionError("Netzwerkfehler bei der Vorschau.");
    } finally {
      setPreviewing(false);
    }
  }

  async function applyPlan() {
    if (!proposals || proposals.length === 0) return;
    setApplying(true);
    setActionError(null);
    try {
      const res = await fetch("/api/calendar/google/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply", proposals, replaceExisting }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        setActionError(d.error ?? "Übernehmen fehlgeschlagen.");
        return;
      }
      const created = Array.isArray(d.created) ? d.created.length : 0;
      const failed = Array.isArray(d.failed) ? d.failed.length : 0;
      setApplyResultMsg(
        `✅ ${created} Workout${created === 1 ? "" : "s"} im Google Kalender erstellt.${failed ? ` ${failed} fehlgeschlagen.` : ""}`
      );
      setProposals(null);
      setSkipped([]);
      const refreshed = await fetch("/api/calendar/google/scheduled");
      const rd = await refreshed.json();
      if (rd?.success && Array.isArray(rd.items)) setScheduledItems(rd.items);
    } catch {
      setActionError("Netzwerkfehler beim Übernehmen.");
    } finally {
      setApplying(false);
    }
  }

  async function cancelItem(id: string) {
    try {
      const res = await fetch(`/api/calendar/google/scheduled?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setScheduledItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch {
      // still
    }
  }

  function beginMove(item: ScheduledGoogleWorkout) {
    setMovingId(item.id);
    setMoveDate(item.date);
    setMoveStart(item.startTime);
  }

  async function confirmMove() {
    if (!movingId) return;
    try {
      const res = await fetch("/api/calendar/google/scheduled", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: movingId,
          date: moveDate,
          startTime: moveStart,
        }),
      });
      const d = await res.json();
      if (d?.success && d.item) {
        setScheduledItems((prev) => prev.map((i) => (i.id === movingId ? d.item : i)));
      } else {
        setActionError(d.error ?? "Verschieben fehlgeschlagen.");
      }
    } catch {
      setActionError("Netzwerkfehler beim Verschieben.");
    } finally {
      setMovingId(null);
    }
  }

  function removePreferredWindow(id: string) {
    void persistSettings({
      preferredWindows: settings.preferredWindows.filter((w) => w.id !== id),
    });
  }

  function togglePreferredDay(w: PreferredWindow, day: number) {
    const days = w.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
    const next = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b);
    void persistSettings({
      preferredWindows: settings.preferredWindows.map((x) =>
        x.id === w.id
          ? { ...x, daysOfWeek: next.length === 7 ? undefined : next.length > 0 ? next : [day] }
          : x
      ),
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (!status.configured) {
    return (
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
        <div className="flex items-center gap-2 font-bold text-xs text-amber-300">
          <AlertTriangle size={16} />
          <span>Google OAuth nicht konfiguriert</span>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          Hinterlege <code className="font-mono text-amber-200">GOOGLE_CLIENT_ID</code> und{" "}
          <code className="font-mono text-amber-200">GOOGLE_CLIENT_SECRET</code> in deiner{" "}
          <code className="font-mono">.env.local</code> (siehe .env.local.example), um die
          Zweiwege-Synchronisation zu aktivieren.
        </p>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="space-y-4">
        <div className="p-5 rounded-2xl bg-blue-950/20 border border-blue-500/30 space-y-3">
          <div className="flex items-center gap-2 font-bold text-xs text-blue-300">
            <Sparkles size={16} />
            <span>Zweiwege-Synchronisation mit Google Kalender</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Liest deine echten Termine aus dem Google Kalender, findet freie Zeitfenster und plant
            deine Workouts regelbasiert ein – mit Puffer-Zeiten, bevorzugten Trainingsfenstern und
            Mindestabstand zwischen Sessions. Änderungen werden automatisch mit dem Kalender
            synchronisiert.
          </p>
          <ul className="text-[11px] text-zinc-400 space-y-1 list-disc list-inside">
            <li>Berechtigungen: Termine lesen & verwalten (calendar.events / calendar.readonly)</li>
            <li>Tokens bleiben ausschließlich auf deinem Server</li>
            <li>Ziel-Kalender frei wählbar (z.B. eigener Kalender „Hybrid Training“)</li>
          </ul>
          <button
            type="button"
            onClick={connect}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/20"
          >
            <Plug size={15} />
            <span>Mit Google Kalender verbinden</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status & Ziel-Kalender */}
      <SectionCard title="Verbindung">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-zinc-100 truncate">
                {status.email ?? "Google Konto verbunden"}
              </p>
              <p className="text-[11px] text-zinc-400">Zweiwege-Sync aktiv</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void disconnect()}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-rose-500/40 text-zinc-300 hover:text-rose-300 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Unplug size={13} />
            <span>Trennen</span>
          </button>
        </div>

        <div className="space-y-1.5 pt-1">
          <label className="text-[11px] font-bold text-zinc-300 block">Ziel-Kalender:</label>
          {calendars.length > 0 ? (
            <select
              value={settings.calendarId}
              onChange={(e) => void persistSettings({ calendarId: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:border-blue-400 focus:outline-none"
            >
              {!calendars.some((c) => c.id === settings.calendarId) && (
                <option value={settings.calendarId}>{settings.calendarId}</option>
              )}
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="primary"
              value={settings.calendarId}
              onChange={(e) => setSettings((s) => ({ ...s, calendarId: e.target.value }))}
              onBlur={(e) => void persistSettings({ calendarId: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
            />
          )}
        </div>
      </SectionCard>

      {/* Regel-Werkzeuge */}
      <SectionCard title={`Planungs-Regeln${savingSettings ? " • speichern…" : ""}`}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <span className="text-[10px] text-zinc-500 block mb-1">Horizont</span>
            <NumberSelect
              value={settings.planningDays}
              onChange={(v) => void persistSettings({ planningDays: v })}
              options={[7, 8, 9, 10, 11, 12, 13, 14]}
              suffix="Tage"
            />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 block mb-1">Puffer um Termine</span>
            <NumberSelect
              value={settings.bufferMinutes}
              onChange={(v) => void persistSettings({ bufferMinutes: v })}
              options={[0, 15, 30, 45, 60]}
              suffix="Min"
            />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 block mb-1">Mindestabstand (2 Sessions/Tag)</span>
            <NumberSelect
              value={settings.minGapHours}
              onChange={(v) => void persistSettings({ minGapHours: v })}
              options={[6, 7, 8, 10, 12]}
              suffix="h"
            />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 block mb-1">Trainingsfenster</span>
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={settings.dayStart}
                onChange={(e) => void persistSettings({ dayStart: e.target.value })}
                className="w-full px-2 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
              />
              <span className="text-[10px] text-zinc-500">bis</span>
              <input
                type="time"
                value={settings.dayEnd}
                onChange={(e) => void persistSettings({ dayEnd: e.target.value })}
                className="w-full px-2 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="pt-2 space-y-2">
          <span className="text-[10px] text-zinc-500 block">Dauer inkl. Warmup/Cooldown (Min)</span>
          <div className="grid grid-cols-3 gap-2">
            {SCHEDULABLE_TYPES.map((type) => (
              <div key={type} className="flex items-center gap-1">
                <span className="text-xs w-4">{TYPE_EMOJI[type]}</span>
                <input
                  type="number"
                  min={10}
                  max={480}
                  step={5}
                  value={settings.durationsMinutes[type]}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      durationsMinutes: {
                        ...s.durationsMinutes,
                        [type]: Math.max(10, Math.min(480, Number(e.target.value) || 10)),
                      },
                    }))
                  }
                  onBlur={() => void persistSettings({ durationsMinutes: settings.durationsMinutes })}
                  className="w-full px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Bevorzugte Fenster */}
      <SectionCard title="Bevorzugte Zeitfenster">
        <div className="space-y-2">
          {settings.preferredWindows.map((w) => (
            <div key={w.id} className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-100 truncate">{w.label}</p>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    {w.start}–{w.end}
                    {" • "}
                    {w.workoutTypes.map((t) => TYPE_EMOJI[t]).join("")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removePreferredWindow(w.id)}
                  className="p-1.5 rounded text-zinc-500 hover:text-rose-400 transition-colors shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, day) => {
                  const active = !w.daysOfWeek || w.daysOfWeek.length === 0 || w.daysOfWeek.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => togglePreferredDay(w, day)}
                      className={`flex-1 py-0.5 rounded-md text-[9px] font-bold transition-colors ${
                        active
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                          : "bg-zinc-900 text-zinc-600 border border-zinc-800"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {settings.preferredWindows.length === 0 && (
            <p className="text-[11px] text-zinc-500">
              Keine Fenster definiert – Workouts landen im frühestmöglichen freien Slot.
            </p>
          )}
        </div>
      </SectionCard>

      {/* Vorschau & Anwenden */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
            Intelligente Planung
          </span>
          <div className="flex items-center gap-2">
            {savingSettings && <Loader2 size={12} className="animate-spin text-zinc-500" />}
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={previewing}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20"
            >
              {previewing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              <span>{previewing ? "Analysiere…" : "Vorschau berechnen"}</span>
            </button>
          </div>
        </div>

        {applyResultMsg && (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{applyResultMsg}</span>
          </div>
        )}
        {actionError && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{actionError}</span>
          </div>
        )}

        {proposals !== null && proposals.length > 0 && (
          <div className="space-y-2 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="accent-blue-500"
                />
                Bestehende Auto-Einträge im Horizont ersetzen
              </label>
              <button
                type="button"
                onClick={() => void applyPlan()}
                disabled={applying}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                {applying ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                <span>{proposals.length} Events erstellen</span>
              </button>
            </div>

            {proposals.map((p) => (
              <div key={p.id} className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 transition-all space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-100 truncate">{p.title}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{p.reason}</p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      p.score >= 80
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        : p.score > 0
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                    }`}
                  >
                    {p.score >= 80 ? "Optimal" : p.score > 0 ? `Score ${p.score}` : "Standard"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase">{p.date}</span>
                  <input
                    type="time"
                    value={p.startTime}
                    onChange={(e) => updateProposal(p.id, { startTime: e.target.value })}
                    className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-zinc-500">für</span>
                  <input
                    type="number"
                    min={10}
                    max={480}
                    step={5}
                    value={p.durationMinutes}
                    onChange={(e) =>
                      updateProposal(p.id, {
                        durationMinutes: Math.max(10, Math.min(480, Number(e.target.value) || 10)),
                      })
                    }
                    className="w-16 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-zinc-500">
                    Min → Ende {p.endTime} · {TYPE_EMOJI[p.workoutType]} {p.workoutType}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {proposals !== null && proposals.length === 0 && skipped.length === 0 && (
          <p className="text-xs text-zinc-500 text-center py-3">
            Keine Trainingstage im gewählten Horizont gefunden.
          </p>
        )}

        {skipped.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 block">
              Nicht platzierbar ({skipped.length})
            </span>
            {skipped.map((s) => (
              <p key={s.date} className="text-[11px] text-zinc-400 leading-relaxed">
                <strong className="text-zinc-200">{s.date}</strong> · {s.title}: {s.reason}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Verwaltete Einträge */}
      <div className="space-y-2 pt-1">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
          Im Google Kalender verwaltet ({scheduledItems.length})
        </span>
        {scheduledItems.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-3">
            Noch keine automatisch geplanten Workouts.
          </p>
        ) : (
          scheduledItems.map((item) => (
            <div key={item.id} className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-100 truncate">{item.title}</p>
                  <p className="text-[10px] font-mono text-zinc-400">
                    {item.date} · {item.startTime}–{item.endTime}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {item.htmlLink && (
                    <a
                      href={item.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                      title="In Google Kalender öffnen"
                      className="p-2 -m-1 rounded text-zinc-500 hover:text-blue-400 transition-colors"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <button
                    type="button"
                    title="Verschieben"
                    onClick={() => (movingId === item.id ? setMovingId(null) : beginMove(item))}
                    className={`p-2 -m-1 rounded transition-colors ${
                      movingId === item.id ? "text-blue-400" : "text-zinc-500 hover:text-blue-400"
                    }`}
                  >
                    {movingId === item.id ? <RefreshCw size={13} /> : <Copy size={13} />}
                  </button>
                  <button
                    type="button"
                    title="Absagen & Event löschen"
                    onClick={() => void cancelItem(item.id)}
                    className="p-2 -m-1 rounded text-zinc-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {movingId === item.id && (
                <div className="flex flex-wrap items-center gap-2 pt-1 animate-in zoom-in-95 duration-150">
                  <input
                    type="date"
                    value={moveDate}
                    onChange={(e) => setMoveDate(e.target.value)}
                    className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
                  />
                  <input
                    type="time"
                    value={moveStart}
                    onChange={(e) => setMoveStart(e.target.value)}
                    className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void confirmMove()}
                    className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1"
                  >
                    <Zap size={11} />
                    Verschieben (Sync)
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
