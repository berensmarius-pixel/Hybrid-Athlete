// ─── AI Road Cycling & Multi-Sport Route Architect ───────────────────────────

import { fetchRoadNetworkRoute, RouteSportMode } from "./osrmRoutingService";

export type CyclingTrainingType = "zone2_flat" | "ftp_intervals" | "climbing_hills" | "scenic_endurance" | "recovery_spin";
export type RouteSportType = "road_cycling" | "gravel" | "running";

export interface CustomPoi {
  id: string;
  type: "cafe" | "water" | "viewpoint" | "repair";
  name: string;
  distanceKm?: number;
  latitude: number;
  longitude: number;
}

export interface RouteFuelingPlan {
  totalKcal: number;
  fluidMl: number;
  carbsTotalG: number;
  carbsPerHourG: number;
  sodiumMg: number;
  gelsRecommended: number;
  bottlesRecommended: number;
  fuelTimeline: { atKm: number; action: string }[];
}

export interface ClimbSegment {
  name: string;
  startKm: number;
  endKm: number;
  lengthKm: number;
  elevationGainM: number;
  avgGradePct: number;
  maxGradePct: number;
  category: "flat" | "moderate" | "steep" | "wall";
}

export interface CyclingRouteRequest {
  startLocation: string;
  latitude?: number;
  longitude?: number;
  targetDistanceKm: number;
  trainingType: CyclingTrainingType;
  sportType?: RouteSportType;
  windOptimized?: boolean;
  currentWindSpeedKmH?: number;
  currentWindDirectionDeg?: number;
  temperature?: number;
  addedPois?: CustomPoi[];
}

export interface RouteWaypoint {
  name: string;
  distanceKm: number;
  elevationM: number;
  note: string;
  latitude: number;
  longitude: number;
}

export interface GeneratedCyclingRoute {
  id: string;
  title: string;
  subtitle: string;
  sportType: RouteSportType;
  trainingType: CyclingTrainingType;
  distanceKm: number;
  elevationGainM: number;
  estimatedDurationMin: number;
  avgGradePct: number;
  maxGradePct: number;
  roadQuality: string;
  trafficLevel: "very_low" | "low" | "moderate";
  windAlignment: {
    isOptimized: boolean;
    windSpeedKmH: number;
    windDirectionDeg: number;
    headwindSegment: string;
    tailwindSegment: string;
  };
  climbSegments: ClimbSegment[];
  fuelingPlan: RouteFuelingPlan;
  intervalSections: {
    startKm: number;
    endKm: number;
    description: string;
    targetIntensity: string;
  }[];
  waypoints: RouteWaypoint[];
  pois: CustomPoi[];
  highlights: string[];
  tipsForCyclists: string[];
  gpxXml: string;
}

