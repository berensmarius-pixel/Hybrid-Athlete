"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudLightning,
  Snowflake,
  Wind,
  Droplet,
  ChevronRight,
  Sparkles,
  Bike,
  Footprints,
} from "lucide-react";
import {
  WeatherData,
  fetchLiveWeather,
  getSavedLocation,
} from "@/lib/weather/openMeteoService";

const WeatherModal = dynamic(() => import("./WeatherModal"), { ssr: false });

function WeatherIconMini({
  icon,
  className = "w-5 h-5",
}: {
  icon: "sun" | "cloud-sun" | "cloud" | "rain" | "storm" | "snow";
  className?: string;
}) {
  switch (icon) {
    case "sun":
      return <Sun className={`${className} text-amber-400`} />;
    case "cloud-sun":
      return <CloudSun className={`${className} text-amber-300`} />;
    case "cloud":
      return <Cloud className={`${className} text-zinc-400`} />;
    case "rain":
      return <CloudRain className={`${className} text-cyan-400`} />;
    case "storm":
      return <CloudLightning className={`${className} text-purple-400`} />;
    case "snow":
      return <Snowflake className={`${className} text-blue-300`} />;
    default:
      return <CloudSun className={`${className} text-amber-300`} />;
  }
}

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const loc = getSavedLocation();
        const data = await fetchLiveWeather(loc.latitude, loc.longitude, loc.city);
        setWeather(data);
      } catch {}
    }
    load();
  }, []);

  if (!weather) {
    return (
      <div className="p-4 rounded-3xl bg-zinc-900/60 border border-zinc-800 animate-pulse flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-2xl bg-zinc-800" />
          <div className="space-y-1">
            <div className="w-24 h-3 bg-zinc-800 rounded" />
            <div className="w-16 h-2 bg-zinc-800 rounded" />
          </div>
        </div>
        <div className="w-12 h-6 bg-zinc-800 rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className="p-4 sm:p-5 rounded-3xl bg-linear-to-r from-cyan-950/20 via-zinc-900 to-zinc-900 border border-zinc-800 hover:border-cyan-500/40 transition-all cursor-pointer group shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 group-hover:scale-105 transition-transform">
              <WeatherIconMini icon={weather.current.weatherIcon} className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100 group-hover:text-cyan-300 transition-colors">
                  Outdoor Wetter • {weather.city}
                </h3>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Live
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {weather.current.weatherDescription} • Wind {weather.current.windSpeedKmH} km/h
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xl font-black font-mono text-cyan-400">
              {weather.current.temperature}°C
            </span>
            <ChevronRight size={15} className="text-zinc-500 group-hover:text-cyan-300 transition-colors" />
          </div>
        </div>

        {/* Outdoor Window Mini Badge */}
        <div className="p-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <Bike size={14} className="text-orange-400" />
            <span className="text-[11px]">Bestes Zeitfenster heute:</span>
            <span className="font-mono font-bold text-orange-300 text-[11px]">
              {weather.bestCyclingWindow.start}–{weather.bestCyclingWindow.end} Uhr
            </span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-mono text-amber-400">
            <span>Tageslicht:</span>
            <span className="font-bold">{weather.current.daylightRemainingHours}h</span>
          </div>
        </div>
      </div>

      {modalOpen && (
        <WeatherModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
