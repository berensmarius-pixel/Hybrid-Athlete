// ─── Wger REST API v2 helpers ─────────────────────────────────────────────────
// Docs: https://wger.de/api/v2/
// Language IDs: 1 = Deutsch, 2 = English
//
// Offline-First: Suchergebnisse & Übungs-Details werden im IndexedDB-Cache
// (Store "exercises") gehalten – Stale-While-Revalidate. Offline wird der
// letzte bekannte Stand ausgeliefert.

import {
  exerciseInfoCacheKey,
  exerciseSearchCacheKey,
  getCachedExercise,
  putCachedExercise,
} from "@/lib/offline/db";

export const WGER_BASE = "https://wger.de";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WgerSuggestion {
  value: string;
  data: {
    id: number;           // translation ID
    base_id: number;      // exercise base ID – use for exerciseinfo
    name: string;
    category: string;     // English, e.g. "Chest", "Legs"
    image: string | null; // relative path, e.g. "/media/exercise-images/..."
    image_thumbnail: string | null;
  };
}

export interface WgerExerciseInfo {
  wgerId: number;
  name: string;         // German preferred, English fallback
  description: string;  // plain text, stripped of HTML
  muscleGroup: string;  // German, e.g. "Brust", "Beine"
  muscles: string[];    // e.g. ["Pectoralis major", "Triceps brachii"]
  imageUrl: string | null;
}

// ─── Category → German ────────────────────────────────────────────────────────

export const CATEGORY_DE: Record<string, string> = {
  Arms: "Arme",
  Legs: "Beine",
  Abs: "Bauch",
  Chest: "Brust",
  Back: "Rücken",
  Shoulders: "Schultern",
  Calves: "Waden",
  Cardio: "Cardio",
  Neck: "Nacken",
  Glutes: "Gesäß",
};

// Color classes keyed by English category name (as returned by the search API)
export const CATEGORY_COLORS: Record<string, string> = {
  Chest:     "text-rose-400 bg-rose-500/10 border-rose-500/25",
  Legs:      "text-blue-400 bg-blue-500/10 border-blue-500/25",
  Back:      "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
  Shoulders: "text-amber-400 bg-amber-500/10 border-amber-500/25",
  Arms:      "text-violet-400 bg-violet-500/10 border-violet-500/25",
  Abs:       "text-orange-400 bg-orange-500/10 border-orange-500/25",
  Calves:    "text-cyan-400 bg-cyan-500/10 border-cyan-500/25",
  Cardio:    "text-pink-400 bg-pink-500/10 border-pink-500/25",
  Neck:      "text-zinc-400 bg-zinc-500/10 border-zinc-500/25",
  Glutes:    "text-lime-400 bg-lime-500/10 border-lime-500/25",
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Full-text search across exercises in German + English.
 * Returns up to 8 suggestions. Cached in IndexedDB (offline-first).
 */
export async function searchWgerExercises(term: string): Promise<WgerSuggestion[]> {
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const cacheKey = exerciseSearchCacheKey(trimmed);

  // 1. Frischer Cache → sofort liefern (kein Netzwerk-Traffic)
  const cached = await getCachedExercise<WgerSuggestion[]>(cacheKey);
  if (cached?.fresh && cached.data.length > 0) return cached.data;

  // 2. Netzwerk (nur wenn online sinnvoll) …
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (online) {
    // Wger's search endpoint accepts a single `language` param; we query German
    // but results already include German-named exercises by default.
    const url =
      `${WGER_BASE}/api/v2/exercise/search/` +
      `?term=${encodeURIComponent(trimmed)}&language=de&format=json`;

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const suggestions = ((data.suggestions ?? []) as WgerSuggestion[]).slice(0, 8);
        void putCachedExercise(cacheKey, suggestions);
        return suggestions;
      }
    } catch { /* fällt auf Cache durch */ }
  }

  // 3. Offline / Netzwerk-Fehler → letzter bekannter Stand
  return cached?.data ?? [];
}

/**
 * Fetch detailed exercise info by base_id.
 * Prefers German translation (language 1), falls back to English (language 2).
 * Cached in IndexedDB – Übungs-Details bleiben offline verfügbar.
 */
export async function fetchWgerExerciseInfo(
  baseId: number
): Promise<WgerExerciseInfo | null> {
  const cacheKey = exerciseInfoCacheKey(baseId);
  const cached = await getCachedExercise<WgerExerciseInfo>(cacheKey);

  // Frischer Cache → sofort liefern (Übungsdaten ändern sich praktisch nie)
  if (cached?.fresh) return cached.data;

  const url = `${WGER_BASE}/api/v2/exerciseinfo/${baseId}/?format=json`;

  try {
    const res = await fetch(url, { cache: "force-cache" }); // exercise data rarely changes
    if (!res.ok) return cached?.data ?? null;
    const data = await res.json();

    const translations: Array<{
      language: number;
      name: string;
      description: string;
    }> = data.translations ?? [];

    const german  = translations.find((t) => t.language === 1);
    const english = translations.find((t) => t.language === 2);
    const preferred = german ?? english;

    const name        = preferred?.name ?? "";
    const description = stripHtml(preferred?.description ?? "");

    const categoryEn  = (data.category?.name ?? "") as string;
    const muscleGroup = CATEGORY_DE[categoryEn] ?? categoryEn;

    const muscles: string[] = (data.muscles ?? []).map(
      (m: { name_en: string }) => m.name_en
    );

    const images: Array<{ image: string; is_main: boolean }> = data.images ?? [];
    const main     = images.find((img) => img.is_main) ?? images[0];
    const imageUrl = main ? `${WGER_BASE}${main.image}` : null;

    const info: WgerExerciseInfo = { wgerId: baseId, name, description, muscleGroup, muscles, imageUrl };
    void putCachedExercise(cacheKey, info);
    return info;
  } catch {
    return cached?.data ?? null;
  }
}