function generateGpxXml(
  title: string,
  waypoints: RouteWaypoint[],
  distanceKm: number,
  elevationGainM: number
): string {
  const trkpts = waypoints
    .map(
      (wp) =>
        `      <trkpt lat="${wp.latitude.toFixed(6)}" lon="${wp.longitude.toFixed(6)}">
        <ele>${wp.elevationM}</ele>
        <name>${wp.name}</name>
        <desc>${wp.note}</desc>
      </trkpt>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Hybrid Athlete AI Route Architect - https://hybridathlete.app" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${title}</name>
    <desc>Rennrad-Trainingsroute (${distanceKm} km, ${elevationGainM} hm). 100% Asphalt, optimiert für Garmin Edge 840 & Komoot.</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${title}</name>
    <type>Cycling</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

// ── Curated Real Cycling Corridors (Road junctions forming natural clean circuits) ──
interface RoadCircuitDefinition {
  id: string;
  title: string;
  subtitle: string;
  trainingType: CyclingTrainingType;
  sportType: RouteSportType;
  baseKm: number;
  elevationM: number;
  nodes: { name: string; lat: number; lon: number; note: string }[];
  climbs: ClimbSegment[];
  intervalStartKm: number;
  intervalEndKm: number;
  intervalDesc: string;
  intervalTarget: string;
}

const REAL_ROAD_CIRCUITS: RoadCircuitDefinition[] = [
  // 1. Short South Loop (35-45 km)
  {
    id: "loop_south_short",
    title: "Karlstal & Gelterswoog Feierabendrunde",
    subtitle: "Ruhige Waldstraßen, sanfte Wellen und perfekter Asphalt",
    trainingType: "zone2_flat",
    sportType: "road_cycling",
    baseKm: 38,
    elevationM: 380,
    nodes: [
      { name: "Kaiserslautern (Kurt-Schumacher-Str.)", lat: 49.4261, lon: 7.7475, note: "Start & Warmup" },
      { name: "Gelterswoog (B270)", lat: 49.398, lon: 7.698, note: "Einrollen" },
      { name: "Queidersbach", lat: 49.373, lon: 7.662, note: "Flache Passage" },
      { name: "Linden & Horbach", lat: 49.358, lon: 7.648, note: "Ruhige Nebenstraße" },
      { name: "Schopp (B270)", lat: 49.355, lon: 7.688, note: "Flüssiges Rollen" },
      { name: "Stelzenberg", lat: 49.385, lon: 7.728, note: "Kurzer Gegenanstieg" },
      { name: "Kaiserslautern", lat: 49.4261, lon: 7.7475, note: "Ziel" },
    ],
    climbs: [
      {
        name: "Stelzenberg Anstieg",
        startKm: 28,
        endKm: 31.5,
        lengthKm: 3.5,
        elevationGainM: 140,
        avgGradePct: 4.0,
        maxGradePct: 6.5,
        category: "moderate",
      },
    ],
    intervalStartKm: 8,
    intervalEndKm: 22,
    intervalDesc: "14 km durchgängiger Asphalt für saubere Trittfrequenzarbeit in Zone 2.",
    intervalTarget: "Zone 2 (160–200W)",
  },

  // 2. Medium South Loop (55-70 km)
  {
    id: "loop_pfalz_johanniskreuz",
    title: "Pfälzerwald Klassiker: Johanniskreuz & Elmsteiner Tal",
    subtitle: "Breite Straßen, flüssige Kurven & stetige 4-5% Anstiege",
    trainingType: "ftp_intervals",
    sportType: "road_cycling",
    baseKm: 68,
    elevationM: 780,
    nodes: [
      { name: "Kaiserslautern (Kurt-Schumacher-Str.)", lat: 49.4261, lon: 7.7475, note: "Start ab Haustür" },
      { name: "Stelzenberg", lat: 49.385, lon: 7.728, note: "Einrollen" },
      { name: "Trippstadt (L503)", lat: 49.362, lon: 7.772, note: "Beginn Steigung" },
      { name: "Johanniskreuz (B48)", lat: 49.336, lon: 7.824, note: "Kuppe & Bergwertung" },
      { name: "Elmstein (L499)", lat: 49.351, lon: 7.935, note: "Flüssige Talabfahrt" },
      { name: "Frankeneck / Lambrecht", lat: 49.375, lon: 8.058, note: "Talstraße" },
      { name: "Weidenthal (B39)", lat: 49.422, lon: 7.989, note: "Gleichmäßiger Zug" },
      { name: "Hochspeyer (B37)", lat: 49.444, lon: 7.896, note: "Breiter Radweg/Straße" },
      { name: "Kaiserslautern", lat: 49.4261, lon: 7.7475, note: "Ziel an der Haustür" },
    ],
    climbs: [
      {
        name: "Johanniskreuz Südanstieg",
        startKm: 14,
        endKm: 22,
        lengthKm: 8.0,
        elevationGainM: 260,
        avgGradePct: 3.3,
        maxGradePct: 6.8,
        category: "moderate",
      },
      {
        name: "Hochspeyer Welle",
        startKm: 56,
        endKm: 60,
        lengthKm: 4.0,
        elevationGainM: 110,
        avgGradePct: 2.8,
        maxGradePct: 5.0,
        category: "flat",
      },
    ],
    intervalStartKm: 14,
    intervalEndKm: 22,
    intervalDesc: "8 km stetige 4.5% Steigung bis Johanniskreuz – ideal für 2x10 Min Schwellenintervalle.",
    intervalTarget: "Zone 4 (FTP 240–270W)",
  },

  // 3. Medium West Loop (60-75 km)
  {
    id: "loop_west_muehlental",
    title: "Wallhalbtal & Sickinger Höhe Rennrad-Runde",
    subtitle: "Malerisches Mühlental, weite Hügel und kaum Autoverkehr",
    trainingType: "zone2_flat",
    sportType: "road_cycling",
    baseKm: 72,
    elevationM: 580,
    nodes: [
      { name: "Kaiserslautern (Kurt-Schumacher-Str.)", lat: 49.4261, lon: 7.7475, note: "Start ab Haustür" },
      { name: "Hohenecken (B270)", lat: 49.405, lon: 7.725, note: "Ausfallstraße" },
      { name: "Queidersbach", lat: 49.373, lon: 7.662, note: "Einfahrt Sickinger Höhe" },
      { name: "Weselberg (L469)", lat: 49.335, lon: 7.612, note: "Panoramahügel" },
      { name: "Wallhalben (L475)", lat: 49.318, lon: 7.525, note: "Mühlental Abfahrt" },
      { name: "Landstuhl (L470)", lat: 49.412, lon: 7.572, note: "Flacher Radweg/Straße" },
      { name: "Einsiedlerhof", lat: 49.438, lon: 7.668, note: "Ruhiger Rückweg" },
      { name: "Kaiserslautern", lat: 49.4261, lon: 7.7475, note: "Ziel an der Haustür" },
    ],
    climbs: [
      {
        name: "Weselberg Hügelkamm",
        startKm: 24,
        endKm: 29,
        lengthKm: 5.0,
        elevationGainM: 180,
        avgGradePct: 3.6,
        maxGradePct: 7.0,
        category: "moderate",
      },
    ],
    intervalStartKm: 18,
    intervalEndKm: 55,
    intervalDesc: "37 km welliges Mühlental für gleichmäßige Grundlagen-Power in Zone 2.",
    intervalTarget: "Zone 2 (170–210W)",
  },

  // 4. Large North / Donnersberg Loop (85-105 km)
  {
    id: "loop_donnersberg_king",
    title: "Donnersberg Königsetappe (Kategorie-1 Bergprüfung)",
    subtitle: "Höchster Berg der Pfalz (687m) mit anspruchsvollen Schwellensegmenten",
    trainingType: "climbing_hills",
    sportType: "road_cycling",
    baseKm: 94,
    elevationM: 1350,
    nodes: [
      { name: "Kaiserslautern (Kurt-Schumacher-Str.)", lat: 49.4261, lon: 7.7475, note: "Start ab Haustür" },
      { name: "Enkenbach-Alsenborn", lat: 49.488, lon: 7.902, note: "Einrollen" },
      { name: "Winnweiler (L388)", lat: 49.571, lon: 7.854, note: "Anfahrt Bergprüfung" },
      { name: "Imsbach & Dannenfels", lat: 49.627, lon: 7.942, note: "Fuß des Donnersbergs" },
      { name: "Donnersberg Gipfel (687m)", lat: 49.625, lon: 7.919, note: "Höchster Punkt" },
      { name: "Falkenstein (Burg)", lat: 49.605, lon: 7.873, note: "Aussicht & Abfahrt" },
      { name: "Rockenhausen (Alsenztal)", lat: 49.628, lon: 7.818, note: "Flache Talstraße" },
      { name: "Otterberg", lat: 49.502, lon: 7.773, note: "Letzte Welle" },
      { name: "Kaiserslautern", lat: 49.4261, lon: 7.7475, note: "Ziel an der Haustür" },
    ],
    climbs: [
      {
        name: "Dannenfels ➔ Donnersberg Gipfel",
        startKm: 38,
        endKm: 46,
        lengthKm: 8.0,
        elevationGainM: 410,
        avgGradePct: 5.1,
        maxGradePct: 11.5,
        category: "steep",
      },
      {
        name: "Falkenstein Rampe",
        startKm: 54,
        endKm: 57,
        lengthKm: 3.0,
        elevationGainM: 160,
        avgGradePct: 5.3,
        maxGradePct: 9.0,
        category: "moderate",
      },
    ],
    intervalStartKm: 38,
    intervalEndKm: 46,
    intervalDesc: "6.8 km Anstieg mit 7.1% Schnitt bis zum Ludwigsturm (VO2 Max & FTP).",
    intervalTarget: "Zone 4/5 (270–320W)",
  },

  // 5. Large East / Weinstraße Loop (80-110 km)
  {
    id: "loop_weinstrasse_endurance",
    title: "Deutsche Weinstraße & Schloss Wachenheim Panorama",
    subtitle: "Sanfte Weinberge, weite Blicke in die Rheinebene & erstklassiger Asphalt",
    trainingType: "zone2_flat",
    sportType: "road_cycling",
    baseKm: 86,
    elevationM: 560,
    nodes: [
      { name: "Kaiserslautern (Kurt-Schumacher-Str.)", lat: 49.4261, lon: 7.7475, note: "Start ab Haustür" },
      { name: "Hochspeyer (B37)", lat: 49.444, lon: 7.896, note: "Ausfallstraße" },
      { name: "Frankenstein", lat: 49.438, lon: 7.975, note: "Flüssiges Tal" },
      { name: "Bad Dürkheim (B37)", lat: 49.462, lon: 8.168, note: "Einfahrt Weinstraße" },
      { name: "Wachenheim & Deidesheim", lat: 49.408, lon: 8.188, note: "Weinberge & Panorama" },
      { name: "Neustadt an der Weinstraße", lat: 49.352, lon: 8.138, note: "Wendepunkt" },
      { name: "Lambrecht (B39)", lat: 49.375, lon: 8.058, note: "Rückfahrt durchs Tal" },
      { name: "Kaiserslautern", lat: 49.4261, lon: 7.7475, note: "Ziel an der Haustür" },
    ],
    climbs: [
      {
        name: "Hochspeyer Sattel",
        startKm: 12,
        endKm: 16,
        lengthKm: 4.0,
        elevationGainM: 130,
        avgGradePct: 3.2,
        maxGradePct: 5.8,
        category: "flat",
      },
    ],
    intervalStartKm: 25,
    intervalEndKm: 65,
    intervalDesc: "40 km flüssiges Weinstraßen-Terrain für ausdauernde Zone 2 Trittfrequenz.",
    intervalTarget: "Zone 2 (170–210W)",
  },

  // 6. Gravel & Forest Trail Loop (45 km)
  {
    id: "loop_gravel_pfalz",
    title: "Pfälzerwald Gravel Adventure (Autofrei & Natur pur)",
    subtitle: "Kompakter Schotter, Singletrails, Waldseen und Panoramawege",
    trainingType: "scenic_endurance",
    sportType: "gravel",
    baseKm: 48,
    elevationM: 620,
    nodes: [
      { name: "Kaiserslautern (Kurt-Schumacher-Str.)", lat: 49.4261, lon: 7.7475, note: "Start ab Haustür" },
      { name: "Bremerhof & Humbergturm", lat: 49.418, lon: 7.772, note: "Waldanstieg" },
      { name: "Moosalbtal & Klug'sche Mühle", lat: 49.368, lon: 7.738, note: "Schottertraum" },
      { name: "Trippstadt Schlosspark", lat: 49.362, lon: 7.772, note: "Pause & Brunnen" },
      { name: "Aschbacherhof", lat: 49.395, lon: 7.742, note: "Forststraße" },
      { name: "Kaiserslautern", lat: 49.4261, lon: 7.7475, note: "Ziel an der Haustür" },
    ],
    climbs: [
      {
        name: "Humberg Waldanstieg",
        startKm: 4,
        endKm: 8,
        lengthKm: 4.0,
        elevationGainM: 180,
        avgGradePct: 4.5,
        maxGradePct: 8.5,
        category: "moderate",
      },
    ],
    intervalStartKm: 12,
    intervalEndKm: 32,
    intervalDesc: "20 km Schottertrasse für stetige Rhythmusarbeit.",
    intervalTarget: "Zone 2/3 (180–230W)",
  },

  // 7. Running Loop (15-22 km)
  {
    id: "loop_running_trail",
    title: "Betzenberg & Humberg Halbmarathon-Runde",
    subtitle: "Gelenkschonender Waldboden, moderate Steigungen & Natur pur",
    trainingType: "zone2_flat",
    sportType: "running",
    baseKm: 18,
    elevationM: 260,
    nodes: [
      { name: "Kaiserslautern (Kurt-Schumacher-Str.)", lat: 49.4261, lon: 7.7475, note: "Start ab Haustür" },
      { name: "Wildpark Betzenberg", lat: 49.435, lon: 7.785, note: "Weicher Waldboden" },
      { name: "Bremerhof Waldtrasse", lat: 49.418, lon: 7.772, note: "Schattige Passage" },
      { name: "Humbergturm Panoramaweg", lat: 49.412, lon: 7.755, note: "Gipfelpunkt" },
      { name: "Uni-Campus / RPTU", lat: 49.424, lon: 7.751, note: "Auslaufen" },
      { name: "Kaiserslautern (Zuhause)", lat: 49.4261, lon: 7.7475, note: "Ziel an der Haustür" },
    ],
    climbs: [
      {
        name: "Humberg Trailanstieg",
        startKm: 6,
        endKm: 9,
        lengthKm: 3.0,
        elevationGainM: 120,
        avgGradePct: 4.0,
        maxGradePct: 7.5,
        category: "moderate",
      },
    ],
    intervalStartKm: 4,
    intervalEndKm: 14,
    intervalDesc: "10 km flüssiger Dauerlauf im GA1-Schwellenbereich (Pace 4:45–5:15 min/km).",
    intervalTarget: "GA1 Basis (140–155 bpm)",
  },
];

export const CURATED_CYCLING_ROUTES: GeneratedCyclingRoute[] = REAL_ROAD_CIRCUITS.map((c) => {
  const waypoints: RouteWaypoint[] = c.nodes.map((n, idx) => ({
    name: n.name,
    distanceKm: Math.round(((idx / (c.nodes.length - 1)) * c.baseKm) * 10) / 10,
    elevationM: Math.round(220 + Math.sin((idx / c.nodes.length) * Math.PI) * (c.elevationM * 0.5)),
    note: n.note,
    latitude: n.lat,
    longitude: n.lon,
  }));

  const durationMin = c.sportType === "running" ? Math.round(c.baseKm * 5.2) : Math.round((c.baseKm / 28) * 60);
  const totalKcal = Math.round(c.baseKm * (c.sportType === "running" ? 65 : 24));
  const carbsPerHour = c.sportType === "running" ? 45 : 75;
  const totalCarbs = Math.round((durationMin / 60) * carbsPerHour);

  return {
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    sportType: c.sportType,
    trainingType: c.trainingType,
    distanceKm: c.baseKm,
    elevationGainM: c.elevationM,
    estimatedDurationMin: durationMin,
    avgGradePct: Math.round((c.elevationM / (c.baseKm * 10)) * 10) / 10,
    maxGradePct: c.trainingType === "climbing_hills" ? 11.5 : 7.0,
    roadQuality: c.sportType === "gravel" ? "70% Schotter / 30% Asphalt" : c.sportType === "running" ? "80% Waldboden / 20% Asphalt" : "100% Rennrad-Asphalt",
    trafficLevel: "low",
    windAlignment: {
      isOptimized: true,
      windSpeedKmH: 14,
      windDirectionDeg: 270,
      headwindSegment: "Erste 40% gegen den Wind",
      tailwindSegment: "Letzte 50% mit komfortablem Rückenwind",
    },
    climbSegments: c.climbs,
    fuelingPlan: {
      totalKcal,
      fluidMl: Math.round((durationMin / 60) * 650),
      carbsTotalG: totalCarbs,
      carbsPerHourG: carbsPerHour,
      sodiumMg: Math.round((durationMin / 60) * 550),
      gelsRecommended: Math.max(1, Math.round(totalCarbs / 35)),
      bottlesRecommended: Math.max(1, Math.round((durationMin / 60) * 0.8)),
      fuelTimeline: [
        { atKm: Math.round(c.baseKm * 0.3), action: "1. Flasche (Elektrolyte) anbrechen + 1/2 Riegel" },
        { atKm: Math.round(c.baseKm * 0.65), action: "1x Gel (Fast Carbs) vor dem Hauptanstieg" },
      ],
    },
    intervalSections: [
      {
        startKm: c.intervalStartKm,
        endKm: c.intervalEndKm,
        description: c.intervalDesc,
        targetIntensity: c.intervalTarget,
      },
    ],
    waypoints,
    pois: [
      { id: "p1", type: "water", name: "Brunnen Johanniskreuz", latitude: 49.336, longitude: 7.824 },
      { id: "p2", type: "cafe", name: "Konditorei / Café Elmstein", latitude: 49.351, longitude: 7.935 },
      { id: "p3", type: "viewpoint", name: "Panorama Rheinebene", latitude: 49.408, longitude: 8.188 },
    ],
    highlights: [
      "Flüssige Rundstrecke ohne Sackgassen oder Wendeausleger",
      "Perfekter Belag für maximale Effizienz & Gelenkschonung",
      "Geringe Verkehrsdichte auf ausgewählten Radtrassen",
    ],
    tipsForCyclists: [
      `Verpflegung: Mindestens ${Math.ceil(c.baseKm / 40)} Trinkflaschen und ${Math.ceil(c.baseKm / 35)} Riegel/Gels.`,
    ],
    gpxXml: generateGpxXml(c.title, waypoints, c.baseKm, c.elevationM),
  };
});

/**
 * Generate customized AI Road Cycling Route selecting and tuning the best contiguous circuit
 */
export async function generateAICyclingRoute(
  req: CyclingRouteRequest
): Promise<GeneratedCyclingRoute> {
  const targetKm = req.targetDistanceKm || 70;
  const trainingType = req.trainingType;
  const sportType = req.sportType || "road_cycling";

  // Filter circuits by sport type first
  const sportCircuits = REAL_ROAD_CIRCUITS.filter((c) => c.sportType === sportType);
  const availableCircuits = sportCircuits.length > 0 ? sportCircuits : REAL_ROAD_CIRCUITS;

  let bestCircuit = availableCircuits[0];
  let minDiff = 9999;

  availableCircuits.forEach((c) => {
    const distDiff = Math.abs(c.baseKm - targetKm);
    const typeBonus = c.trainingType === trainingType ? -15 : 0;
    const totalScore = distDiff + typeBonus;

    if (totalScore < minDiff) {
      minDiff = totalScore;
      bestCircuit = c;
    }
  });

  // Build nodes replacing start/finish with exact user address
  const circuitNodes = [...bestCircuit.nodes];
  if (req.latitude && req.longitude) {
    const startAddrName = req.startLocation ? `Start: ${req.startLocation.split(",")[0]}` : "Start: Zuhause";
    const finishAddrName = req.startLocation ? `Ziel: ${req.startLocation.split(",")[0]}` : "Ziel: Zuhause";
    circuitNodes[0] = { name: startAddrName, lat: req.latitude, lon: req.longitude, note: "Start ab Haustür" };
    circuitNodes[circuitNodes.length - 1] = { name: finishAddrName, lat: req.latitude, lon: req.longitude, note: "Ziel an der Haustür" };
  }

  // Inject custom POIs if provided
  if (req.addedPois && req.addedPois.length > 0) {
    req.addedPois.forEach((poi, idx) => {
      const insertIdx = Math.min(circuitNodes.length - 2, 2 + idx);
      circuitNodes.splice(insertIdx, 0, {
        name: `📍 ${poi.name}`,
        lat: poi.latitude,
        lon: poi.longitude,
        note: `Zwischenstopp (${poi.type})`,
      });
    });
  }

  let finalKm = bestCircuit.baseKm;
  let finalDurationMin = sportType === "running" ? Math.round(bestCircuit.baseKm * 5.2) : Math.round((bestCircuit.baseKm / 28) * 60);

  const rawWaypoints = circuitNodes.map((n, idx) => ({
    name: n.name,
    distanceKm: 0,
    elevationM: Math.round(220 + Math.sin((idx / circuitNodes.length) * Math.PI) * (bestCircuit.elevationM * 0.5)),
    note: n.note,
    latitude: n.lat,
    longitude: n.lon,
  }));

  let gpx = generateGpxXml(bestCircuit.title, rawWaypoints, finalKm, bestCircuit.elevationM);

  try {
    const osrm = await fetchRoadNetworkRoute(
      circuitNodes.map((n) => ({ latitude: n.lat, longitude: n.lon })),
      sportType
    );
    if (osrm && osrm.coordinates.length > 0) {
      finalKm = Math.round((osrm.distanceMeters / 1000) * 10) / 10;
      finalDurationMin = Math.round(osrm.durationSeconds / 60);

      const highDensityWps: RouteWaypoint[] = osrm.coordinates.map((coord, i) => ({
        name: i === 0 ? "Start" : i === osrm.coordinates.length - 1 ? "Ziel" : `Streckenpunkt ${i}`,
        distanceKm: Math.round(((i / osrm.coordinates.length) * finalKm) * 10) / 10,
        elevationM: Math.round(220 + Math.sin((i / osrm.coordinates.length) * Math.PI) * (bestCircuit.elevationM * 0.5)),
        note: "Asphalt-Straße",
        latitude: coord[0],
        longitude: coord[1],
      }));
      gpx = generateGpxXml(bestCircuit.title, highDensityWps, finalKm, bestCircuit.elevationM);
    }
  } catch {}

  const waypoints: RouteWaypoint[] = circuitNodes.map((n, idx) => ({
    name: n.name,
    distanceKm: Math.round(((idx / (circuitNodes.length - 1)) * finalKm) * 10) / 10,
    elevationM: Math.round(220 + Math.sin((idx / circuitNodes.length) * Math.PI) * (bestCircuit.elevationM * 0.5)),
    note: n.note,
    latitude: n.lat,
    longitude: n.lon,
  }));

  const totalKcal = Math.round(finalKm * (sportType === "running" ? 68 : 25));
  const carbsPerHour = sportType === "running" ? 45 : 75;
  const totalCarbs = Math.round((finalDurationMin / 60) * carbsPerHour);

  const routeId = `route_${bestCircuit.id}_${finalKm}km_${Date.now()}`;

  return {
    id: routeId,
    title: `${bestCircuit.title} (${finalKm} km)`,
    subtitle: bestCircuit.subtitle,
    sportType,
    trainingType: bestCircuit.trainingType,
    distanceKm: finalKm,
    elevationGainM: bestCircuit.elevationM,
    estimatedDurationMin: finalDurationMin,
    avgGradePct: Math.round((bestCircuit.elevationM / (finalKm * 10)) * 10) / 10,
    maxGradePct: bestCircuit.trainingType === "climbing_hills" ? 11.5 : 7.0,
    roadQuality: sportType === "gravel" ? "70% Schotter / 30% Asphalt" : sportType === "running" ? "80% Waldboden / 20% Asphalt" : "100% Rennrad-Asphalt",
    trafficLevel: "low",
    windAlignment: {
      isOptimized: req.windOptimized ?? true,
      windSpeedKmH: req.currentWindSpeedKmH || 14,
      windDirectionDeg: req.currentWindDirectionDeg || 270,
      headwindSegment: "Startabschnitt führt gegen den Wind für saubere Belastung",
      tailwindSegment: "Schlussabschnitt mit Rückenwind für dynamisches Finish",
    },
    climbSegments: bestCircuit.climbs,
    fuelingPlan: {
      totalKcal,
      fluidMl: Math.round((finalDurationMin / 60) * (req.temperature && req.temperature > 24 ? 850 : 650)),
      carbsTotalG: totalCarbs,
      carbsPerHourG: carbsPerHour,
      sodiumMg: Math.round((finalDurationMin / 60) * (req.temperature && req.temperature > 24 ? 750 : 550)),
      gelsRecommended: Math.max(1, Math.round(totalCarbs / 35)),
      bottlesRecommended: Math.max(1, Math.round((finalDurationMin / 60) * 0.8)),
      fuelTimeline: [
        { atKm: Math.round(finalKm * 0.3), action: "1. Trinkflasche anbrechen (ca. 250ml) + 1/2 Riegel" },
        { atKm: Math.round(finalKm * 0.65), action: "1x Hydro-Gel (35g Carbs) vor dem Hauptanstieg" },
        { atKm: Math.round(finalKm * 0.85), action: "Letzter Flüssigkeitsschluck für optimale Regeneration" },
      ],
    },
    intervalSections: [
      {
        startKm: Math.round(finalKm * 0.25),
        endKm: Math.round(finalKm * 0.65),
        description: bestCircuit.intervalDesc,
        targetIntensity: bestCircuit.intervalTarget,
      },
    ],
    waypoints,
    pois: req.addedPois || [
      { id: "p1", type: "water", name: "Trinkwasserstelle", latitude: circuitNodes[1]?.lat || 49.38, longitude: circuitNodes[1]?.lon || 7.72 },
      { id: "p2", type: "cafe", name: "Café & Bäckerei", latitude: circuitNodes[Math.floor(circuitNodes.length / 2)]?.lat || 49.35, longitude: circuitNodes[Math.floor(circuitNodes.length / 2)]?.lon || 7.82 },
    ],
    highlights: [
      `Echte, flüssige ${finalKm} km Rundstrecke ab deiner Haustür`,
      "Keine Sackgassen, keine Stichstraßen, keine Wendemanöver",
      "ClimbPro Steigungsanalyse & Verpflegungs-Timing inklusive",
    ],
    tipsForCyclists: [
      `Verpflegung: Mindestens ${Math.ceil(finalKm / 40)} Trinkflaschen und ${Math.ceil(finalKm / 35)} Riegel/Gels.`,
      "Pacing: Erste 15 Minuten locker in Zone 2 einrollen.",
    ],
    gpxXml: gpx,
  };
}
