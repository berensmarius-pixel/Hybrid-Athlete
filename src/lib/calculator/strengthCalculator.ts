// ─── 1RM & Hybrid Athlete Strength Calculator Engine ─────────────────────────

export interface OneRepMaxResult {
  epley: number;
  brzycki: number;
  lander: number;
  average: number;
  percentageTable: { percentage: number; weightKg: number; typicalReps: number }[];
}

export function calculateOneRepMax(weightKg: number, reps: number): OneRepMaxResult {
  if (reps === 1) {
    const e = weightKg;
    return {
      epley: e,
      brzycki: e,
      lander: e,
      average: e,
      percentageTable: generatePercentageTable(e),
    };
  }

  // Epley: w * (1 + r / 30)
  const epley = Math.round(weightKg * (1 + reps / 30));
  // Brzycki: w / (1.0278 - 0.0278 * r)
  const brzycki = Math.round(weightKg / (1.0278 - 0.0278 * reps));
  // Lander: (100 * w) / (101.3 - 2.67123 * r)
  const lander = Math.round((100 * weightKg) / (101.3 - 2.67123 * reps));
  const average = Math.round((epley + brzycki + lander) / 3);

  return {
    epley,
    brzycki,
    lander,
    average,
    percentageTable: generatePercentageTable(average),
  };
}

function generatePercentageTable(oneRm: number) {
  const pcts = [
    { percentage: 95, typicalReps: 2 },
    { percentage: 90, typicalReps: 4 },
    { percentage: 85, typicalReps: 6 },
    { percentage: 80, typicalReps: 8 },
    { percentage: 75, typicalReps: 10 },
    { percentage: 70, typicalReps: 12 },
    { percentage: 65, typicalReps: 15 },
  ];

  return pcts.map((p) => ({
    percentage: p.percentage,
    weightKg: Math.round((oneRm * p.percentage) / 100 * 2) / 2, // round to 0.5kg
    typicalReps: p.typicalReps,
  }));
}

export type StrengthLevel = "untrained" | "novice" | "intermediate" | "advanced" | "elite";

export interface ExerciseStandard {
  exercise: string;
  oneRm: number;
  bodyweightMultiplier: number;
  level: StrengthLevel;
  nextLevelTarget: number;
}

export interface HybridScoreResult {
  squat1Rm: number;
  bench1Rm: number;
  deadlift1Rm: number;
  bigThreeTotal: number;
  cyclingFtpWatts: number;
  cyclingFtpWattPerKg: number;
  running5kMinutes: number;
  hybridScore: number; // 0-100 score
  hybridTier: "Hybrid Novice" | "Hybrid Competitor" | "Elite Hybrid Athlete" | "All-Round Master";
  summary: string;
}

export function calculateHybridScore(
  bodyWeightKg: number,
  squat1Rm: number,
  bench1Rm: number,
  deadlift1Rm: number,
  cyclingFtpWatts: number,
  running5kMinutes: number
): HybridScoreResult {
  const total = squat1Rm + bench1Rm + deadlift1Rm;
  const strengthRatio = total / (bodyWeightKg || 75);
  const ftpWkg = cyclingFtpWatts / (bodyWeightKg || 75);

  // Strength score component (4.5x BW total = 100 points, 2.5x BW = 50)
  const strengthScore = Math.min(100, Math.max(20, ((strengthRatio - 1.5) / 3.0) * 80 + 20));

  // Cycling endurance score (4.5 W/kg = 100 points, 2.5 W/kg = 50)
  const cyclingScore = Math.min(100, Math.max(20, ((ftpWkg - 1.5) / 3.0) * 80 + 20));

  // Running score (17 min 5k = 100 points, 30 min = 40)
  const runningScore = Math.min(100, Math.max(20, ((32 - running5kMinutes) / 15) * 80 + 20));

  const hybridScore = Math.round(strengthScore * 0.4 + cyclingScore * 0.3 + runningScore * 0.3);

  let hybridTier: HybridScoreResult["hybridTier"] = "Hybrid Novice";
  if (hybridScore >= 85) hybridTier = "All-Round Master";
  else if (hybridScore >= 70) hybridTier = "Elite Hybrid Athlete";
  else if (hybridScore >= 50) hybridTier = "Hybrid Competitor";

  return {
    squat1Rm,
    bench1Rm,
    deadlift1Rm,
    bigThreeTotal: total,
    cyclingFtpWatts,
    cyclingFtpWattPerKg: Math.round(ftpWkg * 10) / 10,
    running5kMinutes,
    hybridScore,
    hybridTier,
    summary: `Starke Ausgewogenheit: ${total} kg Big-3 Total (${strengthRatio.toFixed(2)}× Körpergewicht) kombiniert mit ${ftpWkg.toFixed(1)} W/kg FTP & ${running5kMinutes} Min 5k Pace.`,
  };
}
