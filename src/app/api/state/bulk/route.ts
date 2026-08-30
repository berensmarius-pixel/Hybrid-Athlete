import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { isAllowedKey } from "@/lib/persistence/keys";

const MAX_ENTRIES = 100;
const MAX_VALUE_BYTES = 8 * 1024 * 1024; // 8 MB pro Eintrag (GPX/Chat-Historie)

interface BulkEntry {
  key: unknown;
  value: unknown;
  deleted?: boolean;
}

/**
 * POST /api/state/bulk
 * Body: { entries: [{ key, value, deleted? }] }
 * Upsert/Delete mehrerer App-State-Keys in einem Request.
 * Genutzt vom Offline-Queue-Flush, Backup-Import und der Migration.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Server-Persistenz nicht konfiguriert." },
      { status: 503 }
    );
  }

  let body: { entries?: BulkEntry[] };
  try {
    body = (await req.json()) as { entries?: BulkEntry[] };
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiger JSON-Body." },
      { status: 400 }
    );
  }

  const entries = Array.isArray(body.entries) ? body.entries.slice(0, MAX_ENTRIES) : [];
  const upserts: { key: string; value: unknown }[] = [];
  const deletes: string[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry.key !== "string" || !isAllowedKey(entry.key)) continue;

    if (entry.deleted === true || entry.value === null || entry.value === undefined) {
      deletes.push(entry.key);
      continue;
    }

    const serialized = JSON.stringify(entry.value);
    if (serialized.length > MAX_VALUE_BYTES) {
      return NextResponse.json(
        { success: false, error: `Wert für "${entry.key}" überschreitet die Größenbegrenzung.` },
        { status: 413 }
      );
    }
    upserts.push({ key: entry.key, value: entry.value });
  }

  try {
    const client = getSupabaseAdmin();

    if (upserts.length > 0) {
      const { error } = await client
        .from("app_state")
        .upsert(upserts, { onConflict: "key" });
      if (error) throw error;
    }

    if (deletes.length > 0) {
      const { error } = await client.from("app_state").delete().in("key", deletes);
      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      applied: { upserted: upserts.length, deleted: deletes.length },
    });
  } catch (err) {
    console.error("[api/state/bulk POST] failed:", err);
    return NextResponse.json(
      { success: false, error: "App-State konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}
