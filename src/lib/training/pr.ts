import type { GymSession, PersonalRecord } from "@/types";

/**
 * Pure PR-Berechnungslogik – bewusst ohne React/Storage-Abhängigkeiten,
 * damit sie unit-testbar bleibt (siehe src/lib/training/pr.test.ts).
 */

/** Epley formula: weight * (1 + reps / 30) */
export function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export function detectNewPRs(
  session: GymSession,
  existing: PersonalRecord[]
): PersonalRecord[] {
  const newPRs: PersonalRecord[] = [];

  for (const entry of session.entries) {
    const name = entry.exercise.trim();
    if (!name) continue;

    const currentBest = existing.find(
      (pr) => pr.exerciseName.toLowerCase() === name.toLowerCase()
    );

    for (const set of entry.sets) {
      if (!set.isCompleted) continue;
      const w = Number(set.weight);
      const r = Number(set.reps);
      if (!w || !r) continue;

      const e1rm = epley1RM(w, r);
      const prev1rm = currentBest?.estimated1RM ?? 0;

      if (e1rm > prev1rm) {
        // Check if we already added a better PR for this exercise this session
        const idx = newPRs.findIndex(
          (p) => p.exerciseName.toLowerCase() === name.toLowerCase()
        );
        const pr: PersonalRecord = {
          exerciseName: name,
          estimated1RM: e1rm,
          bestWeight: w,
          bestReps: r,
          date: session.date,
        };
        if (idx >= 0) {
          if (e1rm > newPRs[idx].estimated1RM) newPRs[idx] = pr;
        } else {
          newPRs.push(pr);
        }
      }
    }
  }

  return newPRs;
}

/** Fügt neue PRs in den Bestandsstand ein (pure). */
export function mergePRs(
  existing: PersonalRecord[],
  detected: PersonalRecord[]
): PersonalRecord[] {
  const next = [...existing];
  for (const pr of detected) {
    const idx = next.findIndex(
      (p) => p.exerciseName.toLowerCase() === pr.exerciseName.toLowerCase()
    );
    if (idx >= 0) next[idx] = pr;
    else next.push(pr);
  }
  return next;
}
