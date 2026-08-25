"use client";

import { LayoutGrid, Dumbbell, UtensilsCrossed, Bot } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import type { ViewId } from "@/types";

const TABS: { id: ViewId; label: string; Icon: React.ElementType }[] = [
  { id: "dashboard", label: "Cockpit",   Icon: LayoutGrid      },
  { id: "training",  label: "Training",  Icon: Dumbbell        },
  { id: "nutrition", label: "Ernährung", Icon: UtensilsCrossed },
  { id: "coach",     label: "Coach",     Icon: Bot             },
];

export default function BottomNav() {
  const { activeView, setActiveView, activeSession } = useApp();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-2xl border-t border-zinc-800/80 pb-[calc(env(safe-area-inset-bottom)+4px)] shadow-2xl">
      <div className="flex items-stretch h-16 max-w-md mx-auto px-3">
        {TABS.map(({ id, label, Icon }) => {
          const active = activeView === id;
          const isTraining = id === "training";
          return (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-all duration-150 relative py-1 rounded-2xl active:scale-90 cursor-pointer touch-manipulation",
                active
                  ? "text-cyan-400"
                  : "text-zinc-500 hover:text-zinc-300 active:text-zinc-100"
              )}
              aria-current={active ? "page" : undefined}
            >
              {/* Active glow pill */}
              {active && (
                <span className="absolute top-1.5 w-8 h-1 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
              )}
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} className={cn("transition-transform duration-150", active && "scale-110")} />
              <span>{label}</span>
              {/* Active session indicator dot on Training tab */}
              {isTraining && activeSession && !active && (
                <span className="absolute top-2.5 right-[calc(50%-14px)] w-2.5 h-2.5 rounded-full bg-cyan-400 ring-2 ring-zinc-950 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
