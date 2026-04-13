"use client";

import { useEffect } from "react";
import { Trophy } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { PersonalRecord } from "@/types";

interface PRBannerProps {
  prs: PersonalRecord[];
  onDismiss: () => void;
}

export default function PRBanner({ prs, onDismiss }: PRBannerProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (prs.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-16 z-50 flex flex-col gap-2 px-4 pointer-events-none">
      {prs.map((pr) => (
        <div
          key={pr.exerciseName}
          className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/20 border border-amber-400/40 shadow-lg backdrop-blur-sm pointer-events-auto"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500/30 flex items-center justify-center shrink-0">
            <Trophy size={18} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide">Neuer Persönlicher Rekord!</p>
            <p className="text-sm font-bold text-zinc-100 truncate">{pr.exerciseName}</p>
            <p className="text-xs text-amber-200/70">
              {pr.bestWeight} kg × {pr.bestReps} Wdh · ~{pr.estimated1RM} kg 1RM
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Self-contained PR banner that reads directly from AppContext */
export function PRBannerAuto() {
  const { newPRs, clearNewPRs } = useApp();
  if (newPRs.length === 0) return null;
  return <PRBanner prs={newPRs} onDismiss={clearNewPRs} />;
}
