"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { RouteWaypoint, CustomPoi, ClimbSegment } from "@/lib/routes/cyclingRouteEngine";
import { fetchRoadNetworkRoute } from "@/lib/routes/osrmRoutingService";
import {
  Mountain,
  Layers,
  ZoomIn,
  ZoomOut,
  Navigation,
  Bike,
  Compass,
  ShieldCheck,
  Wind,
  Coffee,
  Droplet,
  Camera,
  Wrench,
  Flame,
} from "lucide-react";
import type * as LType from "leaflet";

interface RouteMapViewerProps {
  waypoints: RouteWaypoint[];
  title: string;
  distanceKm: number;
  elevationGainM: number;
  climbs?: ClimbSegment[];
  pois?: CustomPoi[];
  windSpeedKmH?: number;
  windDirectionDeg?: number;
}

type MapTileProvider = "cyclosm" | "osm" | "dark";

function getGradeColor(pct: number): string {
  if (pct >= 9.0) return "#dc2626"; // Red (Steep Wall)
  if (pct >= 6.0) return "#f97316"; // Orange (Climb)
  if (pct >= 3.5) return "#eab308"; // Yellow (Moderate)
  return "#10b981"; // Green (Flat/Rolling)
}

export default function RouteMapViewer({
  waypoints,
  title,
  distanceKm,
  elevationGainM,
  climbs = [],
  pois = [],
  windSpeedKmH = 14,
  windDirectionDeg = 270,
}: RouteMapViewerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LType.Map | null>(null);
  const layerGroupRef = useRef<LType.LayerGroup | null>(null);
  const tileLayerRef = useRef<LType.TileLayer | null>(null);

  const [tileProvider, setTileProvider] = useState<MapTileProvider>("cyclosm");
  const [scrubKm, setScrubKm] = useState<number | null>(null);
  const [scrubEle, setScrubEle] = useState<number | null>(null);
  const [scrubGrade, setScrubGrade] = useState<number | null>(null);
  const [activeWp, setActiveWp] = useState<RouteWaypoint | null>(null);
  const [roadSnapped, setRoadSnapped] = useState(false);

  // Initialize Leaflet Map & Road-Network Snapping
  useEffect(() => {
    if (!mapContainerRef.current || typeof window === "undefined") return;

    let isMounted = true;

    async function initMap() {
      const L = await import("leaflet");

      if (!isMounted || !mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const defaultCenter: [number, number] =
        waypoints.length > 0
          ? [waypoints[0].latitude, waypoints[0].longitude]
          : [49.4447, 7.769];

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
      });

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;

      updateTileLayer(tileProvider, L, map);
      await renderRouteOnMap(L, map, layerGroup);
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [waypoints, pois]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      if (mapInstanceRef.current) {
        updateTileLayer(tileProvider, L, mapInstanceRef.current);
      }
    });
  }, [tileProvider]);

  function updateTileLayer(provider: MapTileProvider, L: typeof LType, map: LType.Map) {
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png";
    let maxZoom = 20;

    if (provider === "osm") {
      url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      maxZoom = 19;
    } else if (provider === "dark") {
      url = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
      maxZoom = 19;
    }

    const tileLayer = L.tileLayer(url, {
      maxZoom,
      subdomains: ["a", "b", "c"],
    }).addTo(map);

    tileLayerRef.current = tileLayer;
  }

  async function renderRouteOnMap(L: typeof LType, map: LType.Map, layerGroup: LType.LayerGroup) {
    layerGroup.clearLayers();

    if (!waypoints || waypoints.length === 0) return;

    let polylineCoords: [number, number][] = waypoints.map((w) => [w.latitude, w.longitude]);

    const osrmResult = await fetchRoadNetworkRoute(waypoints);
    if (osrmResult && osrmResult.coordinates.length > 0) {
      polylineCoords = osrmResult.coordinates;
      setRoadSnapped(true);
    } else {
      setRoadSnapped(false);
    }

    // Outer Glow / Background Polyline
    L.polyline(polylineCoords, {
      color: "#ea580c",
      weight: 8,
      opacity: 0.35,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layerGroup);

    // Sharp Foreground Polyline
    L.polyline(polylineCoords, {
      color: "#f97316",
      weight: 4.5,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layerGroup);

    // Add Milestone Markers
    waypoints.forEach((wp, idx) => {
      const isStart = idx === 0;
      const isFinish = idx === waypoints.length - 1;
      const bgColor = isStart ? "#10b981" : isFinish ? "#f43f5e" : "#f97316";

      const customIcon = L.divIcon({
        className: "custom-map-pin",
        html: `
          <div style="
            background-color: ${bgColor};
            color: #ffffff;
            font-size: 10px;
            font-weight: 800;
            width: ${isStart || isFinish ? "24px" : "20px"};
            height: ${isStart || isFinish ? "24px" : "20px"};
            border-radius: 9999px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid #09090b;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
            cursor: pointer;
          ">
            ${isStart ? "🏁" : isFinish ? "🏠" : idx + 1}
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([wp.latitude, wp.longitude], { icon: customIcon }).addTo(layerGroup);

      const popupContent = `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; color: #18181b; padding: 2px;">
          <strong style="font-size: 13px; display: block; margin-bottom: 2px; color: #09090b;">${wp.name}</strong>
          <span style="color: #ea580c; font-weight: bold;">km ${wp.distanceKm} • ${wp.elevationM}m ü. NN</span>
          <p style="margin: 4px 0 0 0; color: #52525b; font-size: 11px;">${wp.note}</p>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on("click", () => setActiveWp(wp));
    });

    // Add POI Pins
    pois.forEach((poi) => {
      const emoji = poi.type === "cafe" ? "☕" : poi.type === "water" ? "💧" : poi.type === "viewpoint" ? "📸" : "🔧";
      const poiIcon = L.divIcon({
        className: "custom-poi-pin",
        html: `
          <div style="
            background-color: #18181b;
            color: #ffffff;
            font-size: 11px;
            width: 22px;
            height: 22px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1.5px solid #eab308;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
            cursor: pointer;
          ">
            ${emoji}
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const poiMarker = L.marker([poi.latitude, poi.longitude], { icon: poiIcon }).addTo(layerGroup);
      poiMarker.bindPopup(`<strong>${emoji} ${poi.name}</strong><br><span style="font-size:10px; color:#71717a">Zwischenstopp</span>`);
    });

    // Fit map bounds
    if (polylineCoords.length > 0) {
      const bounds = L.latLngBounds(polylineCoords);
      map.fitBounds(bounds, { padding: [35, 35] });
    }
  }

  // Elevation Profile segments with ClimbPro gradient heat colors
  const eleProfile = useMemo(() => {
    if (!waypoints || waypoints.length === 0) return { minEle: 0, maxEle: 500, segments: [], points: [] };
    const totalDist = distanceKm || 1;
    const w = 1000;
    const h = 130;

    // Build dense high-resolution elevation profile across the entire distance
    const SAMPLE_COUNT = 60;
    const samplePoints: { km: number; ele: number }[] = [];

    for (let s = 0; s <= SAMPLE_COUNT; s++) {
      const curKm = (s / SAMPLE_COUNT) * totalDist;

      // Find bounding waypoints
      let prevWp = waypoints[0];
      let nextWp = waypoints[waypoints.length - 1];
      for (let i = 0; i < waypoints.length - 1; i++) {
        if (curKm >= waypoints[i].distanceKm && curKm <= waypoints[i + 1].distanceKm) {
          prevWp = waypoints[i];
          nextWp = waypoints[i + 1];
          break;
        }
      }

      const segmentSpan = nextWp.distanceKm - prevWp.distanceKm || 0.1;
      const t = Math.max(0, Math.min(1, (curKm - prevWp.distanceKm) / segmentSpan));
      let interpolatedEle = prevWp.elevationM + t * (nextWp.elevationM - prevWp.elevationM);

      // If within a known climb, enhance realistic grade profile
      const activeClimb = (climbs || []).find((c) => curKm >= c.startKm && curKm <= c.endKm);
      if (activeClimb) {
        const climbProgress = (curKm - activeClimb.startKm) / Math.max(0.5, activeClimb.lengthKm);
        const climbEle = activeClimb.avgGradePct * climbProgress * (activeClimb.lengthKm * 10);
        interpolatedEle = Math.max(interpolatedEle, prevWp.elevationM + climbEle);
      }

      samplePoints.push({ km: curKm, ele: Math.round(interpolatedEle) });
    }

    const allEles = [...waypoints.map((w) => w.elevationM), ...samplePoints.map((p) => p.ele)];
    const minEle = Math.max(0, Math.min(...allEles) - 20);
    const maxEle = Math.max(...allEles) + 25;
    const eleSpan = maxEle - minEle || 1;

    // SVG Waypoint Milestone Dots
    const pts = waypoints.map((wp) => {
      const x = (wp.distanceKm / totalDist) * w;
      const y = h - ((wp.elevationM - minEle) / eleSpan) * (h - 20) - 10;
      return { x, y, wp };
    });

    // Create colored segments based on gradient
    const segments: { x1: number; y1: number; x2: number; y2: number; color: string; gradePct: number }[] = [];
    for (let i = 0; i < samplePoints.length - 1; i++) {
      const p1 = samplePoints[i];
      const p2 = samplePoints[i + 1];
      const x1 = (p1.km / totalDist) * w;
      const x2 = (p2.km / totalDist) * w;
      const y1 = h - ((p1.ele - minEle) / eleSpan) * (h - 20) - 10;
      const y2 = h - ((p2.ele - minEle) / eleSpan) * (h - 20) - 10;

      const distDeltaKm = p2.km - p1.km || 0.1;
      const eleDeltaM = p2.ele - p1.ele;
      let gradePct = Math.round((eleDeltaM / (distDeltaKm * 1000)) * 100 * 10) / 10;

      // Check if inside defined climb
      const climb = (climbs || []).find((c) => p1.km >= c.startKm && p2.km <= c.endKm + 0.5);
      if (climb) {
        gradePct = Math.max(gradePct, climb.avgGradePct);
      }

      segments.push({
        x1,
        y1,
        x2,
        y2,
        color: getGradeColor(gradePct),
        gradePct,
      });
    }

    return { minEle, maxEle, segments, points: pts };
  }, [waypoints, distanceKm, climbs]);

  const handleEleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetKm = Math.round(ratio * distanceKm * 10) / 10;
    setScrubKm(targetKm);

    if (waypoints.length > 0) {
      let closest = waypoints[0];
      let minDiff = 9999;
      waypoints.forEach((wp) => {
        const diff = Math.abs(wp.distanceKm - targetKm);
        if (diff < minDiff) {
          minDiff = diff;
          closest = wp;
        }
      });
      setScrubEle(closest.elevationM);
      setActiveWp(closest);
    }
  };

  return (
    <div className="space-y-3 rounded-3xl bg-zinc-950 border border-zinc-800 p-3 sm:p-4 overflow-hidden shadow-inner">
      {/* Map Header Toolbar & Layer Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 text-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/30">
            <Bike size={14} />
          </div>
          <span className="font-bold text-zinc-100 flex items-center gap-1.5 flex-wrap">
            <span>OpenCyclingMap Live</span>
            {roadSnapped && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5">
                <ShieldCheck size={10} />
                Straßennetz aktiv
              </span>
            )}
          </span>
        </div>

        {/* Layer Selector */}
        <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setTileProvider("cyclosm")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
              tileProvider === "cyclosm"
                ? "bg-orange-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            🚴‍♂️ CyclOSM
          </button>
          <button
            type="button"
            onClick={() => setTileProvider("osm")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
              tileProvider === "osm"
                ? "bg-orange-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            🗺️ OSM
          </button>
          <button
            type="button"
            onClick={() => setTileProvider("dark")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
              tileProvider === "dark"
                ? "bg-orange-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            🌙 Dark
          </button>
        </div>
      </div>

      {/* Real Leaflet Map Container */}
      <div className="relative w-full h-72 sm:h-84 rounded-2xl border border-zinc-800 overflow-hidden shadow-inner">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Live Wind Vector Compass Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2 p-2 rounded-2xl bg-zinc-950/90 border border-zinc-800/90 backdrop-blur-md shadow-lg z-10 text-xs">
          <div
            className="p-1.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 transition-transform duration-500"
            style={{ transform: `rotate(${windDirectionDeg}deg)` }}
          >
            <Navigation size={14} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <Wind size={11} className="text-cyan-400" />
              <span className="font-mono font-bold text-zinc-100">{windSpeedKmH} km/h</span>
            </div>
            <span className="text-[9px] font-bold text-emerald-400 block">Rückenwind-Finish</span>
          </div>
        </div>

        {/* Map Floating Controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomIn()}
            className="p-2 rounded-xl bg-zinc-950/90 hover:bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-md backdrop-blur-md transition-all"
            title="Heranzoomen"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomOut()}
            className="p-2 rounded-xl bg-zinc-950/90 hover:bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-md backdrop-blur-md transition-all"
            title="Herauszoomen"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (mapInstanceRef.current && waypoints.length > 0) {
                const latLngs: [number, number][] = waypoints.map((w) => [w.latitude, w.longitude]);
                mapInstanceRef.current.fitBounds(latLngs, { padding: [35, 35] });
              }
            }}
            className="p-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white shadow-md transition-all"
            title="Route zentrieren"
          >
            <Navigation size={14} />
          </button>
        </div>

        {/* Waypoint Active Info Card */}
        {activeWp && (
          <div className="absolute bottom-3 left-3 right-14 sm:right-auto sm:max-w-xs p-3.5 rounded-2xl bg-zinc-950/95 border border-orange-500/50 backdrop-blur-md shadow-2xl space-y-1.5 z-10 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-400">
                Wegpunkt {waypoints.findIndex((w) => w.name === activeWp.name) + 1} von {waypoints.length}
              </span>
              <span className="font-mono text-xs font-bold text-amber-400">
                {activeWp.elevationM}m ü. NN
              </span>
            </div>
            <h4 className="text-xs sm:text-sm font-bold text-zinc-100 truncate">{activeWp.name}</h4>
            <p className="text-xs text-neutral-200 font-medium leading-snug">{activeWp.note}</p>
            <div className="text-[11px] font-mono text-neutral-400 pt-0.5">
              Bei Streckenkilometer {activeWp.distanceKm} km
            </div>
          </div>
        )}
      </div>

      {/* ── ClimbPro Gradient-Colored Elevation Profile ─────────────────────── */}
      <div className="space-y-1.5 pt-1">
        <div className="flex flex-wrap items-center justify-between text-[11px] gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-zinc-200 flex items-center gap-1">
              <Mountain size={13} className="text-orange-400" />
              <span>ClimbPro Steigungs-Profil:</span>
            </span>
            {/* Climb Legend */}
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> &lt;3%
              </span>
              <span className="flex items-center gap-1 text-yellow-400">
                <span className="w-2 h-2 rounded-full bg-yellow-500" /> 4-6%
              </span>
              <span className="flex items-center gap-1 text-orange-400">
                <span className="w-2 h-2 rounded-full bg-orange-500" /> 7-9%
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-600" /> 10%+
              </span>
            </div>
          </div>

          <div className="font-mono text-zinc-400 flex items-center gap-3">
            <span>Min: {eleProfile.minEle}m</span>
            <span>Max: {eleProfile.maxEle}m</span>
            {scrubKm !== null && (
              <span className="text-orange-400 font-bold">
                km {scrubKm} ({scrubEle}m)
              </span>
            )}
          </div>
        </div>

        {/* SVG Elevation Chart with ClimbPro Gradient Segments */}
        <div className="relative w-full h-24 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 overflow-hidden cursor-crosshair">
          <svg
            viewBox="0 0 1000 130"
            className="w-full h-full"
            preserveAspectRatio="none"
            onMouseMove={handleEleMouseMove}
            onMouseLeave={() => setScrubKm(null)}
          >
            {/* Grid Lines */}
            <line x1="0" y1="35" x2="1000" y2="35" stroke="#27272a" strokeDasharray="3 3" />
            <line x1="0" y1="70" x2="1000" y2="70" stroke="#27272a" strokeDasharray="3 3" />
            <line x1="0" y1="105" x2="1000" y2="105" stroke="#27272a" strokeDasharray="3 3" />

            {/* Render ClimbPro colored segments */}
            {eleProfile.segments.map((seg, idx) => (
              <g key={idx}>
                {/* Gradient Fill under each segment */}
                <polygon
                  points={`${seg.x1},${seg.y1} ${seg.x2},${seg.y2} ${seg.x2},130 ${seg.x1},130`}
                  fill={seg.color}
                  opacity="0.15"
                />
                {/* Thick Color Segment Line */}
                <line
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke={seg.color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </g>
            ))}

            {/* Waypoint Milestone Dots */}
            {eleProfile.points.map((pt, idx) => (
              <circle
                key={idx}
                cx={pt.x}
                cy={pt.y}
                r="3.5"
                fill="#ffffff"
                stroke="#09090b"
                strokeWidth="1.5"
              />
            ))}
          </svg>

          {/* Scrub Needle */}
          {scrubKm !== null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-orange-400 pointer-events-none shadow-sm"
              style={{ left: `${(scrubKm / (distanceKm || 1)) * 100}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
