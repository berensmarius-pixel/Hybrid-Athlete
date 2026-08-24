// ─── Fitdays CSV & Excel Export Parser ───────────────────────────────────────

import { BodyCompositionEntry } from "@/types";
import { generateId } from "@/lib/utils";

export interface FitdaysParseResult {
  success: boolean;
  entries: BodyCompositionEntry[];
  totalRows: number;
  errors: string[];
}

/**
 * Parse raw text / CSV exported from the Fitdays app
 */
export function parseFitdaysCsv(csvContent: string): FitdaysParseResult {
  const errors: string[] = [];
  const entries: BodyCompositionEntry[] = [];

  if (!csvContent || !csvContent.trim()) {
    return { success: false, entries: [], totalRows: 0, errors: ["Die Datei ist leer."] };
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { success: false, entries: [], totalRows: 0, errors: ["Keine Datenzeilen gefunden."] };
  }

  // Detect delimiter (, or ; or \t)
  const headerLine = lines[0];
  let delimiter = ",";
  if (headerLine.includes(";")) delimiter = ";";
  else if (headerLine.includes("\t")) delimiter = "\t";

  const headers = headerLine.split(delimiter).map((h) => h.replace(/^["']|["']$/g, "").trim().toLowerCase());

  // Helper to find column index by keywords
  function findColIndex(...keywords: string[]): number {
    return headers.findIndex((h) => keywords.some((k) => h.includes(k.toLowerCase())));
  }

  const dateIdx = findColIndex("zeit", "datum", "date", "time");
  const weightIdx = findColIndex("gewicht", "weight");
  const fatIdx = findColIndex("körperfett", "körperfett(%)", "kfa", "fat", "body fat");
  const muscleIdx = findColIndex("muskelmasse", "muskel", "muscle", "muscle mass");
  const waterIdx = findColIndex("wasser", "körperwasser", "water", "tbw");
  const boneIdx = findColIndex("knochen", "knochenmasse", "bone", "bone mass");
  const visceralIdx = findColIndex("viszeral", "visceral", "v-fat");
  const bmrIdx = findColIndex("bmr", "grundumsatz", "calorie");
  const bmiIdx = findColIndex("bmi");
  const metaAgeIdx = findColIndex("stoffwechselalter", "körperalter", "metabolic age", "body age");

  if (weightIdx === -1) {
    return {
      success: false,
      entries: [],
      totalRows: lines.length - 1,
      errors: ["Spalte 'Gewicht' bzw. 'Weight' nicht gefunden. Bitte prüfe die CSV-Datei."],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = rawLine.split(delimiter).map((c) => c.replace(/^["']|["']$/g, "").trim());

    if (cols.length <= weightIdx) continue;

    const rawWeight = cols[weightIdx].replace(",", ".");
    const weight = parseFloat(rawWeight);

    if (isNaN(weight) || weight <= 0) continue;

    // Parse date / timestamp
    let dateStr = new Date().toISOString();
    if (dateIdx !== -1 && cols[dateIdx]) {
      const rawDate = cols[dateIdx];
      // Format checks: YYYY-MM-DD or DD.MM.YYYY or YYYY/MM/DD
      if (rawDate.includes(".")) {
        const parts = rawDate.split(" ")[0].split(".");
        if (parts.length === 3) {
          // DD.MM.YYYY -> YYYY-MM-DD
          const [d, m, y] = parts;
          dateStr = `${y.length === 2 ? "20" + y : y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
      } else if (rawDate.includes("-") || rawDate.includes("/")) {
        const clean = rawDate.replace(/\//g, "-").split(" ")[0];
        dateStr = clean;
      }
    }

    const parseNum = (idx: number): number | undefined => {
      if (idx === -1 || !cols[idx]) return undefined;
      const val = parseFloat(cols[idx].replace(",", "."));
      return isNaN(val) ? undefined : Math.round(val * 10) / 10;
    };

    const bodyFatPct = parseNum(fatIdx);
    const muscleMass = parseNum(muscleIdx);
    const waterPct = parseNum(waterIdx);
    const boneMassKg = parseNum(boneIdx);
    const visceralFat = parseNum(visceralIdx);
    const bmrKcal = parseNum(bmrIdx) ? Math.round(parseNum(bmrIdx)!) : undefined;
    const bmi = parseNum(bmiIdx);
    const metabolicAge = parseNum(metaAgeIdx);

    // If muscle mass is given as percentage (> 40), convert to kg
    let muscleMassKg: number | undefined = undefined;
    let muscleMassPct: number | undefined = undefined;

    if (muscleMass) {
      if (muscleMass > 30 && muscleMass < 100 && muscleMass > weight * 0.4) {
        muscleMassPct = muscleMass;
        muscleMassKg = Math.round(((weight * muscleMassPct) / 100) * 10) / 10;
      } else {
        muscleMassKg = muscleMass;
        muscleMassPct = Math.round(((muscleMassKg / weight) * 100) * 10) / 10;
      }
    }

    entries.push({
      id: generateId(),
      date: dateStr,
      weight,
      bodyFatPct,
      muscleMassKg,
      muscleMassPct,
      waterPct,
      boneMassKg,
      visceralFat,
      bmrKcal,
      bmi,
      metabolicAge,
      source: "Fitdays CSV",
    });
  }

  // Sort by date descending
  entries.sort((a, b) => b.date.localeCompare(a.date));

  return {
    success: entries.length > 0,
    entries,
    totalRows: lines.length - 1,
    errors,
  };
}
