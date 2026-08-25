import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import util from "util";

const execFileAsync = util.promisify(execFile);

export async function POST(req: Request) {
  try {
    const { email, password, mfa } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Bitte E-Mail und Passwort eingeben." },
        { status: 400 }
      );
    }

    const scriptPath = path.join(process.cwd(), "scripts", "garmin_sync.py");

    // Credentials werden ausschließlich per Umgebungsvariable übergeben –
    // niemals als argv (lesbar via Prozessliste) oder URL-Parameter.
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    childEnv.GARMIN_EMAIL = String(email);
    childEnv.GARMIN_PASSWORD = String(password);
    if (mfa) childEnv.GARMIN_MFA = String(mfa);

    const { stdout } = await execFileAsync("python", [scriptPath, "login"], {
      timeout: 30000,
      env: childEnv,
    });

    const parsed = JSON.parse(stdout.trim());
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[api/garmin/login] failed:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          "Anmeldung bei Garmin fehlgeschlagen. Bitte Zugangsdaten und Internetverbindung prüfen.",
      },
      { status: 500 }
    );
  }
}
