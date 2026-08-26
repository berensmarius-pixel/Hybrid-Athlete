/**
 * Client-seitiges Quota-Gedächtnis für die Gemini-Modell-Kette:
 * - Merkt sich das zuletzt erfolgreiche Modell ("sticky") und stellt es in
 *   der Kette nach vorn → keine doppelten 429-Roundtrips auf dem Primary.
 * - Modelle mit aktivem Cooldown (429/RPM → 60 s, Tages-Limit → bis lokal
 *   Mitternacht) wandern ans Ketten-Ende.
 *
 * Persistenz: localStorage (Client-only). In Node/Test-Umgebungen ohne
 * localStorage wird ein In-Memory-Fallback verwendet.
 */

export interface QuotaMemoryEntry {
  /** Letzter erfolgreicher Request (epoch ms). */
  lastSuccessAt?: number;
  /** Modell bis zu diesem Zeitpunkt überspringen (epoch ms). */
  cooldownUntil?: number;
}

const STORAGE_KEY = "hybrid_athlete_ai_quota_memory";
const RPM_COOLDOWN_MS = 60_000;

let storageOverride: Storage | null | undefined;

/** Test-Hook: Storage injizieren (null → In-Memory erzwingen). */
export function setQuotaMemoryStorageForTests(storage: Storage | null): void {
  storageOverride = storage;
}

function getStorage(): Storage | null {
  if (storageOverride !== undefined) return storageOverride;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* localStorage kann in Privacy-Modi werfen */
  }
  return null;
}

/** In-Memory-Fallback (SSR/Tests/Privacy-Mode). */
const memoryFallback = new Map<string, string>();

function readRaw(): Record<string, QuotaMemoryEntry> {
  const storage = getStorage();
  const raw = storage ? storage.getItem(STORAGE_KEY) : memoryFallback.get(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, QuotaMemoryEntry>;
    }
  } catch {
    /* korrupte Daten → neu starten */
  }
  return {};
}

function writeRaw(memory: Record<string, QuotaMemoryEntry>): void {
  const json = JSON.stringify(memory);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, json);
      return;
    } catch {
      /* Quota-Full → Fallback */
    }
  }
  memoryFallback.set(STORAGE_KEY, json);
}

export function getQuotaMemory(): Record<string, QuotaMemoryEntry> {
  return readRaw();
}

/** Erfolgreichen Call merken (Modell wird künftig bevorzugt). */
export function recordModelSuccess(modelId: string): void {
  if (!modelId) return;
  const memory = readRaw();
  const entry = memory[modelId] ?? {};
  entry.lastSuccessAt = Date.now();
  delete entry.cooldownUntil;
  memory[modelId] = entry;
  writeRaw(memory);
}

/**
 * Fehlversuch (429/Quota/503) merken:
 * - Tages-Limit im Fehlertext → Cooldown bis lokal Mitternacht
 * - sonst (RPM/Burst) → kurzer Cooldown von 60 s
 */
export function recordModelFailure(modelId: string, message?: string | null): void {
  if (!modelId) return;
  const memory = readRaw();
  const entry = memory[modelId] ?? {};
  const msg = (message ?? "").toLowerCase();
  const isDailyLimit =
    msg.includes("per day") ||
    msg.includes("daily") ||
    msg.includes("requests per") && msg.includes("day") ||
    /\brpd\b/.test(msg);

  entry.cooldownUntil = isDailyLimit
    ? nextLocalMidnight()
    : Date.now() + RPM_COOLDOWN_MS;
  memory[modelId] = entry;
  writeRaw(memory);
}

function nextLocalMidnight(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/**
 * Ordnet die Modell-Kette quota-bewusst um:
 * 1. Zuletzt erfolgreiches Modell (neuester Erfolg) zuerst
 * 2. Modelle mit aktivem Cooldown ans Ende (Reihenfolge sonst stabil)
 */
export function orderModelsByQuota(chain: readonly string[]): string[] {
  const memory = readRaw();
  const now = Date.now();

  const sticky = chain
    .filter((id) => {
      const last = memory[id]?.lastSuccessAt;
      const cooling = (memory[id]?.cooldownUntil ?? 0) > now;
      return last !== undefined && !cooling;
    })
    .sort((a, b) => (memory[b].lastSuccessAt ?? 0) - (memory[a].lastSuccessAt ?? 0));

  const cooled = chain.filter((id) => (memory[id]?.cooldownUntil ?? 0) > now);
  const rest = chain.filter((id) => !sticky.includes(id) && !cooled.includes(id));

  return [...sticky, ...rest, ...cooled];
}

/** Nur für Tests: komplettes Gedächtnis leeren. */
export function resetQuotaMemoryForTests(): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* ignorieren */
    }
  }
  memoryFallback.clear();
}
