"use client";

import { useState, useEffect } from "react";
import {
  X,
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudLightning,
  Snowflake,
  Wind,
  Droplet,
  Compass,
  Clock,
  MapPin,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Bike,
  Footprints,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  WeatherData,
  HourlyWeatherPoint,
  fetchLiveWeather,
  getSavedLocation,
  saveLocation,
} from "@/lib/weather/openMeteoService";
import { searchCities, LocationSearchResult, reverseGeocode } from "@/lib/location/geocodingService";

interface WeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWeatherTemp?: (temp: number) => void;
}

function WeatherIconRenderer({
  icon,
  className = "w-6 h-6",
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

export default function WeatherModal({ isOpen, onClose }: WeatherModalProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadWeather();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function loadWeather(lat?: number, lon?: number, city?: string) {
    setLoading(true);
    try {
      const loc = lat && lon && city ? { latitude: lat, longitude: lon, city } : getSavedLocation();
      const data = await fetchLiveWeather(loc.latitude, loc.longitude, loc.city);
      setWeather(data);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchingLocation(true);
    const results = await searchCities(searchQuery);
    setSearchResults(results);
    setSearchingLocation(false);
  }

  function handleSelectCity(item: LocationSearchResult) {
    const loc = { city: item.name, latitude: item.latitude, longitude: item.longitude };
    saveLocation(loc);
    setSearchResults([]);
    setSearchQuery("");
    loadWeather(loc.latitude, loc.longitude, loc.city);
  }

  function handleGpsLocate() {
    if (!navigator.geolocation) return;
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const city = await reverseGeocode(lat, lon);
        const loc = { city, latitude: lat, longitude: lon };
        saveLocation(loc);
        await loadWeather(lat, lon, city);
        setLocatingGps(false);
      },
      () => {
        setLocatingGps(false);
      }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-cyan-950/20 to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Sun size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>Outdoor Wetter & Strecken-Planer</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Open-Meteo Live
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Stündliche Prognosen, Windstärke, UV-Index & beste Trainingsfenster
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Location Search Bar */}
          <div className="space-y-2">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Ort oder Stadt suchen (z.B. Kaiserslautern, Berlin, München)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:border-cyan-400 focus:outline-none"
                />
                <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold transition-all"
              >
                Suchen
              </button>
              <button
                type="button"
                onClick={handleGpsLocate}
                disabled={locatingGps}
                className="p-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition-all flex items-center gap-1"
                title="GPS Standort automatisch erfassen"
              >
                <MapPin size={15} className={locatingGps ? "animate-bounce text-cyan-400" : ""} />
              </button>
            </form>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="p-2 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                {searchResults.map((res, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectCity(res)}
                    className="w-full text-left p-2 rounded-xl hover:bg-zinc-800 text-xs text-zinc-300 transition-colors flex items-center justify-between"
                  >
                    <span className="font-bold text-zinc-100">{res.name}</span>
                    <span className="text-[10px] text-zinc-500 truncate max-w-xs">{res.displayName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {weather && (
            <div className="space-y-4">
              {/* Current Overview Banner */}
              <div className="p-4 sm:p-5 rounded-3xl bg-linear-to-r from-cyan-950/20 via-zinc-900 to-zinc-900 border border-cyan-500/30 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800">
                      <WeatherIconRenderer icon={weather.current.weatherIcon} className="w-8 h-8" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-zinc-100">{weather.city}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300">
                          {weather.current.temperature}°C
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {weather.current.weatherDescription} • Gefühlt {weather.current.feelsLike}°C
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Tageslicht</span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      noch {weather.current.daylightRemainingHours}h (bis {weather.current.sunset})
                    </span>
                  </div>
                </div>

                {/* Vitals Grid */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold block">Regenrisiko</span>
                    <span className="text-xs font-mono font-bold text-cyan-400">
                      {weather.current.precipitationProbability}%
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold block">Wind</span>
                    <span className="text-xs font-mono font-bold text-zinc-200">
                      {weather.current.windSpeedKmH} km/h
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold block">Böen</span>
                    <span className="text-xs font-mono font-bold text-zinc-200">
                      {weather.current.windGustsKmH} km/h
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                    <span className="text-[9px] text-zinc-500 uppercase font-bold block">UV-Index</span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      UV {weather.current.uvIndex}
                    </span>
                  </div>
                </div>
              </div>

              {/* Best Training Windows Recommendations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Cycling Window */}
                <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        <Bike size={15} />
                      </div>
                      <h4 className="text-xs font-bold text-zinc-100">Optimales Rennrad-Fenster</h4>
                    </div>
                    <span className="text-xs font-mono font-bold text-orange-400">
                      {weather.bestCyclingWindow.start} – {weather.bestCyclingWindow.end} Uhr
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {weather.bestCyclingWindow.reason} ({weather.bestCyclingWindow.avgTemp}°C).
                  </p>
                </div>

                {/* Running Window */}
                <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Footprints size={15} />
                      </div>
                      <h4 className="text-xs font-bold text-zinc-100">Beste Laufzeit</h4>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {weather.bestRunningWindow.start} – {weather.bestRunningWindow.end} Uhr
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {weather.bestRunningWindow.reason} ({weather.bestRunningWindow.avgTemp}°C).
                  </p>
                </div>
              </div>

              {/* Hourly Forecast Timeline */}
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                  Stündliche Prognose für heute:
                </span>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {weather.hourly.map((h, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800/80 min-w-[76px] text-center space-y-1.5 shrink-0"
                    >
                      <span className="text-[11px] font-mono font-bold text-zinc-400 block">{h.time}</span>
                      <div className="flex justify-center py-0.5">
                        <WeatherIconRenderer icon={h.weatherIcon} className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-mono font-black text-zinc-100 block">{h.temperature}°</span>
                      <div className="flex items-center justify-center gap-0.5 text-[10px] text-cyan-400 font-mono">
                        <Droplet size={10} />
                        <span>{h.precipitationProbability}%</span>
                      </div>
                      <span className="text-[9px] text-zinc-500 block font-mono">{h.windSpeedKmH}k/h</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
