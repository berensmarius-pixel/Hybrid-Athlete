import type { StravaActivity } from "@/types";

/**
 * Dummy activities that mirror the real Strava API JSON shape.
 * These are used when STRAVA_ACCESS_TOKEN is not configured or
 * when the API call is in demo mode.
 */
export const MOCK_STRAVA_ACTIVITIES: StravaActivity[] = [
  {
    id: 10001,
    name: "Morgen-Intervalle",
    type: "Run",
    sport_type: "Run",
    start_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    start_date_local: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    distance: 8_420,        // 8.42 km
    moving_time: 2_580,     // 43 min
    elapsed_time: 2_640,
    average_heartrate: 158,
    max_heartrate: 178,
    average_speed: 3.26,    // m/s ≈ 5:06/km
    total_elevation_gain: 54,
  },
  {
    id: 10002,
    name: "Radausfahrt – langer GA1",
    type: "Ride",
    sport_type: "Ride",
    start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    start_date_local: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    distance: 52_300,       // 52.3 km
    moving_time: 6_900,     // 1h 55min
    elapsed_time: 7_200,
    average_heartrate: 138,
    max_heartrate: 162,
    average_speed: 7.58,    // m/s ≈ 27.3 km/h
    total_elevation_gain: 380,
  },
  {
    id: 10003,
    name: "Leichter Dauerlauf",
    type: "Run",
    sport_type: "Run",
    start_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    start_date_local: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    distance: 6_100,        // 6.1 km
    moving_time: 2_040,     // 34 min
    elapsed_time: 2_100,
    average_heartrate: 143,
    max_heartrate: 158,
    average_speed: 2.99,    // m/s ≈ 5:34/km
    total_elevation_gain: 32,
  },
  {
    id: 10004,
    name: "Radtraining – Schwellenwert",
    type: "Ride",
    sport_type: "Ride",
    start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    start_date_local: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    distance: 38_900,       // 38.9 km
    moving_time: 4_500,     // 1h 15min
    elapsed_time: 4_680,
    average_heartrate: 165,
    max_heartrate: 181,
    average_speed: 8.64,    // m/s ≈ 31.1 km/h
    total_elevation_gain: 210,
  },
  {
    id: 10005,
    name: "Sonntags-Longrun",
    type: "Run",
    sport_type: "Run",
    start_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    start_date_local: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    distance: 14_800,       // 14.8 km
    moving_time: 4_980,     // 1h 23min
    elapsed_time: 5_040,
    average_heartrate: 151,
    max_heartrate: 169,
    average_speed: 2.97,    // m/s ≈ 5:37/km
    total_elevation_gain: 120,
  },
];
