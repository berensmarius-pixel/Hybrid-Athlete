"use client";

import { useState } from "react";
import {
  X,
  Bike,
  Sparkles,
  Download,
  MapPin,
  Mountain,
  Compass,
  Wind,
  Clock,
  Zap,
  CheckCircle2,
  ChevronRight,
  Flame,
  Coffee,
  Droplet,
  Camera,
  Wrench,
  RotateCcw,
  Home,
  Navigation,
  Footprints,
  Activity,
  Layers,
} from "lucide-react";
import {
  CyclingTrainingType,
  RouteSportType,
  CustomPoi,
  GeneratedCyclingRoute,
  CURATED_CYCLING_ROUTES,
  generateAICyclingRoute,
} from "@/lib/routes/cyclingRouteEngine";
import { getSavedLocation } from "@/lib/weather/openMeteoService";
import {
  getSavedHomeAddress,
  saveHomeAddress,
  geocodeAddress,
} from "@/lib/location/geocodingService";
import RouteMapViewer from "./RouteMapViewer";

interface CyclingRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CyclingRouteModal({ isOpen, onClose }: CyclingRouteModalProps) {
  const [activeTab, setActiveTab] = useState<"generator" | "curated">("generator");

  // Generator form state
  const savedHome = getSavedHomeAddress();
  const [startLocation, setStartLocation] = useState(savedHome.name || "Kurt-Schumacher-Straße 64, 67663 Kaiserslautern");
  const [targetDistance, setTargetDistance] = useState(70);
  const [sportType, setSportType] = useState<RouteSportType>("road_cycling");
  const [trainingType, setTrainingType] = useState<CyclingTrainingType>("ftp_intervals");
  const [windOptimized, setWindOptimized] = useState(true);
  const [selectedPois, setSelectedPois] = useState<string[]>(["water", "cafe"]);
  const [loading, setLoading] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<GeneratedCyclingRoute | null>(CURATED_CYCLING_ROUTES[0]);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen) return null;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const geo = await geocodeAddress(startLocation);
      const lat = geo ? geo.latitude : savedHome.latitude;
      const lon = geo ? geo.longitude : savedHome.longitude;

      if (geo) {
        saveHomeAddress(geo);
      }

      const poisToInclude: CustomPoi[] = [];
      if (selectedPois.includes("cafe")) {
        poisToInclude.push({ id: "poi_cafe", type: "cafe", name: "Konditorei / Café-Stopp", latitude: (lat || 49.42) - 0.05, longitude: (lon || 7.74) + 0.08 });
      }
      if (selectedPois.includes("water")) {
        poisToInclude.push({ id: "poi_water", type: "water", name: "Trinkwasser-Brunnen", latitude: (lat || 49.42) - 0.08, longitude: (lon || 7.74) + 0.04 });
      }
      if (selectedPois.includes("viewpoint")) {
        poisToInclude.push({ id: "poi_view", type: "viewpoint", name: "Panorama-Aussichtspunkt", latitude: (lat || 49.42) + 0.06, longitude: (lon || 7.74) + 0.06 });
      }

      const route = await generateAICyclingRoute({
        startLocation: geo ? geo.name : startLocation,
        targetDistanceKm: targetDistance,
        trainingType,
        sportType,
        windOptimized,
        currentWindSpeedKmH: 14,
        currentWindDirectionDeg: 270,
        addedPois: poisToInclude,
        latitude: lat,
        longitude: lon,
      });
      setSelectedRoute(route);
    } catch {
      setSelectedRoute(CURATED_CYCLING_ROUTES[0]);
    } finally {
      setLoading(false);
    }
  }

  function togglePoi(type: string) {
    if (selectedPois.includes(type)) {
      setSelectedPois(selectedPois.filter((p) => p !== type));
    } else {
      setSelectedPois([...selectedPois, type]);
    }
  }

  function handleDownloadGpx(route: GeneratedCyclingRoute) {
    if (!route.gpxXml) return;
    const blob = new Blob([route.gpxXml], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${route.title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-orange-950/20 to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/30">
              <Bike size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-extrabold text-zinc-100">
                  AI Multi-Sport & Rennrad-Routenplaner
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-linear-to-r from-orange-500 to-amber-500 text-zinc-950">
                  PRO SUITE
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                ClimbPro Steigungsanalyse, Live-Windoptimierung, Verpflegungs-Timing & Garmin/Komoot GPX.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/50 px-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("generator")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === "generator"
                ? "border-orange-400 text-orange-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sparkles size={14} />
            <span>KI-Strecken-Architekt</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("curated")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === "curated"
                ? "border-orange-400 text-orange-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Compass size={14} />
            <span>Klassiker & Gran Fondos ({CURATED_CYCLING_ROUTES.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {downloadSuccess && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>
                GPX-Datei erfolgreich heruntergeladen! Ziehe sie einfach in Komoot oder verbinde deinen Garmin Edge 840.
              </span>
            </div>
          )}

          {/* ── TAB 1: AI Generator Form ───────────────────────────────────── */}
          {activeTab === "generator" && (
            <div className="space-y-4">
              <form onSubmit={handleGenerate} className="p-4 sm:p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
                {/* 1. Sport Mode Selector */}
                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1.5">Sportart & Belag</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSportType("road_cycling");
                        if (targetDistance < 30) setTargetDistance(70);
                      }}
                      className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                        sportType === "road_cycling"
                          ? "bg-orange-500/15 border-orange-400 text-zinc-100"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <Bike size={18} className={sportType === "road_cycling" ? "text-orange-400" : ""} />
                      <div>
                        <span className="text-xs font-bold block">Rennrad</span>
                        <span className="text-[10px] text-zinc-500">100% glatter Asphalt</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSportType("gravel");
                        if (targetDistance > 80) setTargetDistance(50);
                      }}
                      className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                        sportType === "gravel"
                          ? "bg-amber-500/15 border-amber-400 text-zinc-100"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <Layers size={18} className={sportType === "gravel" ? "text-amber-400" : ""} />
                      <div>
                        <span className="text-xs font-bold block">Gravel / Allroad</span>
                        <span className="text-[10px] text-zinc-500">Schotter & Waldwege</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSportType("running");
                        if (targetDistance > 30) setTargetDistance(18);
                      }}
                      className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                        sportType === "running"
                          ? "bg-emerald-500/15 border-emerald-400 text-zinc-100"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <Footprints size={18} className={sportType === "running" ? "text-emerald-400" : ""} />
                      <div>
                        <span className="text-xs font-bold block">Laufen / Trail</span>
                        <span className="text-[10px] text-zinc-500">Waldboden & Parks</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. Address & Distance */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-zinc-300">Startadresse / Startort</label>
                      <span className="text-[10px] text-orange-400 font-bold">Startet an deiner Haustür</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={startLocation}
                        onChange={(e) => setStartLocation(e.target.value)}
                        placeholder="z.B. Kurt-Schumacher-Straße 64, 67663 Kaiserslautern"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:border-orange-400 focus:outline-none"
                      />
                      <MapPin size={15} className="absolute left-3 top-3 text-zinc-500" />
                    </div>

                    {/* Quick Address Presets */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() => setStartLocation("Kurt-Schumacher-Straße 64, 67663 Kaiserslautern")}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-950 border border-orange-500/30 text-[10px] font-bold text-orange-300 hover:bg-orange-500/10 transition-colors"
                      >
                        <Home size={11} />
                        <span>Zuhause (Kurt-Schumacher-Str. 64)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStartLocation("Bremerhof, Kaiserslautern")}
                        className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] font-bold text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        Bremerhof (Waldrand)
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-zinc-300">Ziel-Distanz</label>
                      <span className="text-xs font-mono font-bold text-orange-400">{targetDistance} km</span>
                    </div>
                    <input
                      type="range"
                      min={sportType === "running" ? 5 : 30}
                      max={sportType === "running" ? 42 : 160}
                      step={sportType === "running" ? 1 : 5}
                      value={targetDistance}
                      onChange={(e) => setTargetDistance(parseInt(e.target.value))}
                      className="w-full accent-orange-500 mt-2"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1">
                      <span>{sportType === "running" ? "5 km (Sprint)" : "30 km (Feierabend)"}</span>
                      <span>{sportType === "running" ? "21 km (Halbmarathon)" : "70 km (Klassiker)"}</span>
                      <span>{sportType === "running" ? "42 km (Marathon)" : "160 km (Gran Fondo)"}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Training Goal & Wind Optimization */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-300 block mb-1">Trainingsziel / Profil</label>
                    <select
                      value={trainingType}
                      onChange={(e) => setTrainingType(e.target.value as CyclingTrainingType)}
                      className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:border-orange-400 focus:outline-none"
                    >
                      <option value="ftp_intervals">Zone 4 FTP-Intervalle (Stetige 4-6% Anstiege)</option>
                      <option value="zone2_flat">Zone 2 Grundlagenausdauer (Flach / Wellig)</option>
                      <option value="climbing_hills">Bergtraining & VO2-Max (Maximale Höhenmeter)</option>
                      <option value="scenic_endurance">Panorama & Ausdauer (Schöne Ausblicke)</option>
                      <option value="recovery_spin">Aktive Erholung / Regeneration</option>
                    </select>
                  </div>

                  {/* Wind Optimization Switch */}
                  <div>
                    <label className="text-xs font-bold text-zinc-300 block mb-1">Wind-Optimierung (Open-Meteo)</label>
                    <button
                      type="button"
                      onClick={() => setWindOptimized(!windOptimized)}
                      className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                        windOptimized
                          ? "bg-cyan-500/15 border-cyan-400 text-cyan-200"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Wind size={15} className={windOptimized ? "text-cyan-400" : ""} />
                        <span>Gegenwind raus, Rückenwind heim</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300">
                        {windOptimized ? "AKTIV" : "AUS"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* 4. POIs & Stops */}
                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1.5">Gewünschte Zwischenstopps & POIs:</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => togglePoi("water")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        selectedPois.includes("water")
                          ? "bg-blue-500/15 border-blue-400 text-blue-300"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <Droplet size={13} />
                      <span>💧 Trinkwasserbrunnen</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePoi("cafe")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        selectedPois.includes("cafe")
                          ? "bg-amber-500/15 border-amber-400 text-amber-300"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <Coffee size={13} />
                      <span>☕ Bäckerei / Café-Stopp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePoi("viewpoint")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        selectedPois.includes("viewpoint")
                          ? "bg-purple-500/15 border-purple-400 text-purple-300"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <Camera size={13} />
                      <span>📸 Panorama-Aussicht</span>
                    </button>
                  </div>
                </div>

                {/* Generate Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 rounded-2xl bg-linear-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-zinc-950 font-extrabold text-sm shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 transition-all transform active:scale-98 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      <span>Berechne Straßennetz & ClimbPro Steigungen...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Maßgeschneiderte {targetDistance} km Route ab Haustür generieren</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ── TAB 2: Curated Classic Routes List ──────────────────────────── */}
          {activeTab === "curated" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CURATED_CYCLING_ROUTES.map((route) => {
                  const isSelected = selectedRoute?.id === route.id;
                  return (
                    <div
                      key={route.id}
                      onClick={() => setSelectedRoute(route)}
                      className={`p-4 rounded-3xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? "bg-zinc-900 border-orange-500/60 ring-2 ring-orange-500/20 shadow-lg"
                          : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/30">
                          {route.sportType === "running" ? "🏃 GA1 Trail" : route.sportType === "gravel" ? "🚵 Gravel" : "🚴 Rennrad"}
                        </span>
                        <div className="flex items-center gap-3 text-xs font-mono font-bold text-zinc-300">
                          <span>{route.distanceKm} km</span>
                          <span className="text-amber-400">+{route.elevationGainM} hm</span>
                        </div>
                      </div>
                      <h4 className="text-sm font-bold text-zinc-100 mb-1">{route.title}</h4>
                      <p className="text-xs text-zinc-400 leading-snug line-clamp-2">{route.subtitle}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Active Selected Route Details Card ─────────────────────────── */}
          {selectedRoute && (
            <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 font-extrabold text-[10px] uppercase border border-orange-500/30">
                      {selectedRoute.trainingType.replace("_", " ").toUpperCase()}
                    </span>
                    <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 size={13} /> {selectedRoute.roadQuality}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-extrabold text-zinc-100">
                    {selectedRoute.title}
                  </h3>
                  <p className="text-xs text-zinc-400">{selectedRoute.subtitle}</p>
                </div>

                {/* 1-Click GPX Download Button */}
                <button
                  type="button"
                  onClick={() => handleDownloadGpx(selectedRoute)}
                  className="px-4 py-2.5 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs shadow-lg shadow-orange-600/30 flex items-center gap-2 transition-all shrink-0 cursor-pointer"
                >
                  <Download size={14} />
                  <span>GPX für Komoot / Garmin</span>
                </button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                  <span className="text-[9px] text-zinc-500 uppercase font-bold block">Distanz</span>
                  <span className="text-base font-mono font-extrabold text-orange-400">{selectedRoute.distanceKm} km</span>
                </div>
                <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                  <span className="text-[9px] text-zinc-500 uppercase font-bold block">Höhenmeter</span>
                  <span className="text-base font-mono font-extrabold text-amber-400">+{selectedRoute.elevationGainM} m</span>
                </div>
                <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                  <span className="text-[9px] text-zinc-500 uppercase font-bold block">Dauer (ca.)</span>
                  <span className="text-base font-mono font-extrabold text-zinc-100">
                    {Math.floor(selectedRoute.estimatedDurationMin / 60)}h {selectedRoute.estimatedDurationMin % 60}m
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
                  <span className="text-[9px] text-zinc-500 uppercase font-bold block">Max Steigung</span>
                  <span className="text-base font-mono font-extrabold text-rose-400">{selectedRoute.maxGradePct}%</span>
                </div>
              </div>

              {/* Interactive OpenCyclingMap with ClimbPro Heatmap & POIs */}
              {selectedRoute.waypoints && selectedRoute.waypoints.length > 0 && (
                <RouteMapViewer
                  key={`${selectedRoute.id}_${selectedRoute.distanceKm}_${selectedRoute.waypoints[0]?.latitude}`}
                  waypoints={selectedRoute.waypoints}
                  title={selectedRoute.title}
                  distanceKm={selectedRoute.distanceKm}
                  elevationGainM={selectedRoute.elevationGainM}
                  climbs={selectedRoute.climbSegments}
                  pois={selectedRoute.pois}
                  windSpeedKmH={selectedRoute.windAlignment?.windSpeedKmH}
                  windDirectionDeg={selectedRoute.windAlignment?.windDirectionDeg}
                />
              )}

              {/* ── ClimbPro Breakdown List ─────────────────────────────────── */}
              {selectedRoute.climbSegments && selectedRoute.climbSegments.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400 block flex items-center gap-1.5">
                    <Mountain size={13} />
                    <span>ClimbPro Anstiegs-Übersicht ({selectedRoute.climbSegments.length} Segmente):</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedRoute.climbSegments.map((climb, idx) => (
                      <div key={idx} className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-100">{climb.name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300">
                            Max {climb.maxGradePct}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
                          <span>km {climb.startKm} ➔ {climb.endKm} ({climb.lengthKm} km)</span>
                          <span className="text-amber-400">+{climb.elevationGainM} hm ({climb.avgGradePct}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Route Fueling & Nutrition Plan ─────────────────────────── */}
              {selectedRoute.fuelingPlan && (
                <div className="p-4 rounded-2xl bg-linear-to-r from-zinc-950 via-amber-950/20 to-zinc-950 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                      <Flame size={14} className="text-amber-400" />
                      <span>Strecken-Verpflegungsplan (Pacing & Intra-Workout Carbs)</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      ~{selectedRoute.fuelingPlan.totalKcal} kcal
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800">
                      <span className="text-[9px] text-zinc-500 font-bold block">Flüssigkeit</span>
                      <span className="font-mono font-extrabold text-cyan-400">{selectedRoute.fuelingPlan.fluidMl} ml</span>
                    </div>
                    <div className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800">
                      <span className="text-[9px] text-zinc-500 font-bold block">Kohlenhydrate</span>
                      <span className="font-mono font-extrabold text-amber-400">{selectedRoute.fuelingPlan.carbsTotalG} g ({selectedRoute.fuelingPlan.carbsPerHourG}g/h)</span>
                    </div>
                    <div className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800">
                      <span className="text-[9px] text-zinc-500 font-bold block">Hydro-Gels</span>
                      <span className="font-mono font-extrabold text-emerald-400">{selectedRoute.fuelingPlan.gelsRecommended}x Gels</span>
                    </div>
                  </div>

                  {/* Fuel Timeline */}
                  {selectedRoute.fuelingPlan.fuelTimeline.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {selectedRoute.fuelingPlan.fuelTimeline.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[11px] text-zinc-300">
                          <span className="font-mono text-amber-400 font-bold shrink-0">Bei km {item.atKm}:</span>
                          <span className="text-zinc-300">{item.action}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Highlights & Tips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-400 block">
                    ✨ Strecken-Highlights:
                  </span>
                  <ul className="space-y-1 text-xs text-zinc-300">
                    {selectedRoute.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-orange-400 font-bold">•</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
                    💡 Pacing & Sicherheit:
                  </span>
                  <ul className="space-y-1 text-xs text-zinc-300">
                    {selectedRoute.tipsForCyclists.map((t, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-400 font-bold">•</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
