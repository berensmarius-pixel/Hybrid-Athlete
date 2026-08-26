"use client";

import { LayoutGrid, List, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DISCIPLINE_FILTER_OPTIONS,
  FOCUS_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  type DisciplineFilter,
  type IntensityFocus,
  type LibraryFilters,
  type LibrarySortMode,
  type WorkoutStatus,
} from "../types";

interface LibraryFilterBarProps {
  filters: LibraryFilters;
  onChange: (patch: Partial<LibraryFilters>) => void;
  resultCount: number;
  totalCount: number;
  sortMode: LibrarySortMode;
  onSortChange: (mode: LibrarySortMode) => void;
  layout: "grid" | "list";
  onLayoutChange: (layout: "grid" | "list") => void;
}

const SORT_OPTIONS: Array<{ id: LibrarySortMode; label: string }> = [
  { id: "newest", label: "Neueste zuerst" },
  { id: "duration", label: "Längste Dauer" },
  { id: "tss", label: "Höchster Load" },
  { id: "title", label: "Titel A–Z" },
];

export default function LibraryFilterBar({
  filters,
  onChange,
  resultCount,
  totalCount,
  sortMode,
  onSortChange,
  layout,
  onLayoutChange,
}: LibraryFilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Fuzzy-Suche nach Titel, Übung oder Notizen…"
            className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 focus:border-cyan-500/50 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors"
          />
          {filters.query && (
            <button
              onClick={() => onChange({ query: "" })}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              aria-label="Suche löschen"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <select
            value={sortMode}
            onChange={(e) => onSortChange(e.target.value as LibrarySortMode)}
            className="bg-zinc-900/90 border border-zinc-800 rounded-2xl px-3 py-2.5 text-xs font-bold text-zinc-300 outline-none focus:border-cyan-500/50 cursor-pointer"
            aria-label="Sortierung"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="flex bg-zinc-900/90 border border-zinc-800 rounded-2xl p-1">
            <button
              onClick={() => onLayoutChange("grid")}
              className={cn(
                "p-1.5 rounded-xl transition-colors cursor-pointer",
                layout === "grid" ? "bg-zinc-800 text-cyan-300" : "text-zinc-500 hover:text-zinc-200"
              )}
              aria-label="Rasteransicht"
              title="Rasteransicht"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => onLayoutChange("list")}
              className={cn(
                "p-1.5 rounded-xl transition-colors cursor-pointer",
                layout === "list" ? "bg-zinc-800 text-cyan-300" : "text-zinc-500 hover:text-zinc-200"
              )}
              aria-label="Listenansicht"
              title="Listenansicht"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_auto_1fr] gap-x-4 gap-y-2 items-start">
        <FilterGroup label="Disziplin">
          {DISCIPLINE_FILTER_OPTIONS.map((opt) => (
            <Chip
              key={opt.id}
              active={filters.discipline === opt.id}
              onClick={() => onChange({ discipline: opt.id as DisciplineFilter })}
            >
              {opt.label}
            </Chip>
          ))}
        </FilterGroup>

        <FilterGroup label="Intensität / Fokus">
          {FOCUS_FILTER_OPTIONS.map((opt) => (
            <Chip
              key={opt.id}
              active={filters.focus === opt.id}
              onClick={() => onChange({ focus: opt.id as IntensityFocus | "all" })}
            >
              {opt.label}
            </Chip>
          ))}
        </FilterGroup>

        <FilterGroup label="Status">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <Chip
              key={opt.id}
              active={filters.status === opt.id}
              onClick={() => onChange({ status: opt.id as WorkoutStatus | "all" })}
            >
              {opt.label}
            </Chip>
          ))}
          <span className="ml-auto text-[11px] font-mono text-zinc-500 self-center whitespace-nowrap hidden xl:inline">
            {resultCount}/{totalCount} Workouts
          </span>
        </FilterGroup>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center flex-wrap gap-1.5">
      <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-600 mr-0.5 w-full sm:w-auto">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full border text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer active:scale-95",
        active
          ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/10"
          : "bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
      )}
    >
      {children}
    </button>
  );
}
