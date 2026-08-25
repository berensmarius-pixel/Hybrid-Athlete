// ─── OpenStreetMap Nominatim Geocoding Service ───────────────────────────────

import { readStoredJson, writeState } from "@/lib/persistence/stateStore";

export interface LocationSearchResult {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
}

/**
 * Search city coordinates using OpenStreetMap Nominatim API (Free, open)
 */
export async function searchCities(query: string): Promise<LocationSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query.trim()
    )}&limit=5&addressdetails=1`;

    const res = await fetch(url, {
      headers: {
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });

    if (!res.ok) return [];
    const data = await res.json();

    return data.map((item: any) => ({
      name: item.name || item.display_name.split(",")[0],
      displayName: item.display_name,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    }));
  } catch {
    return [];
  }
}

/**
 * Reverse geocode GPS coordinates to city name
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "de-DE,de;q=0.9" },
    });
    if (!res.ok) return "Dein Standort";
    const data = await res.json();
    const city =
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.municipality ||
      data.name ||
      "Dein Standort";
    return city;
  } catch {
    return "Dein Standort";
  }
}

const HOME_ADDRESS_STORAGE_KEY = "hybrid_athlete_home_address";

export const DEFAULT_HOME_ADDRESS: LocationSearchResult = {
  name: "Kurt-Schumacher-Straße 64, Kaiserslautern",
  displayName: "Kurt-Schumacher-Straße 64, 67663 Kaiserslautern, Deutschland",
  latitude: 49.4261,
  longitude: 7.7475,
};

export function getSavedHomeAddress(): LocationSearchResult {
  if (typeof window === "undefined") return DEFAULT_HOME_ADDRESS;
  return readStoredJson<LocationSearchResult>(HOME_ADDRESS_STORAGE_KEY, DEFAULT_HOME_ADDRESS);
}

export function saveHomeAddress(addr: LocationSearchResult): void {
  if (typeof window === "undefined") return;
  writeState(HOME_ADDRESS_STORAGE_KEY, addr);
}

/**
 * Geocodes an exact street address or city to lat/lon
 */
export async function geocodeAddress(addressStr: string): Promise<LocationSearchResult | null> {
  if (!addressStr || addressStr.trim().length < 3) return null;
  const results = await searchCities(addressStr);
  if (results.length > 0) return results[0];
  return null;
}
