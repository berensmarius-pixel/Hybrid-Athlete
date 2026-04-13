"use client";

import { LayoutGrid, Dumbbell, Bot } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import type { ViewId } from "@/types";

const TABS: { id: ViewId; label: string; Icon: React.ElementType }[] = [
  { id: "dashboard", label: "Woche",    Icon: LayoutGrid },
  { id: "training",  label: "Training", Icon: Dumbbell   },
  { id: "coach",     label: "Coach",    Icon: Bot        },
];

export default function BottomNav() {
  const { activeView, setActiveView, activeSession } = useApp();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-800">
      <div className="flex items-stretch h-16 max-w-lg mx-auto">
        {TABS.map(({ id, label, Icon }) => {
          const active = activeView === id;
          const isTraining = id === "training";
          return (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-150 relative",
                active
                  ? isTraining ? "text-blue-400" : "text-blue-400"
                  : "text-zinc-500 hover:text-zinc-300 active:text-zinc-200"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
              <span>{label}</span>
              {/* Active session indicator dot on Training tab */}
              {isTraining && activeSession && !active && (
                <span className="absolute top-2.5 right-[calc(50%-14px)] w-2 h-2 rounded-full bg-blue-500 ring-2 ring-zinc-900" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
