"use client";

import { Bike, Footprints, Heart, Clock, MapPin, TrendingUp } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { StravaActivity } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}

/** Converts m/s  pace in min:ss/km format (for running) */
function speedToPace(ms: number): string {
  if (ms <= 0) return "–";
  const secsPerKm = 1000 / ms;
  const min = Math.floor(secsPerKm / 60);
  const sec = Math.round(secsPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
}

/** Converts m/s → km/h (for cycling) */
function speedToKmh(ms: number): string {
  return `${(ms * 3.6).toFixed(1)} km/h`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface StravaActivityCardProps {
  activity: StravaActivity;
}

export default function StravaActivityCard({ activity }: StravaActivityCardProps) {
  const isRun = activity.sport_type === "Run" || activity.type === "Run";
  const Icon = isRun ? Footprints : Bike;

  const accentColor = isRun
    ? { bg: "bg-green-500", bgLight: "bg-green-500/10", text: "text-green-400", border: "border-green-500/20" }
    : { bg: "bg-orange-500", bgLight: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" };

  const speedLabel = isRun
    ? speedToPace(activity.average_speed)
    : speedToKmh(activity.average_speed);

  const speedCaption = isRun ? "Pace" : "Ø Tempo";

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden border bg-zinc-900",
        accentColor.border
      )}
    >
      {/* Top accent bar */}
      <div className={cn("h-0.5 w-full", accentColor.bg)} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              {/* Strava flame */}
              <svg viewBox="0 0 24 24" className="w-3 h-3 text-orange-500 fill-current shrink-0" aria-hidden="true">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Strava</span>
            </div>
            <h3 className="text-sm font-semibold text-zinc-100 truncate">{activity.name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{formatDate(activity.start_date_local)}</p>
          </div>

          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", accentColor.bgLight)}>
            <Icon size={18} className={accentColor.text} strokeWidth={1.8} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Distance */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-800/50">
            <MapPin size={13} className="text-zinc-500 shrink-0" />
            <div>
              <p className="text-xs text-zinc-500">Distanz</p>
              <p className="text-sm font-semibold text-zinc-100">{formatDistance(activity.distance)}</p>
            </div>
          </div>

          {/* Duration */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-800/50">
            <Clock size={13} className="text-zinc-500 shrink-0" />
            <div>
              <p className="text-xs text-zinc-500">Dauer</p>
              <p className="text-sm font-semibold text-zinc-100">{formatDuration(activity.moving_time)}</p>
            </div>
          </div>

          {/* Speed / Pace */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-800/50">
            <TrendingUp size={13} className="text-zinc-500 shrink-0" />
            <div>
              <p className="text-xs text-zinc-500">{speedCaption}</p>
              <p className="text-sm font-semibold text-zinc-100">{speedLabel}</p>
            </div>
          </div>

          {/* Heart rate */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-800/50">
            <Heart size={13} className={cn("shrink-0", activity.average_heartrate ? "text-red-400" : "text-zinc-600")} />
            <div>
              <p className="text-xs text-zinc-500">Ø HF</p>
              <p className="text-sm font-semibold text-zinc-100">
                {activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "–"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
