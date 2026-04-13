"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2, X } from "lucide-react";
import {
  searchWgerExercises,
  fetchWgerExerciseInfo,
  WGER_BASE,
  CATEGORY_DE,
  CATEGORY_COLORS,
} from "@/lib/wgerApi";
import type { WgerSuggestion, WgerExerciseInfo } from "@/lib/wgerApi";

interface ExerciseSearchInputProps {
  name: string;
  onChangeName: (name: string) => void;
  onSelectWger: (info: WgerExerciseInfo) => void;
}

export default function ExerciseSearchInput({
  name,
  onChangeName,
  onSelectWger,
}: ExerciseSearchInputProps) {
  const [suggestions, setSuggestions] = useState<WgerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingBaseId, setLoadingBaseId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    try {
      const results = await searchWgerExercises(term);
      setSuggestions(results);
      setOpen(results.length > 0);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleInput(value: string) {
    onChangeName(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 320);
  }

  function handleClear() {
    onChangeName("");
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  async function handleSelect(suggestion: WgerSuggestion) {
    setOpen(false);
    setSuggestions([]);
    // Optimistically show the name right away
    onChangeName(suggestion.data.name);
    setLoadingBaseId(suggestion.data.base_id);
    try {
      const info = await fetchWgerExerciseInfo(suggestion.data.base_id);
      if (info) {
        if (info.name) onChangeName(info.name);
        onSelectWger(info);
      }
    } finally {
      setLoadingBaseId(null);
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const isBusy = searching || loadingBaseId !== null;

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      {/* Input */}
      <div className="relative flex items-center">
        <span className="absolute left-3 text-zinc-500 pointer-events-none">
          {isBusy ? (
            <Loader2 size={14} className="animate-spin text-blue-400" />
          ) : (
            <Search size={14} />
          )}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Übung suchen oder tippen…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-8 py-1.5 text-sm font-semibold text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/25 transition-colors"
        />

        {name && !isBusy && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Löschen"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-1.5 border-b border-zinc-700/60">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Wger-Datenbank
            </p>
          </div>

          {suggestions.map((s) => {
            const thumb = s.data.image_thumbnail
              ? `${WGER_BASE}${s.data.image_thumbnail}`
              : null;
            const catEn    = s.data.category;
            const catDe    = CATEGORY_DE[catEn] ?? catEn;
            const catColor = CATEGORY_COLORS[catEn] ?? "text-zinc-400 bg-zinc-700/40 border-zinc-600";
            const isLoading = loadingBaseId === s.data.base_id;

            return (
              <button
                key={s.data.id}
                onMouseDown={() => handleSelect(s)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-700/60 transition-colors text-left border-b border-zinc-700/30 last:border-0 group"
              >
                {/* Thumbnail */}
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-700 shrink-0 flex items-center justify-center">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-base">💪</span>
                  )}
                </div>

                {/* Name */}
                <span className="flex-1 min-w-0 text-sm text-zinc-100 truncate group-hover:text-white">
                  {s.data.name}
                </span>

                {/* Loading indicator */}
                {isLoading && (
                  <Loader2 size={13} className="animate-spin text-blue-400 shrink-0" />
                )}

                {/* Category badge */}
                <span
                  className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catColor}`}
                >
                  {catDe}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
