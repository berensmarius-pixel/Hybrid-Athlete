// ─── Open-Meteo Weather & Outdoor Performance Service ─────────────────────────

export interface HourlyWeatherPoint {
  time: string; // "14:00"
  fullIso: string;
  temperature: number; // °C
  feelsLike: number; // °C
  precipitationProbability: number; // %
  rainMm: number;
  windSpeedKmH: number;
  windGustsKmH: number;
  uvIndex: number;
  weatherCode: number;
  weatherDescription: string;
  weatherIcon: "sun" | "cloud-sun" | "cloud" | "rain" | "storm" | "snow";
  outdoorSuitability: "optimal" | "good" | "moderate" | "poor";
}

export interface WeatherData {
  city: string;
  latitude: number;
  longitude: number;
  current: {
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeedKmH: number;
    windGustsKmH: number;
    windDirectionDeg: number;
    uvIndex: number;
    precipitationProbability: number;
    weatherCode: number;
    weatherDescription: string;
    weatherIcon: "sun" | "cloud-sun" | "cloud" | "rain" | "storm" | "snow";
    sunrise: string;
    sunset: string;
    daylightRemainingHours: number;
  };
  hourly: HourlyWeatherPoint[];
  bestCyclingWindow: {
    start: string;
    end: string;
    avgTemp: number;
    reason: string;
  };
  bestRunningWindow: {
    start: string;
    end: string;
    avgTemp: number;
    reason: string;
  };
  fetchedAt: string;
}

const WEATHER_CACHE_KEY = "hybrid_athlete_weather_cache";
const LOCATION_STORAGE_KEY = "hybrid_athlete_saved_location";

// Default location (e.g., Kaiserslautern / Germany coordinates)
export const DEFAULT_LOCATION = {
  city: "Kaiserslautern",
  latitude: 49.4447,
  longitude: 7.769,
};

function mapWmoCode(code: number): {
  description: string;
  icon: "sun" | "cloud-sun" | "cloud" | "rain" | "storm" | "snow";
} {
  if (code === 0) return { description: "Klarer Himmel / Sonnig", icon: "sun" };
  if (code === 1 || code === 2) return { description: "Heiter bis wolkig", icon: "cloud-sun" };
  if (code === 3) return { description: "Bedeckt", icon: "cloud" };
  if (code >= 45 && code <= 48) return { description: "Nebelig", icon: "cloud" };
  if (code >= 51 && code <= 55) return { description: "Leichter Nieselregen", icon: "rain" };
  if (code >= 61 && code <= 65) return { description: "Regen", icon: "rain" };
  if (code >= 71 && code <= 77) return { description: "Schneefall", icon: "snow" };
  if (code >= 80 && code <= 82) return { description: "Regenschauer", icon: "rain" };
  if (code >= 95) return { description: "Gewitter", icon: "storm" };
  return { description: "Wechselhaft", icon: "cloud-sun" };
}

function evaluateOutdoorSuitability(temp: number, rainProb: number, windKmH: number): "optimal" | "good" | "moderate" | "poor" {
  if (rainProb > 50 || windKmH > 40 || temp < 0 || temp > 34) return "poor";
  if (rainProb > 25 || windKmH > 25 || temp < 5 || temp > 28) return "moderate";
  if (temp >= 14 && temp <= 23 && rainProb < 15 && windKmH < 18) return "optimal";
  return "good";
}

