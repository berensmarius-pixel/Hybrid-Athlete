"use client";

import { useState, useEffect } from "react";
import {
  X,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Check,
  Zap,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  CalendarEvent,
  getStoredCalendarEvents,
  saveCalendarEvents,
  getSavedIcalUrl,
  saveIcalUrl,
  parseIcsContent,
} from "@/lib/calendar/googleCalendarService";
import {
  detectTrainingConflicts,
  FreeTimeSlot,
  TrainingCalendarConflict,
} from "@/lib/calendar/conflictDetector";
import { getLocalDateString } from "@/lib/utils";

interface GoogleCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GoogleCalendarModal({ isOpen, onClose }: GoogleCalendarModalProps) {
  const { weeklyPlan } = useApp();

  const [activeTab, setActiveTab] = useState<"schedule" | "feed" | "import">("schedule");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [preferredWorkoutTime, setPreferredWorkoutTime] = useState<string>("17:00");
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [icalInputUrl, setIcalInputUrl] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // New Event Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventStart, setNewEventStart] = useState("14:00");
  const [newEventEnd, setNewEventEnd] = useState("15:30");
  const [rescheduleSuccessMsg, setRescheduleSuccessMsg] = useState<string | null>(null);
  const [feedToken, setFeedToken] = useState<string | null>(null);
  const [rotatingFeed, setRotatingFeed] = useState(false);

