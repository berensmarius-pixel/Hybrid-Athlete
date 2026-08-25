import { NextResponse } from "next/server";
import { runGarminJson } from "@/lib/garmin/garminCli";

export async function GET() {
  try {
    const parsed = await runGarminJson(["status"], { timeoutMs: 10_000 });
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ connected: false });
  }
}
