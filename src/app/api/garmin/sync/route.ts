import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import util from "util";

const execFileAsync = util.promisify(execFile);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const email = searchParams.get("email") || undefined;
    const password = searchParams.get("password") || undefined;

    const scriptPath = path.join(process.cwd(), "scripts", "garmin_sync.py");
    const args = [scriptPath, "sync", "--date", date];

    if (email && password) {
      args.push("--email", email, "--password", password);
    }

    const { stdout } = await execFileAsync("python", args, {
      timeout: 35000,
    });

    const parsed = JSON.parse(stdout.trim());
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Fehler beim Synchronisieren der Garmin Daten.",
      },
      { status: 500 }
    );
  }
}
