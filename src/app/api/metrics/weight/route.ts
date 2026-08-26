import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Cloud-Persistenz für Körpergewicht/Messungen (Offline-First-Sync-Ziel).
 *
 * - Der Raspberry-Pi-Daemon puffert Messungen lokal (SQLite) und POSTet alle
 *   ungesyncerten Datensätze als Batch hierher, sobald Netzwerk verfügbar ist.
 * - Auth läuft zentral über src/proxy.ts (Bearer/x-api-key mit APP_API_SECRET
 *   bzw. Session-Cookie) – alle /api/*-Routen sind abgesichert.
 * - Dedupe: Upsert auf (user_id, measured_at) – Retry-/Batch-Syncs sind damit
 *   idempotent (Unique-Index uq_scale_measurements_user_measured_at).
 *
 * Das Frontend lädt beim Initial Load die neuesten Messungen direkt aus der
 * Cloud-DB (GET) – kein Live-Polling des Raspberry Pi mehr nötig.
 */

const DEFAULT_USER_ID = "local";
const MAX_BATCH = 100;
const DEFAULT_LIMIT = 90;
const MAX_LIMIT = 365;

interface IncomingMeasurement {
  clientId: string;
  row: Record<string, unknown>;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isValidNumber(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function normalizeTimestamp(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 2020 || year > 2035) return null;
  return d.toISOString();
}

/**
 * Validiert einen Roh-Datensatz aus dem Batch und erzeugt die Spaltenzeile für
 * Supabase. Gibt (row, error) zurück – `error` beschreibt den Ablehnungsgrund.
 */
function mapMeasurement(raw: Record<string, unknown>, index: number): {
  clientId: string;
  row?: Record<string, unknown>;
  error?: string;
} {
  const clientId =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim().slice(0, 64)
      : `batch_${Date.now()}_${index}`;

  const ts = normalizeTimestamp(raw.timestamp ?? raw.measuredAt ?? raw.date);
  if (!ts) return { clientId, error: "timestamp fehlt/ungültig (ISO UTC erwartet)" };

  const rawWeight = raw.weightKg ?? raw.weight;
  if (!isValidNumber(rawWeight, 10, 400)) {
    return { clientId, error: "weight_kg ungültig (10–400 kg)" };
  }

  const num = (v: unknown, min: number, max: number): number | null =>
    isValidNumber(v, min, max) ? round1(v) : null;

  const impedanceRaw = raw.impedanceRaw ?? raw.impedanceOhm;
  const userId =
    typeof raw.userId === "string" && raw.userId.trim()
      ? raw.userId.trim().slice(0, 64)
      : DEFAULT_USER_ID;

  return {
    clientId,
    row: {
      // Deterministische PK: gleiche Messung (user + Timestamp) -> gleiche id,
      // damit Retry-/Batch-Syncs auf beiden Unique-Constraints idempotent sind.
      id: `scale_${createHash("sha256").update(`${userId}|${ts}`).digest("hex").slice(0, 24)}`,
      user_id: userId,
      measured_at: ts,
      weight: round1(rawWeight),
      bmi: num(raw.bmi, 10, 80),
      body_fat_pct: num(raw.bodyFatPct, 0, 70),
      fat_mass_kg: num(raw.fatMassKg, 0, 300),
      fat_free_mass_kg: num(raw.fatFreeMassKg, 1, 350),
      muscle_mass_kg: num(raw.muscleMassKg, 1, 300),
      muscle_mass_pct: num(raw.muscleMassPct, 1, 95),
      skeletal_muscle_pct: num(raw.skeletalMusclePct, 1, 80),
      water_kg: num(raw.waterKg, 1, 250),
      water_pct: num(raw.waterPct, 5, 95),
      protein_kg: num(raw.proteinKg, 1, 100),
      protein_pct: num(raw.proteinPct, 1, 40),
      bone_mass_kg: num(raw.boneMassKg, 0.5, 10),
      visceral_fat: num(raw.visceralFat, 0, 50),
      bmr_kcal: isValidNumber(raw.bmrKcal, 500, 8000) ? Math.round(raw.bmrKcal) : null,
      impedance_ohm: isValidNumber(impedanceRaw, 50, 3000) ? Math.round(impedanceRaw) : null,
      athlete: raw.athlete === true,
      weight_source:
        typeof raw.weightSource === "string" ? raw.weightSource.slice(0, 40) : null,
      source:
        typeof raw.source === "string" && raw.source.trim()
          ? raw.source.trim().slice(0, 80)
          : "Raspberry Pi Zero 2W",
      rssi: isValidNumber(raw.rssi, -120, 0) ? Math.round(raw.rssi) : null,
    },
  };
}

/** Wandelt eine DB-Zeile zurück in das Frontend-Entry-Format (camelCase). */
function dbRowToEntry(row: Record<string, unknown>): Record<string, unknown> {
  const optNum = (v: unknown): number | undefined =>
    v == null ? undefined : Number(v);
  return {
    id: row.id,
    date: row.measured_at,
    weight: Number(row.weight),
    bmi: optNum(row.bmi),
    bodyFatPct: optNum(row.body_fat_pct),
    fatMassKg: optNum(row.fat_mass_kg),
    fatFreeMassKg: optNum(row.fat_free_mass_kg),
    muscleMassKg: optNum(row.muscle_mass_kg),
    muscleMassPct: optNum(row.muscle_mass_pct),
    skeletalMusclePct: optNum(row.skeletal_muscle_pct),
    waterKg: optNum(row.water_kg),
    waterPct: optNum(row.water_pct),
    proteinKg: optNum(row.protein_kg),
    proteinPct: optNum(row.protein_pct),
    boneMassKg: optNum(row.bone_mass_kg),
    visceralFat: optNum(row.visceral_fat),
    bmrKcal: optNum(row.bmr_kcal),
    impedanceOhm: optNum(row.impedance_ohm),
    athlete: row.athlete === true,
    weightSource: row.weight_source ?? undefined,
    source: row.source ?? undefined,
  };
}

/**
 * POST /api/metrics/weight
 * Batch-Upsert (max. 100) vom Pi-Sync-Worker oder Einzel-POST.
 * Body: { measurements: [...] } oder ein einzelnes Measurement-Objekt.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Cloud-Persistenz nicht konfiguriert." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiges JSON." },
      { status: 400 }
    );
  }

  const rawList: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { measurements?: unknown[] })?.measurements)
      ? ((body as { measurements: unknown[] }).measurements)
      : [body];

  if (rawList.length === 0) {
    return NextResponse.json(
      { success: false, error: "Keine Messungen im Request-Body." },
      { status: 400 }
    );
  }
  if (rawList.length > MAX_BATCH) {
    return NextResponse.json(
      { success: false, error: `Maximal ${MAX_BATCH} Messungen pro Batch.` },
      { status: 413 }
    );
  }

  const accepted: IncomingMeasurement[] = [];
  const rejected: { id: string; error: string }[] = [];
  rawList.forEach((item, i) => {
    if (typeof item !== "object" || item === null) {
      rejected.push({ id: `index_${i}`, error: "Datensatz ist kein Objekt." });
      return;
    }
    const { clientId, row, error } = mapMeasurement(item as Record<string, unknown>, i);
    if (!row || error) {
      rejected.push({ id: clientId, error: error ?? "Unbekannter Fehler." });
    } else {
      accepted.push({ clientId, row });
    }
  });

  let syncedIds: string[] = [];
  if (accepted.length > 0) {
    // Innerhalb eines Batches Duplikate (gleicher user+Timestamp) entfernen -
    // sonst wirft Postgres "ON CONFLICT cannot affect row a second time".
    const byKey = new Map<string, IncomingMeasurement>();
    for (const a of accepted) {
      byKey.set(`${a.row.user_id}|${a.row.measured_at}`, a);
    }
    const uniqueRows = [...byKey.values()];
    try {
      const { error } = await getSupabaseAdmin()
        .from("scale_measurements")
        .upsert(
          uniqueRows.map((a) => a.row),
          { onConflict: "user_id,measured_at" }
        );
      if (error) throw error;
      syncedIds = [...byKey.keys()].map((key) =>
        byKey.get(key)!.clientId
      );
    } catch (err) {
      console.error("[api/metrics/weight POST] upsert failed:", err);
      // Teil-Erfolg melden: abgelehnte Einträge bleiben abgelehnt, der Rest
      // wird vom Pi beim nächsten Retry erneut gesendet (idempotenter Upsert).
      return NextResponse.json(
        {
          success: false,
          error: "Cloud-Upsert fehlgeschlagen (Retry später).",
          rejected,
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    synced: syncedIds,
    rejected,
    message: `${syncedIds.length} Messung(en) synchronisiert.`,
  });
}

/**
 * GET /api/metrics/weight?limit=90
 * Neueste Messungen direkt aus der Cloud-DB (Frontend Initial Load).
 * Ohne Supabase-Konfiguration: Fallback auf die lokale Datei-Mirror-Datei.
 */
export async function GET(req: NextRequest) {
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "");
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), MAX_LIMIT)
      : DEFAULT_LIMIT;

  if (!isSupabaseConfigured()) {
    return readLocalMirrorFallback(limit);
  }

  try {
    // Optionaler Nutzer-Filter (Mehrbenutzer-Waage): ?user=local
    const userFilter = req.nextUrl.searchParams.get("user")?.trim() || null;
    let query = getSupabaseAdmin().from("scale_measurements").select("*");
    if (userFilter) {
      query = query.eq("user_id", userFilter);
    }
    const { data, error } = await query
      .order("measured_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      source: "cloud",
      // Aufsteigend ausliefern: das Frontend behält pro Tag den zuletzt
      // importierten Eintrag -> so gewinnt immer die NEUESTE Messung des Tages.
      measurements: (data ?? []).map(dbRowToEntry).reverse(),
    });
  } catch (err) {
    console.error("[api/metrics/weight GET] failed:", err);
    return NextResponse.json(
      { success: false, error: "Messwerte konnten nicht aus der Cloud gelesen werden." },
      { status: 500 }
    );
  }
}

/** LAN-Only-Fallback (keine Supabase-Creds): Datei-Spiegel des Webhooks lesen. */
async function readLocalMirrorFallback(limit: number): Promise<NextResponse> {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const dataFile = path.join(process.cwd(), ".scale_data", "measurements.json");
    if (!fs.existsSync(dataFile)) {
      return NextResponse.json({ success: true, source: "local-file", measurements: [] });
    }
    const measurements = JSON.parse(fs.readFileSync(dataFile, "utf-8") || "[]");
    return NextResponse.json({
      success: true,
      source: "local-file",
      measurements: Array.isArray(measurements) ? measurements.slice(0, limit) : [],
    });
  } catch (err) {
    console.error("[api/metrics/weight GET] local fallback failed:", err);
    return NextResponse.json(
      { success: false, error: "Messwerte konnten nicht gelesen werden." },
      { status: 500 }
    );
  }
}