  const todayStr = getLocalDateString();
  const dayIndex = (new Date().getDay() + 6) % 7;
  const todayPlan = weeklyPlan.find((p) => p.dayIndex === dayIndex);

  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        setEvents(getStoredCalendarEvents());
        setIcalInputUrl(getSavedIcalUrl());
      });

      // Feed-Token laden (nur relevant, wenn API-Schutz aktiv ist)
      fetch("/api/calendar/feed-token")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.success && d.protected && typeof d.token === "string") {
            setFeedToken(d.token);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  async function handleRotateFeedToken() {
    setRotatingFeed(true);
    try {
      const r = await fetch("/api/calendar/feed-token", { method: "POST" });
      const d = await r.json();
      if (d?.success && typeof d.token === "string") {
        setFeedToken(d.token);
      }
    } catch {
      // Fehler still ignorieren – alter Token bleibt im UI
    } finally {
      setRotatingFeed(false);
    }
  }

  if (!isOpen) return null;

  const conflictInfo = detectTrainingConflicts(
    events,
    todayPlan,
    todayStr,
    preferredWorkoutTime,
    60
  );

  const feedUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/calendar/feed.ics${feedToken ? `?token=${feedToken}` : ""}`
      : "http://localhost:3000/api/calendar/feed.ics";

  function handleCopyFeed() {
    navigator.clipboard.writeText(feedUrl);
    setCopiedFeed(true);
    setTimeout(() => setCopiedFeed(false), 2000);
  }

  function handleApplyReschedule(slot: FreeTimeSlot) {
    setPreferredWorkoutTime(slot.startTime);
    setRescheduleSuccessMsg(`✅ Workout erfolgreich auf ${slot.startTime} Uhr verschoben!`);
    setTimeout(() => setRescheduleSuccessMsg(null), 3000);
  }

  function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    const newEv: CalendarEvent = {
      id: `ev_${crypto.randomUUID()}`,
      title: newEventTitle.trim(),
      date: todayStr,
      startTime: newEventStart,
      endTime: newEventEnd,
      category: "work",
      source: "local",
    };

    const updated = [...events, newEv];
    setEvents(updated);
    saveCalendarEvents(updated);

    setNewEventTitle("");
    setShowAddForm(false);
  }

  function handleDeleteEvent(id: string) {
    const updated = events.filter((e) => e.id !== id);
    setEvents(updated);
    saveCalendarEvents(updated);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-blue-950/20 to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/30">
              <Calendar size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>Google Kalender & Termine</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Smart Scheduling
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Termin-Kollisionen vermeiden & freie Trainingsfenster nutzen
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 px-4 pt-2 gap-2 shrink-0 bg-zinc-950/60">
          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === "schedule"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Clock size={14} />
            <span>Tages-Abgleich & Freie Slots</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("feed")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === "feed"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Copy size={14} />
            <span>Google Kalender Sync (iCal Feed)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("import")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === "import"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ExternalLink size={14} />
            <span>Termine importieren</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {rescheduleSuccessMsg && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{rescheduleSuccessMsg}</span>
            </div>
          )}

          {/* ── Tab 1: Schedule & Conflict Resolution ──────────────────────── */}
          {activeTab === "schedule" && (
            <div className="space-y-4">
              {/* Conflict or Free Status Alert */}
              {conflictInfo.hasConflict ? (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <AlertTriangle size={16} className="text-rose-400" />
                    <span>Termin-Kollision erkannt!</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Dein geplantes Workout ({preferredWorkoutTime} Uhr) kollidiert mit{" "}
                    <strong className="text-rose-300">
                      „{conflictInfo.conflictingEvent?.title}“
                    </strong>{" "}
                    ({conflictInfo.conflictingEvent?.startTime}–{conflictInfo.conflictingEvent?.endTime} Uhr).
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 size={18} className="text-emerald-400" />
                    <div>
                      <h4 className="text-xs font-bold">Keine Terminkonflikte</h4>
                      <p className="text-[11px] text-zinc-400">
                        Dein Zeitfenster ({preferredWorkoutTime} Uhr) ist frei für Training!
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Optimal
                  </span>
                </div>
              )}

              {/* Free Slot Suggestions */}
              {conflictInfo.suggestedFreeSlots.length > 0 && (
                <div className="space-y-2.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                    Gefundene freie Trainingsfenster für heute:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {conflictInfo.suggestedFreeSlots.map((slot, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 transition-all flex flex-col justify-between space-y-2"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-100 font-mono">
                              {slot.startTime} – {slot.endTime} Uhr
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              {slot.durationMinutes} Min frei
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-1">{slot.recommendationNote}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleApplyReschedule(slot)}
                          className="w-full py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                        >
                          <Zap size={13} />
                          <span>Auf {slot.startTime} Uhr legen</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Today's Appointments List */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                    Heutige Termine ({events.filter((e) => e.date === todayStr).length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300"
                  >
                    <Plus size={13} />
                    <span>Termin eintragen</span>
                  </button>
                </div>

                {/* Add Event Inline Form */}
                {showAddForm && (
                  <form onSubmit={handleAddEvent} className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3 animate-in zoom-in-95 duration-150">
                    <input
                      type="text"
                      placeholder="Termin-Titel (z.B. Klausur, Call, Arbeit)"
                      value={newEventTitle}
                      onChange={(e) => setNewEventTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:border-blue-400 focus:outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Startzeit</label>
                        <input
                          type="time"
                          value={newEventStart}
                          onChange={(e) => setNewEventStart(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Endzeit</label>
                        <input
                          type="time"
                          value={newEventEnd}
                          onChange={(e) => setNewEventEnd(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-blue-400 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddForm(false)}
                        className="px-3 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                      >
                        Speichern
                      </button>
                    </div>
                  </form>
                )}

                {/* Events list */}
                <div className="space-y-1.5">
                  {events.filter((e) => e.date === todayStr).length > 0 ? (
                    events
                      .filter((e) => e.date === todayStr)
                      .map((ev) => (
                        <div
                          key={ev.id}
                          className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800/80 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-blue-400" />
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-zinc-100 truncate">{ev.title}</h4>
                              <span className="text-[11px] font-mono text-zinc-400">
                                {ev.startTime} – {ev.endTime} Uhr {ev.location ? `• ${ev.location}` : ""}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteEvent(ev.id)}
                            className="p-2 -m-1 rounded text-zinc-500 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))
                  ) : (
                    <p className="text-xs text-zinc-500 text-center py-4">
                      Keine Termine für heute hinterlegt.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 2: iCal Live Feed Subscription ──────────────────────────── */}
          {activeTab === "feed" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-950/20 border border-blue-500/30 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs text-blue-300">
                  <Sparkles size={16} />
                  <span>Automatische 2-Wege Synchronisation in deinen Google Kalender</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Abonniere deinen persönlichen Trainingsfeed. Alle geplanten Workouts, Schwellen-Intervalle und Gym-Sessions erscheinen automatisch in deinem Google Kalender auf dem Smartphone und PC.
                </p>
              </div>

              {/* Feed URL Box */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 block">
                  Deine persönliche iCalendar (.ics) Feed-URL:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={feedUrl}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-cyan-400 select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyFeed}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20"
                  >
                    {copiedFeed ? <Check size={15} /> : <Copy size={15} />}
                    <span>{copiedFeed ? "Kopiert!" : "Kopieren"}</span>
                  </button>
                </div>
              </div>

              {/* Feed-Token rotieren */}
              {feedToken && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <p className="text-[11px] text-zinc-400 leading-relaxed pr-3">
                    Das Feed-Token ist unabhängig von deinem Passwort. Bei Verlust der URL einfach
                    rotieren – alte Abo-Links werden dann ungültig und müssen neu eingetragen werden.
                  </p>
                  <button
                    type="button"
                    onClick={handleRotateFeedToken}
                    disabled={rotatingFeed}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-rose-500/40 text-zinc-300 hover:text-rose-300 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <RefreshCw size={13} className={rotatingFeed ? "animate-spin" : ""} />
                    <span>{rotatingFeed ? "Rotiere…" : "Token rotieren"}</span>
                  </button>
                </div>
              )}

              {/* Instructions */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2 text-xs text-zinc-400">
                <span className="font-bold text-zinc-200 block">So fügst du es in Google Calendar ein:</span>
                <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                  <li>Öffne <strong>Google Calendar</strong> im Browser auf deinem PC.</li>
                  <li>Klicke links neben <em>„Weitere Kalender“</em> auf das <strong>+</strong> Symbol.</li>
                  <li>Wähle <strong>„Per URL“</strong> aus.</li>
                  <li>Füge die oben kopierte Feed-URL ein und klicke auf <strong>„Kalender hinzufügen“</strong>. Fertig!</li>
                </ol>
              </div>
            </div>
          )}

          {/* ── Tab 3: Import Google Calendar Private ICS ───────────────────── */}
          {activeTab === "import" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                <h4 className="text-xs font-bold text-zinc-100">Private Google Kalender-URL verknüpfen</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Um deine realen Google-Termine direkt in Hybrid Athlete zu laden und automatisch mit deinem Trainingsplan abzugleichen, kannst du deine private Kalender-Adresse im iCal-Format hinterlegen.
                </p>
                <div className="text-[11px] text-zinc-500 pt-1">
                  Google Kalender ➔ Kalendereinstellungen ➔ <em>„Privatadresse im iCal-Format“</em>.
                </div>
              </div>

              <div className="space-y-1.5">
                <input
                  type="text"
                  placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                  value={icalInputUrl}
                  onChange={(e) => setIcalInputUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-blue-400 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  saveIcalUrl(icalInputUrl);
                  setImportStatus("✅ Google Kalender-Verknüpfung gespeichert!");
                  setTimeout(() => setImportStatus(null), 3000);
                }}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
              >
                Verknüpfung speichern
              </button>

              {importStatus && (
                <p className="text-xs text-emerald-400 font-semibold">{importStatus}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