export async function fetchLiveWeather(
  latitude = DEFAULT_LOCATION.latitude,
  longitude = DEFAULT_LOCATION.longitude,
  cityName = DEFAULT_LOCATION.city
): Promise<WeatherData> {
  // Check local cache if fresher than 20 minutes
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(WEATHER_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as WeatherData;
        const age = Date.now() - new Date(parsed.fetchedAt).getTime();
        if (age < 20 * 60 * 1000 && Math.abs(parsed.latitude - latitude) < 0.05) {
          return parsed;
        }
      }
    } catch {}
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index&hourly=temperature_2m,apparent_temperature,precipitation_probability,rain,weather_code,wind_speed_10m,wind_gusts_10m,uv_index&daily=sunrise,sunset&timezone=auto&forecast_days=2`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Wetterdaten konnten nicht von Open-Meteo geladen werden");

  const data = await res.json();
  const current = data.current;
  const hourly = data.hourly;
  const daily = data.daily;

  const curWmo = mapWmoCode(current.weather_code || 0);

  // Sunrise / Sunset calculation
  const sunriseStr = daily?.sunrise?.[0]?.split("T")?.[1]?.substring(0, 5) || "06:15";
  const sunsetIso = daily?.sunset?.[0] || new Date().toISOString();
  const sunsetStr = sunsetIso.split("T")?.[1]?.substring(0, 5) || "20:30";

  const sunsetDate = new Date(sunsetIso);
  const now = new Date();
  const diffHours = Math.max(0, (sunsetDate.getTime() - now.getTime()) / (1000 * 3600));

  // Hourly points for the next 12 hours
  const hourlyPoints: HourlyWeatherPoint[] = [];
  const currentHour = now.getHours();

  for (let i = currentHour; i < Math.min(currentHour + 14, hourly.time.length); i++) {
    const timeIso = hourly.time[i];
    const hourLabel = timeIso.split("T")[1]?.substring(0, 5) || "00:00";
    const temp = Math.round(hourly.temperature_2m[i]);
    const feels = Math.round(hourly.apparent_temperature[i]);
    const rainProb = hourly.precipitation_probability?.[i] || 0;
    const rainAmount = hourly.rain?.[i] || 0;
    const wind = Math.round(hourly.wind_speed_10m[i]);
    const gusts = Math.round(hourly.wind_gusts_10m[i]);
    const uv = Math.round((hourly.uv_index?.[i] || 0) * 10) / 10;
    const wCode = hourly.weather_code[i];
    const wMeta = mapWmoCode(wCode);

    hourlyPoints.push({
      time: hourLabel,
      fullIso: timeIso,
      temperature: temp,
      feelsLike: feels,
      precipitationProbability: rainProb,
      rainMm: rainAmount,
      windSpeedKmH: wind,
      windGustsKmH: gusts,
      uvIndex: uv,
      weatherCode: wCode,
      weatherDescription: wMeta.description,
      weatherIcon: wMeta.icon,
      outdoorSuitability: evaluateOutdoorSuitability(temp, rainProb, wind),
    });
  }

  // Determine best outdoor cycling & running windows
  const optimalPoints = hourlyPoints.filter((p) => p.outdoorSuitability === "optimal" || p.outdoorSuitability === "good");
  const bestPoint = optimalPoints.length > 0 ? optimalPoints[0] : hourlyPoints[0];

  const result: WeatherData = {
    city: cityName,
    latitude,
    longitude,
    current: {
      temperature: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      humidity: current.relative_humidity_2m,
      windSpeedKmH: Math.round(current.wind_speed_10m),
      windGustsKmH: Math.round(current.wind_gusts_10m),
      windDirectionDeg: current.wind_direction_10m,
      uvIndex: Math.round((current.uv_index || 0) * 10) / 10,
      precipitationProbability: hourly.precipitation_probability?.[currentHour] || 0,
      weatherCode: current.weather_code,
      weatherDescription: curWmo.description,
      weatherIcon: curWmo.icon,
      sunrise: sunriseStr,
      sunset: sunsetStr,
      daylightRemainingHours: Math.round(diffHours * 10) / 10,
    },
    hourly: hourlyPoints,
    bestCyclingWindow: {
      start: bestPoint ? bestPoint.time : "16:00",
      end: bestPoint ? `${parseInt(bestPoint.time.split(":")[0]) + 2}:00` : "18:00",
      avgTemp: bestPoint ? bestPoint.temperature : 20,
      reason: bestPoint?.outdoorSuitability === "optimal"
        ? "Optimale Bedingungen: Trocken, milde Temperaturen & schwacher Wind"
        : "Beste verfügbare Bedingungen für heute",
    },
    bestRunningWindow: {
      start: bestPoint ? bestPoint.time : "17:00",
      end: bestPoint ? `${parseInt(bestPoint.time.split(":")[0]) + 1}:30` : "18:30",
      avgTemp: bestPoint ? bestPoint.temperature : 20,
      reason: "Guter Temperaturbereich für Zone 2 und Schwellenintervalle",
    },
    fetchedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(result));
    } catch {}
  }

  return result;
}

export function getSavedLocation(): { city: string; latitude: number; longitude: number } {
  if (typeof window === "undefined") return DEFAULT_LOCATION;
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_LOCATION;
}

export function saveLocation(loc: { city: string; latitude: number; longitude: number }): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc));
}
