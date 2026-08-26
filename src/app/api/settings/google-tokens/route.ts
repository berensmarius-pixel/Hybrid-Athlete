import { NextResponse } from "next/server";
import { deleteGoogleTokens } from "@/lib/server/googleTokens";
import { saveScheduledWorkouts } from "@/lib/server/googleCalendarData";

/**
 * DELETE /api/settings/google-tokens
 *
 * Dedizierter Endpoint zum Trennen der Google-Verbindung.
 * Ein GET/PUT existiert absichtlich nicht: Tokens verlassen den Server nie
 * und laufen bewusst NICHT über /api/state (siehe SECRET_KEYS).
 */
export async function DELETE() {
  const ok = await deleteGoogleTokens();
  if (!ok) {
    return NextResponse.json(
      { success: false, error: "Verbindung konnte nicht getrennt werden." },
      { status: 500 }
    );
  }
  // Lokale Zuordnungen mitentfernen – ohne Tokens sind die Events
  // ohnehin nicht mehr verwaltbar (Google-Seite bleibt bestehen).
  try {
    await saveScheduledWorkouts([]);
  } catch {
    // Nicht kritisch für den Disconnect
  }
  return NextResponse.json({ success: true });
}
