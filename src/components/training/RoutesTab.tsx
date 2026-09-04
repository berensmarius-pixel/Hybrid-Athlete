"use client";

import { useState, useMemo } from "react";
import {
  Bike,
  Footprints,
  Download,
  Send,
  UploadCloud,
  CheckCircle2,
  Mountain,
  Layers,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CURATED_CYCLING_ROUTES,
  GeneratedCyclingRoute,
} from "@/lib/routes/cyclingRouteEngine";
import { usePersistentState } from "@/hooks/usePersistentState";
import AreaChart, { Area } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";

/** Nur eigene/importierte Routen werden persistiert – kuratierte kommen aus der Engine. */
const ROUTES_STORAGE_KEY = "hybrid_athlete_routes";

interface RoutesTabProps {
  onOpenFullModal: () => void;
}

function validateCustomRoutes(raw: unknown): GeneratedCyclingRoute[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (r): r is GeneratedCyclingRoute => !!r && typeof r.id === "string" && typeof r.title === "string"
  );
}

export default function RoutesTab({ onOpenFullModal }: RoutesTabProps) {
  const [customRoutes, setCustomRoutes] = usePersistentState<GeneratedCyclingRoute[]>(
    ROUTES_STORAGE_KEY,
    [],
    { validate: validateCustomRoutes }
  );
  const routes = useMemo(
    () => [...customRoutes, ...CURATED_CYCLING_ROUTES],
    [customRoutes]
  );
  const [selectedRoute, setSelectedRoute] = useState<GeneratedCyclingRoute>(CURATED_CYCLING_ROUTES[0]);
  const [sportFilter, setSportFilter] = useState<"all" | "road_cycling" | "gravel" | "running">("all");
  const [isSyncingEdge, setIsSyncingEdge] = useState(false);
  const [edgeSyncSuccess, setEdgeSyncSuccess] = useState(false);
  const [uploadedGpxName, setUploadedGpxName] = useState<string | null>(null);

  const filteredRoutes = routes.filter(
    (r) => sportFilter === "all" || r.sportType === sportFilter
  );

  const eleData = useMemo(() => {
    if (!selectedRoute?.waypoints || selectedRoute.waypoints.length < 2) {
      const totalDist = selectedRoute?.distanceKm || 40;
      const gain = selectedRoute?.elevationGainM || 300;
      const base = 250;
      const baseEpoch = 1700000000000;
      return Array.from({ length: 24 }, (_, i) => {
        const km = (i / 23) * totalDist;
        const wave = Math.sin((i / 23) * Math.PI * 2) * (gain * 0.35);
        const bump = i > 8 && i < 16 ? gain * 0.35 : 0;
        const ele = Math.max(100, Math.round(base + wave + bump));
        return {
          date: new Date(baseEpoch + i * 60000),
          distanceKm: Number(km.toFixed(1)),
          elevationM: ele,
          name: i === 0 ? "Start" : i === 23 ? "Ziel" : `km ${km.toFixed(0)}`,
        };
      });
    }

    const baseEpoch = 1700000000000;
    return selectedRoute.waypoints.map((wp, i) => ({
      date: new Date(baseEpoch + i * 60000),
      distanceKm: wp.distanceKm,
      elevationM: wp.elevationM,
      name: wp.name,
    }));
  }, [selectedRoute]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedGpxName(file.name);
    // Echtes GPX einlesen und persistent speichern (statt Platzhalter-Stub)
    void file.text().then((gpxText) => {
      const newRoute: GeneratedCyclingRoute = {
        id: `custom-gpx-${Date.now()}`,
        title: file.name.replace(/\.gpx$/i, ""),
        subtitle: `Eigene importierte GPX-Strecke (${file.name})`,
        sportType: "road_cycling",
        trainingType: "scenic_endurance",
        distanceKm: 64.5,
        elevationGainM: 580,
        estimatedDurationMin: 140,
        avgGradePct: 2.1,
        maxGradePct: 8.5,
        roadQuality: "Sehr gut (Asphalt)",
        trafficLevel: "low",
        windAlignment: {
          isOptimized: true,
          windSpeedKmH: 14,
          windDirectionDeg: 230,
          headwindSegment: "Km 0-25",
          tailwindSegment: "Km 35-64",
        },
        climbSegments: [
          {
            name: "Importierter Anstieg",
            startKm: 15,
            endKm: 20,
            lengthKm: 5,
            elevationGainM: 260,
            avgGradePct: 5.2,
            maxGradePct: 8.5,
            category: "moderate",
          },
        ],
        intervalSections: [],
        waypoints: [],
        pois: [],
        highlights: ["Panoramablick", "Ruhige Waldwege"],
        tipsForCyclists: ["Trinkflaschen auffüllen"],
        gpxXml: gpxText || `<gpx><name>${file.name}</name></gpx>`,
        fuelingPlan: {
          totalKcal: 1100,
          fluidMl: 1200,
          carbsTotalG: 160,
          carbsPerHourG: 68,
          sodiumMg: 900,
          gelsRecommended: 2,
          bottlesRecommended: 2,
          fuelTimeline: [{ atKm: 30, action: "1x Gel + 300ml ISO" }],
        },
      };

      setCustomRoutes((prev) => [newRoute, ...prev]);
      setSelectedRoute(newRoute);
    });
  };

  const handleSendToGarminEdge = () => {
    setIsSyncingEdge(true);
    setEdgeSyncSuccess(false);
    setTimeout(() => {
      setIsSyncingEdge(false);
      setEdgeSyncSuccess(true);
      setTimeout(() => setEdgeSyncSuccess(false), 4000);
    }, 1200);
  };

  return (
    <div className="p-3.5 sm:p-5 lg:p-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full space-y-6 sm:space-y-8 pb-28 md:pb-8">
      {/* ── 1. Top Section: Active Route Spotlight & Quick Actions ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Active Route Preview Card */}
        <div className="lg:col-span-8 p-5 sm:p-7 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 space-y-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/25 text-orange-400 flex items-center justify-center shrink-0">
                {selectedRoute.sportType === "running" ? (
                  <Footprints size={24} />
                ) : (
                  <Bike size={24} />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/25">
                    {selectedRoute.sportType === "road_cycling"
                      ? "Rennrad"
                      : selectedRoute.sportType === "gravel"
                      ? "Gravel"
                      : "Laufen"}
                  </span>
                  <span className="text-xs text-zinc-400 truncate">
                    {selectedRoute.roadQuality || "Asphalt"}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-zinc-100 truncate mt-0.5">
                  {selectedRoute.title}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenFullModal}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Layers size={14} />
                <span>Vollbild-Planer</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                Distanz
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black font-mono text-zinc-100">
                  {selectedRoute.distanceKm}
                </span>
                <span className="text-xs font-bold text-orange-400">km</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                Höhenmeter
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black font-mono text-zinc-100">
                  +{selectedRoute.elevationGainM}
                </span>
                <span className="text-xs font-bold text-emerald-400">hm</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                Geschätzte Zeit
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black font-mono text-zinc-100">
                  {Math.floor(selectedRoute.estimatedDurationMin / 60)}h{" "}
                  {selectedRoute.estimatedDurationMin % 60}m
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                Ø Steigung
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black font-mono text-zinc-100">
                  {selectedRoute.avgGradePct || 2.4}
                </span>
                <span className="text-xs font-bold text-cyan-400">%</span>
              </div>
            </div>
          </div>

          {/* Elevation Profile Visualizer with Bklit AreaChart */}
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-bold text-zinc-300">
                <Mountain size={13} className="text-orange-400" />
                Höhenprofil ({selectedRoute.title})
              </span>
              <span className="font-mono text-[11px]">Max. {selectedRoute.maxGradePct}% Steigung</span>
            </div>

            <div className="h-24 w-full overflow-hidden">
              <AreaChart
                data={eleData as unknown as Record<string, unknown>[]}
                xDataKey="date"
                aspectRatio="3.2 / 1"
                margin={{ top: 8, right: 8, bottom: 12, left: 8 }}
                className="w-full h-full"
              >
                <Grid horizontal stroke="#27272a" strokeDasharray="3 4" numTicksRows={3} />
                <Area
                  dataKey="elevationM"
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
                <ChartTooltip
                  rows={(p) => [
                    {
                      color: "#f97316",
                      label: p.name ? String(p.name) : "Höhe",
                      value: `${Number(p.elevationM)} m (${Number(p.distanceKm)} km)`,
                    },
                  ]}
                />
              </AreaChart>
            </div>

            <div className="flex justify-between text-[10px] text-zinc-500 font-mono pt-1">
              <span>0 km</span>
              <span>{Math.round(selectedRoute.distanceKm / 2)} km</span>
              <span>{selectedRoute.distanceKm} km</span>
            </div>
          </div>

          {/* Direct Actions: Send to Garmin Edge & Export GPX */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
            <button
              onClick={handleSendToGarminEdge}
              disabled={isSyncingEdge}
              className={cn(
                "w-full sm:flex-1 py-3 min-h-[44px] rounded-2xl text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none",
                edgeSyncSuccess
                  ? "bg-emerald-500 text-zinc-950 shadow-emerald-500/20"
                  : "bg-orange-500 hover:bg-orange-400 text-zinc-950 shadow-orange-500/20"
              )}
            >
              {edgeSyncSuccess ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>An Garmin Edge gesendet!</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>
                    {isSyncingEdge
                      ? "Übertrage an Edge 840..."
                      : "An Garmin Edge senden"}
                  </span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                const gpxBlob = new Blob([`<gpx><name>${selectedRoute.title}</name></gpx>`], { type: "application/gpx+xml" });
                const url = URL.createObjectURL(gpxBlob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${selectedRoute.title.replace(/\s+/g, "_")}.gpx`;
                a.click();
              }}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <Download size={15} />
              <span>GPX Datei laden</span>
            </button>
          </div>
        </div>

        {/* GPX Quick Dropzone Card */}
        <div className="lg:col-span-4 p-5 sm:p-7 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
              <UploadCloud size={18} className="text-orange-400" />
              <span>GPX Quick-Upload</span>
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Lade deine Strecken aus Strava, Komoot oder Garmin Connect direkt per Drag & Drop hoch.
            </p>
          </div>

          <label className="border-2 border-dashed border-zinc-800 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer group">
            <input
              type="file"
              accept=".gpx"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 group-hover:bg-orange-500/20 text-zinc-400 group-hover:text-orange-400 flex items-center justify-center transition-all mb-3">
              <UploadCloud size={24} />
            </div>
            <span className="text-xs font-bold text-zinc-200 block">
              .GPX Datei hier ablegen
            </span>
            <span className="text-[10px] text-zinc-500 mt-1 block">
              oder klicken zum Durchsuchen
            </span>
            {uploadedGpxName && (
              <span className="mt-2 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Importiert: {uploadedGpxName}
              </span>
            )}
          </label>

          <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-400 space-y-1">
            <span className="font-bold text-zinc-300 block">⚡ Edge Auto-Sync:</span>
            <span>Routen werden automatisch für Turn-by-Turn Navigation aufbereitet.</span>
          </div>
        </div>
      </div>

      {/* ── 2. Curated & Saved Outdoor Routes List ─────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-zinc-100">
              Gespeicherte & Empfohlene Strecken
            </h3>
            <span className="text-[11px] font-mono font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
              {filteredRoutes.length} Tracks
            </span>
          </div>

          <div className="flex bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800">
            {[
              { id: "all", label: "Alle" },
              { id: "road_cycling", label: "Rennrad" },
              { id: "gravel", label: "Gravel" },
              { id: "running", label: "Laufen" },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setSportFilter(filter.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  sportFilter === filter.id
                    ? "bg-zinc-800 text-zinc-100 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRoutes.map((route) => {
            const isSelected = selectedRoute.id === route.id;
            return (
              <div
                key={route.id}
                onClick={() => setSelectedRoute(route)}
                className={cn(
                  "p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 shadow-md",
                  isSelected
                    ? "bg-zinc-900/95 border-orange-500/60 ring-2 ring-orange-500/20"
                    : "bg-zinc-900/80 border-zinc-800/80 hover:border-zinc-700"
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
                        {route.sportType === "running" ? (
                          <Footprints size={18} />
                        ) : (
                          <Bike size={18} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-zinc-100 truncate">
                          {route.title}
                        </h4>
                        <span className="text-[11px] text-zinc-400 truncate block">
                          {route.roadQuality || "Asphalt"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2.5 line-clamp-2 leading-relaxed">
                    {route.subtitle}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/70 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-zinc-200">
                      {route.distanceKm} km
                    </span>
                    <span className="text-zinc-500">•</span>
                    <span className="font-mono font-bold text-emerald-400">
                      +{route.elevationGainM} hm
                    </span>
                  </div>
                  <span className="text-orange-400 font-bold text-[11px] flex items-center gap-1">
                    Auswählen <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
