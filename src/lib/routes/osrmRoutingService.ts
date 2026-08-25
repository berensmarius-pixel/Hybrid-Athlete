// ─── OSRM (Open Source Routing Machine) Road-Snapping Service ─────────────────

export interface OsrmRouteResult {
  coordinates: [number, number][]; // [latitude, longitude][]
  distanceMeters: number;
  durationSeconds: number;
  steps: {
    instruction: string;
    distanceM: number;
    name: string;
  }[];
}

export type RouteSportMode = "road_cycling" | "gravel" | "running";

/**
 * Routes through waypoints strictly following the OpenStreetMap road & cycling network
 */
export async function fetchRoadNetworkRoute(
  waypoints: { latitude: number; longitude: number }[],
  sport: RouteSportMode = "road_cycling"
): Promise<OsrmRouteResult | null> {
  if (!waypoints || waypoints.length < 2) return null;

  try {
    // Format: lon,lat;lon,lat;...
    const coordsStr = waypoints
      .map((wp) => `${wp.longitude.toFixed(6)},${wp.latitude.toFixed(6)}`)
      .join(";");

    // Profile: cycling for bikes, foot for running
    const profile = sport === "running" ? "foot" : "cycling";
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsStr}?overview=full&geometries=geojson&steps=true`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM Routing failed");

    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;

    const primaryRoute = data.routes[0];
    // GeoJSON coordinates are [lon, lat] -> convert to [lat, lon] for Leaflet
    const latLngCoordinates: [number, number][] = primaryRoute.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]]
    );

    const steps: { instruction: string; distanceM: number; name: string }[] = [];
    interface OsrmStep {
      name?: string;
      distance?: number;
      maneuver?: { type?: string; modifier?: string };
    }
    interface OsrmLeg {
      steps?: OsrmStep[];
    }
    if (primaryRoute.legs) {
      (primaryRoute.legs as OsrmLeg[]).forEach((leg) => {
        if (leg.steps) {
          leg.steps.forEach((step) => {
            if (step.name || step.maneuver?.type) {
              steps.push({
                instruction: step.maneuver?.modifier
                  ? `${step.maneuver.type} (${step.maneuver.modifier})`
                  : step.maneuver?.type || "Weiterfahren",
                distanceM: Math.round(step.distance ?? 0),
                name: step.name || "Landstraße / Radweg",
              });
            }
          });
        }
      });
    }

    return {
      coordinates: latLngCoordinates,
      distanceMeters: primaryRoute.distance,
      durationSeconds: primaryRoute.duration,
      steps,
    };
  } catch (err) {
    console.warn("OSRM road routing error, falling back to direct points:", err);
    return null;
  }
}
