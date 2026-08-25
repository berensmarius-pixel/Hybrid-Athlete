import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import util from "util";

const execFileAsync = util.promisify(execFile);

export async function GET() {
  try {
    const scriptPath = path.join(process.cwd(), "scripts", "garmin_sync.py");
    const { stdout } = await execFileAsync("python", [scriptPath, "status"], {
      timeout: 10000,
    });
    const parsed = JSON.parse(stdout.trim());
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ connected: false });
  }
}
