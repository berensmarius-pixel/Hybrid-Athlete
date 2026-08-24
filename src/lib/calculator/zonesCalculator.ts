// ─── Heart Rate & Power Zones Calculator Engine ──────────────────────────────

export interface HeartRateZone {
  zone: number;
  name: string;
  minBpm: number;
  maxBpm: number;
  pctRange: string;
  purpose: string;
  color: string;
}

export interface PowerZone {
  zone: number;
  name: string;
  minWatts: number;
  maxWatts: number;
  pctRange: string;
  purpose: string;
  color: string;
}

export function calculateKarvonenHrZones(restingHr: number = 42, maxHr: number = 190): HeartRateZone[] {
  const hrr = maxHr - restingHr; // Heart Rate Reserve

  const zonesConfig = [
    { zone: 1, name: "Aktive Regeneration (Zone 1)", minPct: 0.50, maxPct: 0.60, purpose: "Durchblutung, Erholung & Cool-Down", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30" },
    { zone: 2, name: "Aerobe Basis / Fettstoffwechsel (Zone 2)", minPct: 0.60, maxPct: 0.70, purpose: "Mitochondrien-Dichte & Laktat-Clearance", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
    { zone: 3, name: "Tempo / Aerobe Kraft (Zone 3)", minPct: 0.70, maxPct: 0.80, purpose: "Marathon/Halbmarathon-Renntempo", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
    { zone: 4, name: "Laktatschwelle / Threshold (Zone 4)", minPct: 0.80, maxPct: 0.90, purpose: "FTP-Steigerung & Laktattoleranz (4x4 Min)", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
    { zone: 5, name: "VO2 Max / Maximalbereich (Zone 5)", minPct: 0.90, maxPct: 1.00, purpose: "Sauerstoffaufnahme & All-Out Sprints", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
  ];

  return zonesConfig.map((z) => ({
    zone: z.zone,
    name: z.name,
    minBpm: Math.round(restingHr + hrr * z.minPct),
    maxBpm: Math.round(restingHr + hrr * z.maxPct),
    pctRange: `${Math.round(z.minPct * 100)}% – ${Math.round(z.maxPct * 100)}% HRR`,
    purpose: z.purpose,
    color: z.color,
  }));
}

export function calculateCogganPowerZones(ftpWatts: number = 260): PowerZone[] {
  const zonesConfig = [
    { zone: 1, name: "Aktive Erholung (Z1)", minPct: 0, maxPct: 0.55, purpose: "Geringer Stoffwechselreiz, aktive Durchblutung", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30" },
    { zone: 2, name: "Ausdauer / Zone 2 (Z2)", minPct: 0.56, maxPct: 0.75, purpose: "Grundlagenausdauer & Fettverbrennung (2–5h)", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
    { zone: 3, name: "Tempo (Z3)", minPct: 0.76, maxPct: 0.90, purpose: "Intensives Grundlagentraining & Sweet Spot Basis", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
    { zone: 4, name: "Schwellenbereich / FTP (Z4)", minPct: 0.91, maxPct: 1.05, purpose: "Stundenleistung & Schwellenintervalltraining", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
    { zone: 5, name: "VO2 Max (Z5)", minPct: 1.06, maxPct: 1.20, purpose: "3–8 Min Intervalle zur Steigerung der VO2 Max", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
    { zone: 6, name: "Anaerobe Kapazität (Z6)", minPct: 1.21, maxPct: 1.50, purpose: "30s–2min All-Out Attacken & Hügelsprints", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
  ];

  return zonesConfig.map((z) => ({
    zone: z.zone,
    name: z.name,
    minWatts: Math.round(ftpWatts * z.minPct),
    maxWatts: Math.round(ftpWatts * z.maxPct),
    pctRange: `${Math.round(z.minPct * 100)}% – ${Math.round(z.maxPct * 100)}% FTP`,
    purpose: z.purpose,
    color: z.color,
  }));
}
