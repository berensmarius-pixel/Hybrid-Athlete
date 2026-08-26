import type { KbQueryResponse, ScientificGrounding } from "@/types/knowledge";

/**
 * Client-Helper: holt den Scientific Grounding Context für eine Coach-Nachricht
 * (Retrieval-Step vor dem System-Prompt-Bau). Fällt still aus (null), wenn die
 * Wissensbasis leer, nicht konfiguriert oder der Server nicht erreichbar ist –
 * der Coach funktioniert ohne Grounding unverändert weiter.
 *
 * Backoff: Nach "nicht verfügbar" wird für 10 min nicht mehr nachgefragt,
 * nach Netzwerk-/Serverfehlern für 1 Minute (spart Requests pro Chat-Nachricht).
 */

const UNAVAILABLE_BACKOFF_MS = 10 * 60_000;
const ERROR_BACKOFF_MS = 60_000;
const REQUEST_TIMEOUT_MS = 9_000;

let disabledUntilMs = 0;

/** Cache/Backoff zurücksetzen (z. B. nach erfolgreichem Seeding). */
export function invalidateGroundingBackoff(): void {
  disabledUntilMs = 0;
}

export async function fetchScientificGrounding(
  query: string,
  maxChunks = 4
): Promise<ScientificGrounding | null> {
  const clean = query.trim();
  if (!clean || Date.now() < disabledUntilMs) return null;

  try {
    const res = await fetch("/api/kb/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: clean.slice(0, 1200), maxChunks }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`KB-Query fehlgeschlagen (${res.status})`);

    const data = (await res.json()) as KbQueryResponse;
    if (!data.available || !data.grounding) {
      disabledUntilMs = Date.now() + UNAVAILABLE_BACKOFF_MS;
      return null;
    }
    return data.grounding;
  } catch {
    disabledUntilMs = Date.now() + ERROR_BACKOFF_MS;
    return null;
  }
}
