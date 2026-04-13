"use client";

import { Footprints, Bike, Clock } from "lucide-react";
import { useStrava } from "@/context/StravaContext";
import { getWeekStats } from "@/lib/stravaUtils";

export default function StravaWeekStats() {
  const { activities, connection } = useStrava();

  if (!connection.isConnected || activities.length === 0) return null;

  const stats = getWeekStats(activities);
  if (stats.runCount === 0 && stats.rideCount === 0) return null;

  return (
    <div className="px-4">
      <div className="flex items-center gap-2 mb-2.5">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-orange-500 fill-current" aria-hidden="true">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Diese Woche</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Running */}
        <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-zinc-900 border border-zinc-800/60">
          <Footprints size={15} className="text-green-400" />
          <span className="text-base font-bold text-zinc-100 leading-none">
            {stats.runKm > 0 ? `${stats.runKm.toFixed(1)}` : "–"}
          </span>
          <span className="text-[10px] text-zinc-500">km Laufen</span>
        </div>

        {/* Cycling */}
        <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-zinc-900 border border-zinc-800/60">
          <Bike size={15} className="text-orange-400" />
          <span className="text-base font-bold text-zinc-100 leading-none">
            {stats.rideKm > 0 ? `${stats.rideKm.toFixed(1)}` : "–"}
          </span>
          <span className="text-[10px] text-zinc-500">km Rad</span>
        </div>

        {/* Total hours */}
        <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-zinc-900 border border-zinc-800/60">
          <Clock size={15} className="text-blue-400" />
          <span className="text-base font-bold text-zinc-100 leading-none">
            {stats.totalHours > 0 ? `${stats.totalHours}` : "–"}
          </span>
          <span className="text-[10px] text-zinc-500">Std. gesamt</span>
        </div>
      </div>
    </div>
  );
}
