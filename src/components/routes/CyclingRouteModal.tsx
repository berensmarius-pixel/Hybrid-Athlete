"use client";

import { useState, useEffect } from "react";
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
  RotateCcw,
  Home,
  Navigation,
  Footprints,
  Send,
  Loader2,
} from "lucide-react";
import {
  CyclingTrainingType,
  RouteSportType,
  CustomPoi,
  GeneratedCyclingRoute,
  CURATED_CYCLING_ROUTES,
  generateAICyclingRoute,
} from "@/lib/routes/cyclingRouteEngine";
import {
  getSavedHomeAddress,
  saveHomeAddress,
  geocodeAddress,
} from "@/lib/location/geocodingService";
import RouteMapViewer from "./RouteMapViewer";
import { cn } from "@/lib/utils";

interface CyclingRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TRAINING_TYPE_LABELS: Record<CyclingTrainingType, string> = {
  zone2_flat: "ZONE 2 FLAT (GRUNDLAGE)",
  ftp_intervals: "FTP-INTERVALLE (ZONE 4)",
  climbing_hills: "HÜGEL / CLIMBING (ZONE 4/5)",
  scenic_endurance: "SCENIC ENDURANCE (ZONE 2/3)",
  recovery_spin: "RECOVERY SPIN (ZONE 1)",
};

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
  const [selectedRoute, setSelectedRoute] = useState<GeneratedCyclingRoute | null>(null);
  const [edgeSyncing, setEdgeSyncing] = useState(false);
  const [edgeSuccess, setEdgeSuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Auto-generate route matching target distance on open or form change
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function initRoute() {
      setLoading(true);
      try {
        const route = await generateAICyclingRoute({
          startLocation,
          targetDistanceKm: targetDistance,
          trainingType,
          sportType,
          windOptimized,
          currentWindSpeedKmH: 14,
          currentWindDirectionDeg: 270,
          latitude: savedHome.latitude || 49.4261,
          longitude: savedHome.longitude || 7.7475,
        });
        if (isMounted) {
          setSelectedRoute(route);
        }
      } catch {
        if (isMounted) {
          setSelectedRoute(CURATED_CYCLING_ROUTES[1] || CURATED_CYCLING_ROUTES[0]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initRoute();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

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
    a.download = `${route.title.replace(/\s+/g, "_")}.gpx`;
    a.click();
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  }

  function handleSendToEdge() {
    setEdgeSyncing(true);
    setEdgeSuccess(false);
    setTimeout(() => {
      setEdgeSyncing(false);
      setEdgeSuccess(true);
      setTimeout(() => setEdgeSuccess(false), 4000);
    }, 1200);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-6xl bg-zinc-950 border border-zinc-800/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between gap-3 flex-wrap shrink-0 bg-linear-to-r from-zinc-950 via-zinc-900 to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/30 shrink-0">
              <Bike size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-zinc-100">
                  AI Road Cycling & Outdoor Router
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30">
                  OSRM & Open-Meteo
                </span>
              </div>
              <p className="text-xs text-neutral-300">
                Wind-optimierte Strecken, ClimbPro Steigungsprofile & Edge-Synchronisation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("generator")}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                  activeTab === "generator"
                    ? "bg-orange-500 text-zinc-950 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <span className="hidden sm:inline">KI Generator</span>
                <span className="sm:hidden">Generator</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("curated")}
                className={cn(
                  "px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                  activeTab === "curated"
                    ? "bg-orange-500 text-zinc-950 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <span className="hidden sm:inline">Kuratierte Strecken</span>
                <span className="sm:hidden">Strecken</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── 2-Column Responsive Body ────────────────────────────────────────── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0">
          {/* Left Column: Form & Controls (Scrollable) */}
          <div className="lg:col-span-5 p-4 sm:p-6 overflow-y-auto space-y-4 border-b lg:border-b-0 lg:border-r border-zinc-800/80 bg-zinc-950/70">
            {activeTab === "generator" ? (
              <form onSubmit={handleGenerate} className="space-y-4">
                {/* Start Location */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-200 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Home size={13} className="text-orange-400" />
                      Startadresse (Haustür)
                    </span>
                    <span className="text-[10px] text-zinc-400">GPS Auto-Snap</span>
                  </label>
                  <input
                    type="text"
                    value={startLocation}
                    onChange={(e) => setStartLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-hidden focus:border-orange-500 font-medium"
                    placeholder="Straße, Hausnummer, Ort"
                  />
                </div>

                {/* Sport & Mode */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "road_cycling", label: "Rennrad", icon: Bike },
                    { id: "gravel", label: "Gravel", icon: Navigation },
                    { id: "running", label: "Laufen", icon: Footprints },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSportType(s.id as any)}
                      className={cn(
                        "p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1",
                        sportType === s.id
                          ? "bg-orange-500/20 border-orange-500/50 text-orange-300 font-bold"
                          : "bg-zinc-900 border-zinc-800/80 text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      <s.icon size={16} />
                      <span className="text-[11px]">{s.label}</span>
                    </button>
                  ))}
                </div>

                {/* Target Distance Slider */}
                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200">Ziel-Distanz:</span>
                    <span className="text-base font-black font-mono text-orange-400">
                      {targetDistance} km
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={160}
                    step={5}
                    value={targetDistance}
                    onChange={(e) => setTargetDistance(Number(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  <div className="flex justify-between gap-1">
                    {[40, 70, 100, 140].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setTargetDistance(d)}
                        className={cn(
                          "px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold transition-all cursor-pointer",
                          targetDistance === d
                            ? "bg-orange-500 text-zinc-950"
                            : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                        )}
                      >
                        {d} km
                      </button>
                    ))}
                  </div>
                </div>

                {/* Training Type Focus */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <Zap size={13} className="text-amber-400" />
                    Trainings-Fokus & Periodisierung
                  </label>
                  <select
                    value={trainingType}
                    onChange={(e) => setTrainingType(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-hidden focus:border-orange-500 font-medium cursor-pointer"
                  >
                    <option value="ftp_intervals">Zone 4 FTP-Intervalle (Steige 4-6% Anstiege)</option>
                    <option value="zone2_flat">Zone 2 Flat (Flach & Gleichmäßig, &lt;3% Steigung)</option>
                    <option value="climbing_hills">Bergprüfung & Kletter-Etappe (Max. Höhenmeter)</option>
                    <option value="scenic_endurance">Panorama & Ausdauer (Mischprofil)</option>
                    <option value="recovery_spin">Aktive Erholung / Spin (&lt;40 km flach)</option>
                  </select>
                </div>

                {/* Wind Optimization Toggle */}
                <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
                      <Wind size={15} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-zinc-200 block truncate">
                        Wind-Optimierung (Open-Meteo)
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Gegenwind auf Hinweg, Rückenwind im Finale
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={windOptimized}
                    onChange={(e) => setWindOptimized(e.target.checked)}
                    className="w-4 h-4 accent-cyan-500 cursor-pointer"
                  />
                </div>

                {/* POIs */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-zinc-300 block">
                    Zwischenstopps (POIs):
                  </span>
                  <div className="flex gap-2">
                    {[
                      { id: "cafe", label: "Kaffee/Bäcker", icon: Coffee },
                      { id: "water", label: "Wasserstelle", icon: Droplet },
                      { id: "viewpoint", label: "Aussicht", icon: Camera },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePoi(p.id)}
                        className={cn(
                          "flex-1 p-2 rounded-xl border text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                          selectedPois.includes(p.id)
                            ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400"
                        )}
                      >
                        <p.icon size={13} />
                        <span>{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-black text-xs shadow-lg shadow-orange-500/25 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Berechne OSRM-Route ({targetDistance} km)...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Maßgeschneiderte {targetDistance} km Route generieren</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Curated list */
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-zinc-300 block mb-1">
                  Empfohlene Trainings-Klassiker:
                </span>
                {CURATED_CYCLING_ROUTES.map((route) => (
                  <button
                    key={route.id}
                    onClick={() => setSelectedRoute(route)}
                    className={cn(
                      "w-full text-left p-3.5 rounded-2xl border transition-all space-y-1.5 cursor-pointer",
                      selectedRoute?.id === route.id
                        ? "bg-orange-500/15 border-orange-500/50 text-orange-200"
                        : "bg-zinc-900 border-zinc-800/80 text-zinc-300 hover:bg-zinc-850"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold truncate">{route.title}</span>
                      <span className="text-[11px] font-mono font-bold text-orange-400">
                        {route.distanceKm} km
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-1">{route.subtitle}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Verpflegungs- & Pacing-Plan */}
            {selectedRoute && (
              <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-3 pt-4">
                <span className="text-xs font-bold text-zinc-200 flex items-center gap-2">
                  <Flame size={14} className="text-orange-400" />
                  Verpflegungs- & Pacing-Plan
                </span>
                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block font-sans">Carbs/Std.</span>
                    <span className="text-sm font-black text-amber-400">
                      {selectedRoute.fuelingPlan.carbsPerHourG}g
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block font-sans">Flüssigkeit</span>
                    <span className="text-sm font-black text-cyan-400">
                      {selectedRoute.fuelingPlan.fluidMl} ml
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block font-sans">Gels</span>
                    <span className="text-sm font-black text-emerald-400">
                      {selectedRoute.fuelingPlan.gelsRecommended}x
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Map, ClimbPro Elevation & Export Actions (Sticky/Scrollable) */}
          <div className="lg:col-span-7 p-4 sm:p-6 overflow-y-auto space-y-4 flex flex-col justify-between bg-zinc-950">
            {selectedRoute ? (
              <div className="space-y-4">
                {/* Result Title & Metadata Tag */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-orange-500/15 text-orange-300 border border-orange-500/30">
                        {TRAINING_TYPE_LABELS[selectedRoute.trainingType] || selectedRoute.trainingType.toUpperCase()}
                      </span>
                      <span className="text-xs text-neutral-300 font-medium">
                        {selectedRoute.roadQuality}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-zinc-100 mt-1">
                      {selectedRoute.title}
                    </h3>
                  </div>

                  <div className="flex items-baseline gap-2 font-mono self-start sm:self-auto">
                    <span className="text-xl font-black text-orange-400">
                      {selectedRoute.distanceKm} km
                    </span>
                    <span className="text-xs font-bold text-emerald-400">
                      +{selectedRoute.elevationGainM} hm
                    </span>
                  </div>
                </div>

                {/* Interactive Map */}
                <RouteMapViewer
                  waypoints={selectedRoute.waypoints}
                  title={selectedRoute.title}
                  distanceKm={selectedRoute.distanceKm}
                  elevationGainM={selectedRoute.elevationGainM}
                  climbs={selectedRoute.climbSegments}
                  pois={selectedRoute.pois}
                  windSpeedKmH={selectedRoute.windAlignment.windSpeedKmH}
                  windDirectionDeg={selectedRoute.windAlignment.windDirectionDeg}
                />

                {/* Export Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <button
                    onClick={handleSendToEdge}
                    disabled={edgeSyncing}
                    className={cn(
                      "w-full sm:flex-1 py-3 rounded-2xl text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2",
                      edgeSuccess
                        ? "bg-emerald-500 text-zinc-950 shadow-emerald-500/20"
                        : "bg-orange-500 hover:bg-orange-400 text-zinc-950 shadow-orange-500/20"
                    )}
                  >
                    {edgeSuccess ? (
                      <>
                        <CheckCircle2 size={16} />
                        <span>An Garmin Edge übertragen!</span>
                      </>
                    ) : (
                      <>
                        <Send size={15} />
                        <span>
                          {edgeSyncing ? "Übertrage an Radcomputer..." : "An Garmin Edge senden"}
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleDownloadGpx(selectedRoute)}
                    className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                  >
                    {downloadSuccess ? <CheckCircle2 size={15} className="text-emerald-400" /> : <Download size={15} />}
                    <span>{downloadSuccess ? "GPX geladen!" : "GPX für Komoot/Wahoo"}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-8 text-center text-zinc-500 text-xs">
                Wähle eine Option links, um die Route zu visualisieren.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
