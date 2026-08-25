"use client";

import PerformanceAnalyticsCard from "@/components/analytics/PerformanceAnalyticsCard";
import VolumeCharts from "@/components/dashboard/VolumeCharts";
import StravaWeekStats from "@/components/strava/StravaWeekStats";
import AdherenceWidget from "@/components/dashboard/AdherenceWidget";

export default function CoachAnalyticsTab() {
  return (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full space-y-4 sm:space-y-6 pb-28 md:pb-8">
      <div>
        <h2 className="text-sm sm:text-base font-bold text-zinc-100">Leistungsdiagnostik & Langzeit-Trends</h2>
        <p className="text-[11px] sm:text-xs text-zinc-400">ACWR-Belastungsverhältnis, 8-Wochen-Volumenverlauf & Strava-Historie</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-2 gap-4 sm:gap-6">
        <PerformanceAnalyticsCard />
        <VolumeCharts />
        <StravaWeekStats />
        <AdherenceWidget />
      </div>
    </div>
  );
}
