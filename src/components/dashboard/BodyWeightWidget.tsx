"use client";

import { useState } from "react";
import { Scale, Plus } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateId } from "@/lib/utils";

export default function BodyWeightWidget() {
  const { bodyWeightLog, addBodyWeight } = useApp();
  const [input, setInput] = useState("");

  const sorted = [...bodyWeightLog].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-12);
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const delta = latest && prev ? +(latest.weight - prev.weight).toFixed(1) : null;

  function handleAdd() {
    const kg = parseFloat(input.replace(",", "."));
    if (!kg || kg < 20 || kg > 300) return;
    addBodyWeight({ id: generateId(), date: new Date().toISOString(), weight: kg });
    setInput("");
  }

  // Mini SVG chart
  const chartH = 48;
  const chartW = 200;
  let chart: React.ReactNode = null;
  if (recent.length >= 2) {
    const weights = recent.map((e) => e.weight);
    const min = Math.min(...weights) - 1;
    const max = Math.max(...weights) + 1;
    const toY = (w: number) => chartH - ((w - min) / (max - min)) * chartH;
    const toX = (i: number) => (i / (recent.length - 1)) * chartW;
    const points = recent.map((e, i) => `${toX(i)},${toY(e.weight)}`).join(" ");
    chart = (
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-12" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {recent.map((e, i) => (
          <circle key={e.id} cx={toX(i)} cy={toY(e.weight)} r="2.5" fill="#3b82f6" />
        ))}
      </svg>
    );
  }

  return (
    <div className="mx-4 rounded-2xl bg-zinc-900 border border-zinc-800/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale size={15} className="text-blue-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Körpergewicht</span>
        </div>
        {latest && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-100">{latest.weight} kg</span>
            {(() => {
              const d = new Date(latest.date);
              if (Number.isNaN(d.getTime())) return null;
              return (
                <span className="text-[10px] font-mono text-zinc-500">
                  {d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })},{" "}
                  {d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                </span>
              );
            })()}
            {delta !== null && delta !== 0 && (
              <span className={`text-xs font-semibold ${delta > 0 ? "text-red-400" : "text-green-400"}`}>
                {delta > 0 ? "+" : ""}{delta} kg
              </span>
            )}
          </div>
        )}
      </div>

      {chart && <div className="mb-3">{chart}</div>}

      {!latest && (
        <p className="text-xs text-zinc-600 mb-3">Noch keine Einträge. Füge dein heutiges Gewicht hinzu.</p>
      )}

      <div className="flex gap-2">
        <input
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="kg eingeben…"
          step="0.1"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        />
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
        >
          <Plus size={15} />
          Eintragen
        </button>
      </div>
    </div>
  );
}
