"use client";

import { LayoutGrid, Dumbbell, UtensilsCrossed, Bot } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import type { ViewId } from "@/types";
import { motion } from "motion/react";
import { useCoachSessionBusy } from "@/lib/coach/coachSession";

const TABS: { id: ViewId; label: string; Icon: React.ElementType }[] = [
  { id: "dashboard", label: "Cockpit", Icon: LayoutGrid },
  { id: "training", label: "Training", Icon: Dumbbell },
  { id: "nutrition", label: "Ernährung", Icon: UtensilsCrossed },
  { id: "coach", label: "Coach", Icon: Bot },
];

export default function BottomNav() {
  const { activeView, setActiveView, activeSession } = useApp();
  const coachBusy = useCoachSessionBusy();

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50 flex justify-center pointer-events-none pb-[env(safe-area-inset-bottom)]">
      <nav className="pointer-events-auto w-full max-w-md bg-zinc-950/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-1.5 shadow-2xl shadow-black/80 ring-1 ring-white/5">
        <div className="flex items-center justify-around relative">
          {TABS.map(({ id, label, Icon }) => {
            const active = activeView === id;
            const isTraining = id === "training";
            const isCoach = id === "coach";
            const showCoachBadge = isCoach && coachBusy && !active;

            return (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                className={cn(
                  "relative flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-2xl text-[11px] font-bold transition-all duration-200 cursor-pointer touch-manipulation z-10",
                  active
                    ? "text-cyan-300 font-extrabold"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
                aria-current={active ? "page" : undefined}
              >
                {/* Framer motion active pill highlight */}
                {active && (
                  <motion.div
                    layoutId="bottomNavPill"
                    className="absolute inset-0 bg-gradient-to-b from-cyan-500/15 to-blue-500/10 border border-cyan-500/30 rounded-2xl -z-10 shadow-lg shadow-cyan-500/10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}

                <div className="relative">
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.5 : 1.8}
                    className={cn(
                      "transition-all duration-200",
                      active ? "scale-110 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]" : "text-zinc-400"
                    )}
                  />
                  {isTraining && activeSession && !active && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 ring-2 ring-zinc-950 animate-pulse" />
                  )}
                  {/* Coach antwortet im Hintergrund (KI läuft weiter) */}
                  {showCoachBadge && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" title="Coach antwortet im Hintergrund">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500 ring-2 ring-zinc-950" />
                    </span>
                  )}
                </div>

                <span className="mt-1 tracking-tight text-[10px] sm:text-[11px]">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
