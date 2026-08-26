"use client";

import type { NutrientStatus } from "@/lib/nutrition/micro-calculator";
import { averageMicronutrientScore } from "@/lib/nutrition/micro-calculator";

/**
 * Radar-/Spider-Chart der Tages-Erfüllung aller 7 Schlüssel-Mikronährstoffe.
 * Reines SVG – keine Chart-Library nötig.
 */

const CX = 130;
const CY = 112;
const R = 78;

const LEVEL_COLORS = {
  optimal: "#34d399",
  warning: "#fbbf24",
  critical: "#fb7185",
} as const;

function polarPoint(index: number, count: number, fraction: number) {
  const angle = -Math.PI / 2 + index * ((Math.PI * 2) / Math.max(1, count));
  return {
    x: CX + Math.cos(angle) * R * fraction,
    y: CY + Math.sin(angle) * R * fraction,
  };
}

function ringPoints(count: number, fraction: number): string {
  return Array.from({ length: count }, (_, i) => {
    const p = polarPoint(i, count, fraction);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ");
}

interface MicronutrientRadarProps {
  statuses: NutrientStatus[];
}

export default function MicronutrientRadar({ statuses }: MicronutrientRadarProps) {
  const count = statuses.length;
  if (!count) return null;

  const dataPoints = statuses.map((s, i) =>
    polarPoint(i, count, Math.max(0.04, Math.min(s.percent / 100, 1.15)))
  );
  const dataPoly = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const avg = averageMicronutrientScore(statuses);
  const strokeColor =
    avg >= 75 ? LEVEL_COLORS.optimal : avg >= 40 ? LEVEL_COLORS.warning : LEVEL_COLORS.critical;

  return (
    <svg
      viewBox="0 0 260 224"
      className="w-full max-w-[300px] mx-auto"
      role="img"
      aria-label="Mikronährstoff-Radar"
    >
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={ringPoints(count, f)}
          fill="none"
          stroke="#3f3f46"
          strokeWidth={f === 1 ? 1 : 0.6}
          strokeOpacity={0.7}
        />
      ))}

      {/* Spokes */}
      {statuses.map((_, i) => {
        const p = polarPoint(i, count, 1);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={p.x}
            y2={p.y}
            stroke="#3f3f46"
            strokeWidth={0.6}
            strokeOpacity={0.7}
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={dataPoly}
        fill={strokeColor}
        fillOpacity={0.18}
        stroke={strokeColor}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Vertex dots */}
      {statuses.map((s, i) => (
        <circle
          key={s.key}
          cx={dataPoints[i].x}
          cy={dataPoints[i].y}
          r={3}
          fill={LEVEL_COLORS[s.level]}
          stroke="#18181b"
          strokeWidth={1}
        />
      ))}

      {/* Axis labels */}
      {statuses.map((s, i) => {
        const p = polarPoint(i, count, 1);
        const lx = CX + (p.x - CX) * 1.22;
        const ly = CY + (p.y - CY) * 1.2;
        const anchor =
          Math.abs(p.x - CX) < 12 ? "middle" : p.x > CX ? "start" : "end";
        const aboveCenter = p.y < CY - 10;
        return (
          <g key={s.key}>
            <text
              x={lx}
              y={aboveCenter ? ly - 4 : ly + (p.y > CY + 10 ? 12 : 0)}
              textAnchor={anchor}
              fontSize={8.5}
              fontWeight={700}
              fill="#a1a1aa"
            >
              {s.shortLabel}
            </text>
            <text
              x={lx}
              y={aboveCenter ? ly + 5 : ly + (p.y > CY + 10 ? 21 : 9)}
              textAnchor={anchor}
              fontSize={8.5}
              fontFamily="ui-monospace, monospace"
              fontWeight={800}
              fill={LEVEL_COLORS[s.level]}
            >
              {s.percent}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
