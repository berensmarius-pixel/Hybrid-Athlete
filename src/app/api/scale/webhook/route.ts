import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getLocalDateString } from "@/lib/utils";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const DATA_DIR = path.join(process.cwd(), ".scale_data");
const DATA_FILE = path.join(DATA_DIR, "measurements.json");

interface Measurement {
  id: string;
  date: string;
  weight: number;
  bmi?: number;
  bodyFatPct?: number;
  fatMassKg?: number;
  fatFreeMassKg?: number;
  muscleMassKg?: number;
  muscleMassPct?: number;
  skeletalMusclePct?: number;
  waterKg?: number;
  waterPct?: number;
  proteinKg?: number;
  proteinPct?: number;
  boneMassKg?: number;
  visceralFat?: number;
  bmrKcal?: number;
  impedanceOhm?: number;
  athlete?: boolean;
  weightSource?: string;
  rssi?: number;
  source: string;
}

function ensureDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isValidNumber(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
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
  } catch (err) {
    console.error("[api/scale/webhook GET] failed:", err);
    return NextResponse.json(
      { success: false, error: "Messwerte konnten nicht gelesen werden." },
      { status: 500 }
    );
  }
}

/** Spiegelt die Messung nach Supabase (scale_measurements). Fehler sind nicht-fatal. */
async function mirrorToSupabase(entry: Measurement, rssi?: number) {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await getSupabaseAdmin()
      .from("scale_measurements")
      .upsert(
        {
          id: entry.id,
          measured_at: entry.date,
          weight: entry.weight,
          bmi: entry.bmi ?? null,
          body_fat_pct: entry.bodyFatPct ?? null,
          fat_mass_kg: entry.fatMassKg ?? null,
          fat_free_mass_kg: entry.fatFreeMassKg ?? null,
          muscle_mass_kg: entry.muscleMassKg ?? null,
          muscle_mass_pct: entry.muscleMassPct ?? null,
          skeletal_muscle_pct: entry.skeletalMusclePct ?? null,
          water_kg: entry.waterKg ?? null,
          water_pct: entry.waterPct ?? null,
          protein_kg: entry.proteinKg ?? null,
          protein_pct: entry.proteinPct ?? null,
          bone_mass_kg: entry.boneMassKg ?? null,
          visceral_fat: entry.visceralFat ?? null,
          bmr_kcal: entry.bmrKcal ?? null,
          impedance_ohm: entry.impedanceOhm ?? null,
          athlete: entry.athlete ?? false,
          weight_source: entry.weightSource ?? null,
          source: entry.source,
          rssi: rssi ?? null,
        },
        { onConflict: "id" }
      );
    if (error) throw error;
  } catch (err) {
    console.error("[api/scale/webhook] Supabase-Mirror failed:", err);
  }
}

