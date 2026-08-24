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

    const args = [scriptPath, "login", "--email", email, "--password", password];
    if (mfa) {
      args.push("--mfa", mfa);
    }

    const { stdout } = await execFileAsync("python", args, {
      timeout: 30000,
    });

    const parsed = JSON.parse(stdout.trim());
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Fehler beim Verbinden mit Garmin Connect.",
      },
      { status: 500 }
    );
  }
}
