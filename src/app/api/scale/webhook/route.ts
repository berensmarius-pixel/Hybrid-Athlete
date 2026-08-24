import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".scale_data");
const DATA_FILE = path.join(DATA_DIR, "measurements.json");

function ensureDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * GET /api/scale/webhook
 * Returns all measurements received from the Raspberry Pi Zero 2W bridge
 */
export async function GET() {
  try {
    ensureDirectory();
    if (!fs.existsSync(DATA_FILE)) {
      return NextResponse.json({ success: true, measurements: [] });
    }
    const content = fs.readFileSync(DATA_FILE, "utf-8");
    const measurements = JSON.parse(content || "[]");
    return NextResponse.json({ success: true, measurements });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/scale/webhook
 * Webhook called automatically by the Raspberry Pi Zero 2W when stepping on the Insmart scale
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { weight, bodyFatPct, muscleMassKg, waterPct, visceralFat, bmrKcal, source } = body;

    if (!weight || typeof weight !== "number") {
      return NextResponse.json({ success: false, error: "Ungültiges Gewicht" }, { status: 400 });
    }

    ensureDirectory();

    let existing: any[] = [];
    if (fs.existsSync(DATA_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8") || "[]");
      } catch {}
    }

    const newEntry = {
      id: `scale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString(),
      weight: Math.round(weight * 10) / 10,
      bodyFatPct: bodyFatPct ? Math.round(bodyFatPct * 10) / 10 : undefined,
      muscleMassKg: muscleMassKg ? Math.round(muscleMassKg * 10) / 10 : undefined,
      muscleMassPct: (muscleMassKg && weight) ? Math.round((muscleMassKg / weight) * 100 * 10) / 10 : undefined,
      waterPct: waterPct ? Math.round(waterPct * 10) / 10 : undefined,
      visceralFat: visceralFat ? Math.round(visceralFat) : undefined,
      bmrKcal: bmrKcal ? Math.round(bmrKcal) : undefined,
      source: source || "Raspberry Pi Zero 2W",
    };

    // Filter duplicate if same day
    const todayStr = newEntry.date.split("T")[0];
    const filtered = existing.filter((e: any) => e.date.split("T")[0] !== todayStr);
    const updated = [newEntry, ...filtered];

    fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      message: "Messung erfolgreich von Raspberry Pi empfangen",
      entry: newEntry,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
