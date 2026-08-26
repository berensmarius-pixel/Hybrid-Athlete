"use client";

import { useCallback, useMemo } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { generateId, getLocalDateString } from "@/lib/utils";
import type { BiomarkerEntry } from "@/lib/nutrition/micro-calculator";

/**
 * Lokaler Modul-State für Mikronährstoffe:
 * - Blutwerte-Historie (Biomarker)
 * - Athleten-Profil (Schweißverlust & Trainingsvolumen für die RDA-Anhebung)
 */

const BIOMARKERS_KEY = "hybrid_athlete_biomarkers";
const MICRO_PROFILE_KEY = "hybrid_athlete_micro_profile";

export interface MicronutrientProfileSettings {
  sweatLossLPerDay: number;
  trainingHoursPerWeek: number;
}

export const DEFAULT_MICRO_PROFILE: MicronutrientProfileSettings = {
  sweatLossLPerDay: 1.2,
  trainingHoursPerWeek: 8,
};

function validateBiomarkers(raw: unknown): BiomarkerEntry[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (e): e is BiomarkerEntry =>
      !!e && typeof (e as BiomarkerEntry).date === "string"
  );
}

export function useBiomarkers() {
  const [biomarkers, setBiomarkers] = usePersistentState<BiomarkerEntry[]>(
    BIOMARKERS_KEY,
    [],
    { validate: validateBiomarkers }
  );

  const saveBiomarker = useCallback(
    (
      values: Omit<BiomarkerEntry, "id"> & { id?: string }
    ) => {
      const entry: BiomarkerEntry = {
        ...values,
        id: values.id || generateId(),
      };
      setBiomarkers((prev) =>
        [entry, ...prev.filter((b) => b.date !== entry.date)].sort((a, b) =>
          b.date.localeCompare(a.date)
        )
      );
    },
    [setBiomarkers]
  );

  const deleteBiomarker = useCallback(
    (id: string) => {
      setBiomarkers((prev) => prev.filter((b) => b.id !== id));
    },
    [setBiomarkers]
  );

  /** Neuester Blutwert-Eintrag (nach Datum sortiert). */
  const latestBiomarker: BiomarkerEntry | null = useMemo(() => {
    if (!biomarkers.length) return null;
    return [...biomarkers].sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [biomarkers]);

  return { biomarkers, latestBiomarker, saveBiomarker, deleteBiomarker };
}

function validateProfile(raw: unknown): MicronutrientProfileSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<MicronutrientProfileSettings>;
  if (typeof p.sweatLossLPerDay !== "number") return null;
  return {
    sweatLossLPerDay: p.sweatLossLPerDay,
    trainingHoursPerWeek:
      typeof p.trainingHoursPerWeek === "number" ? p.trainingHoursPerWeek : 8,
  };
}

export function useMicronutrientProfile() {
  const [profile, setProfile] = usePersistentState<MicronutrientProfileSettings>(
    MICRO_PROFILE_KEY,
    DEFAULT_MICRO_PROFILE,
    { validate: validateProfile }
  );

  const updateProfile = useCallback(
    (patch: Partial<MicronutrientProfileSettings>) => {
      setProfile((prev) => ({ ...prev, ...patch }));
    },
    [setProfile]
  );

  return { profile, updateProfile };
}

/** YYYY-MM-DD für den Modal-Default. */
export function todayDateString(): string {
  return getLocalDateString();
}
