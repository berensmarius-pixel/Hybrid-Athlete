import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { isAllowedKey } from "@/lib/persistence/keys";

/**
 * GET /api/state?keys=k1,k2,k3
 * Batch-Lesezugriff auf den zentralen App-State.
 * Antwortet nur mit Keys aus der Allowlist, die auf dem Server existieren.
 */
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Server-Persistenz nicht konfiguriert." },
      { status: 503 }
    );
  }

  const rawKeys = (req.nextUrl.searchParams.get("keys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const validKeys = [...new Set(rawKeys)].filter(isAllowedKey).slice(0, 100);
  if (validKeys.length === 0) {
    return NextResponse.json({ success: true, state: {} });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("app_state")
      .select("key,value")
      .in("key", validKeys);

    if (error) throw error;

    const state: Record<string, unknown> = {};
    for (const row of data ?? []) {
      state[row.key as string] = row.value;
    }
    return NextResponse.json({ success: true, state });
  } catch (err) {
    console.error("[api/state GET] failed:", err);
    return NextResponse.json(
      { success: false, error: "App-State konnte nicht gelesen werden." },
      { status: 500 }
    );
  }
}
