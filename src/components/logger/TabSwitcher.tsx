"use client";

import { Dumbbell, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type LogTab = "gym" | "endurance";

interface TabSwitcherProps {
  activeTab: LogTab;
  onChange: (tab: LogTab) => void;
}

export default function TabSwitcher({ activeTab, onChange }: TabSwitcherProps) {
  return (
    <div className="flex gap-2 bg-zinc-800/60 rounded-xl p-1 mx-4">
      <button
        onClick={() => onChange("gym")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150",
          activeTab === "gym"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-zinc-400 hover:text-zinc-200"
        )}
      >
        <Dumbbell size={16} strokeWidth={2} />
        Krafttraining
      </button>
      <button
        onClick={() => onChange("endurance")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150",
          activeTab === "endurance"
            ? "bg-orange-500 text-white shadow-sm"
            : "text-zinc-400 hover:text-zinc-200"
        )}
      >
        <Activity size={16} strokeWidth={2} />
        Ausdauer
      </button>
    </div>
  );
}
