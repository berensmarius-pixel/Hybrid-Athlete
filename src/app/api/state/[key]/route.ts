import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { isAllowedKey } from "@/lib/persistence/keys";

const MAX_VALUE_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * PUT /api/state/[key]   Body: { value: unknown }
 * Upsert eines einzelnen App-State-Keys (nur Allowlist).
 *
 * DELETE /api/state/[key]
 * Entfernt den Key (z. B. Strava-Disconnect, Active-Session-Reset).
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Server-Persistenz nicht konfiguriert." },
      { status: 503 }
    );
  }

  const { key } = await ctx.params;
  if (!isAllowedKey(key)) {
    return NextResponse.json(
      { success: false, error: "Key nicht erlaubt." },
      { status: 400 }
    );
  }

  let body: { value?: unknown };
  try {
    body = (await req.json()) as { value?: unknown };
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiger JSON-Body." },
      { status: 400 }
    );
  }

  const value = body.value ?? null;
  if (JSON.stringify(value).length > MAX_VALUE_BYTES) {
    return NextResponse.json(
      { success: false, error: "Wert überschreitet die Größenbegrenzung." },
      { status: 413 }
    );
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from("app_state")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[api/state/${key} PUT] failed:`, err);
    return NextResponse.json(
      { success: false, error: "App-State konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Server-Persistenz nicht konfiguriert." },
      { status: 503 }
    );
  }

  const { key } = await ctx.params;
  if (!isAllowedKey(key)) {
    return NextResponse.json(
      { success: false, error: "Key nicht erlaubt." },
      { status: 400 }
    );
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from("app_state")
      .delete()
      .eq("key", key);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[api/state/${key} DELETE] failed:`, err);
    return NextResponse.json(
      { success: false, error: "App-State konnte nicht gelöscht werden." },
      { status: 500 }
    );
  }
}