/**
 * POST /api/scale/webhook
 * Webhook called automatically by the Raspberry Pi Zero 2W when stepping on the Insmart scale
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      weight,
      bmi,
      bodyFatPct,
      fatMassKg,
      fatFreeMassKg,
      muscleMassKg,
      muscleMassPct,
      skeletalMusclePct,
      waterKg,
      waterPct,
      proteinKg,
      proteinPct,
      boneMassKg,
      visceralFat,
      bmrKcal,
      impedanceOhm,
      athlete,
      weightSource,
      rssi,
      source,
    } = body;

    // ── Strikte Typ- & Bereichsvalidierung (Schutz vor gefälschten/korrupten Werten)
    if (!isValidNumber(weight, 10, 400)) {
      return NextResponse.json(
        { success: false, error: "Ungültiges Gewicht (erwartet: Zahl zwischen 10 und 400 kg)." },
        { status: 400 }
      );
    }

    const fieldErrors: string[] = [];
    if (bmi != null && !isValidNumber(bmi, 10, 80)) fieldErrors.push("bmi");
    if (bodyFatPct != null && !isValidNumber(bodyFatPct, 0, 70)) fieldErrors.push("bodyFatPct");
    if (fatMassKg != null && !isValidNumber(fatMassKg, 0, 300)) fieldErrors.push("fatMassKg");
    if (fatFreeMassKg != null && !isValidNumber(fatFreeMassKg, 1, 350)) fieldErrors.push("fatFreeMassKg");
    if (muscleMassKg != null && !isValidNumber(muscleMassKg, 1, 300)) fieldErrors.push("muscleMassKg");
    if (muscleMassPct != null && !isValidNumber(muscleMassPct, 1, 95)) fieldErrors.push("muscleMassPct");
    if (skeletalMusclePct != null && !isValidNumber(skeletalMusclePct, 1, 80)) fieldErrors.push("skeletalMusclePct");
    if (waterKg != null && !isValidNumber(waterKg, 1, 250)) fieldErrors.push("waterKg");
    if (waterPct != null && !isValidNumber(waterPct, 5, 95)) fieldErrors.push("waterPct");
    if (proteinKg != null && !isValidNumber(proteinKg, 1, 100)) fieldErrors.push("proteinKg");
    if (proteinPct != null && !isValidNumber(proteinPct, 1, 40)) fieldErrors.push("proteinPct");
    if (boneMassKg != null && !isValidNumber(boneMassKg, 0.5, 10)) fieldErrors.push("boneMassKg");
    if (visceralFat != null && !isValidNumber(visceralFat, 0, 50)) fieldErrors.push("visceralFat");
    if (bmrKcal != null && !isValidNumber(bmrKcal, 500, 8000)) fieldErrors.push("bmrKcal");
    if (impedanceOhm != null && !isValidNumber(impedanceOhm, 50, 3000)) fieldErrors.push("impedanceOhm");
    if (fieldErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: `Ungültige Werte für: ${fieldErrors.join(", ")}` },
        { status: 400 }
      );
    }

    ensureDirectory();

    let existing: Measurement[] = [];
    if (fs.existsSync(DATA_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8") || "[]");
      } catch {
        existing = [];
      }
    }

    const newEntry: Measurement = {
      id: `scale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString(),
      weight: round1(weight),
      bmi: bmi != null ? round1(bmi) : undefined,
      bodyFatPct: bodyFatPct != null ? round1(bodyFatPct) : undefined,
      fatMassKg: fatMassKg != null ? round1(fatMassKg) : undefined,
      fatFreeMassKg: fatFreeMassKg != null ? round1(fatFreeMassKg) : undefined,
      muscleMassKg: muscleMassKg != null ? round1(muscleMassKg) : undefined,
      muscleMassPct:
        muscleMassKg != null
          ? round1(muscleMassKg != null ? (muscleMassKg / weight) * 100 : 0)
          : undefined,
      skeletalMusclePct: skeletalMusclePct != null ? round1(skeletalMusclePct) : undefined,
      waterKg: waterKg != null ? round1(waterKg) : undefined,
      waterPct: waterPct != null ? round1(waterPct) : undefined,
      proteinKg: proteinKg != null ? round1(proteinKg) : undefined,
      proteinPct: proteinPct != null ? round1(proteinPct) : undefined,
      boneMassKg: boneMassKg != null ? round1(boneMassKg) : undefined,
      visceralFat: visceralFat != null ? Math.round(visceralFat * 10) / 10 : undefined,
      bmrKcal: bmrKcal != null ? Math.round(bmrKcal) : undefined,
      impedanceOhm: impedanceOhm != null ? Math.round(impedanceOhm) : undefined,
      athlete: athlete === true,
      weightSource: typeof weightSource === "string" ? weightSource.slice(0, 40) : undefined,
      rssi: rssi != null ? Math.round(rssi) : undefined,
      source:
        typeof source === "string" && source.trim()
          ? source.trim().slice(0, 80)
          : "Raspberry Pi Zero 2W",
    };

    // Filter duplicate if same day (lokale Zeitzone, nicht UTC)
    const todayStr = getLocalDateString(new Date(newEntry.date));
    const filtered = existing.filter((e) => e?.date?.split("T")[0] !== todayStr);
    const updated = [newEntry, ...filtered];

    // Atomar schreiben: erst Temp-Datei, dann rename – verhindert korrupte JSON
    // bei Abbruch. Windows/OneDrive kann die Zieldatei kurzzeitig locken
    // (rename wirft dann EPERM) -> mehrfach probieren, sonst direkt schreiben.
    const tmpFile = `${DATA_FILE}.${process.pid}.tmp`;
    const contents = JSON.stringify(updated, null, 2);
    fs.writeFileSync(tmpFile, contents, "utf-8");
    let renamed = false;
    for (let i = 0; i < 3 && !renamed; i++) {
      try {
        fs.renameSync(tmpFile, DATA_FILE);
        renamed = true;
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
    if (!renamed) {
      fs.writeFileSync(DATA_FILE, contents, "utf-8");
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* tmp aufraeumen ist best-effort */
      }
    }

    // Serverseitige Roh-Persistenz in Supabase (unabhaengig vom offenen Browser)
    await mirrorToSupabase(newEntry, typeof rssi === "number" ? rssi : undefined);

    return NextResponse.json({
      success: true,
      message: "Messung erfolgreich von Raspberry Pi empfangen",
      entry: newEntry,
    });
  } catch (err) {
    console.error("[api/scale/webhook POST] failed:", err);
    return NextResponse.json(
      { success: false, error: "Messung konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}
