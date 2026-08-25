import { NextResponse } from "next/server";
import { runGarminJson, garminErrorResponse, invalidateListWorkoutsCache } from "@/lib/garmin/garminCli";

export async function POST(req: Request) {
  try {
    const { email, password, mfa } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Bitte E-Mail und Passwort eingeben." },
        { status: 400 }
      );
    }

    // Credentials werden ausschließlich per Umgebungsvariable übergeben –
    // niemals als argv (lesbar via Prozessliste) oder URL-Parameter.
    const childEnv: Record<string, string> = {
      GARMIN_EMAIL: String(email),
      GARMIN_PASSWORD: String(password),
    };
    if (mfa) childEnv.GARMIN_MFA = String(mfa);

    const parsed = await runGarminJson(["login"], {
      timeoutMs: 30_000,
      env: childEnv,
    });

    if (parsed.success) invalidateListWorkoutsCache();

    return NextResponse.json(parsed);
  } catch (err) {
    return garminErrorResponse(
      "login",
      err,
      "Anmeldung bei Garmin fehlgeschlagen. Bitte Zugangsdaten und Internetverbindung prüfen."
    );
  }
}
