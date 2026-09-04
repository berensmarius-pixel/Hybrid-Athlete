"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  X,
  Activity,
  Bike,
  Dumbbell,
  Heart,
  Zap,
  Mountain,
  Clock,
  Route,
  Flame,
  Gauge,
  Thermometer,
  CloudSun,
  MapPin,
  ExternalLink,
  Loader2,
  AlertCircle,
  Timer,
  TrendingUp,
  Footprints,
} from "lucide-react";
import type { GarminActivity, GarminActivityDetails } from "@/types";
import { fetchGarminActivityDetails } from "@/lib/garmin/garminService";
import { cn } from "@/lib/utils";

const LeafletMap = dynamic(() => import("./ActivityTrackMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-zinc-900">
      <Loader2 size={16} className="animate-spin text-cyan-400" />
    </div>
  ),
});

import AreaChart, { Area } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";

interface GarminActivityDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: GarminActivity | null;
}

// ─── Bklit Telemetrie-Chart ──────────────────────────────────────────────────

function LineChart({
  title,
  icon,
  color,
  values,
  unitLabel,
  formatValue,
  stepSeconds = 1,
}: {
  title: string;
  icon?: React.ReactNode;
  color: string;
  values: number[];
  unitLabel?: string;
  formatValue?: (v: number) => string;
  stepSeconds?: number;
}) {
  const fmt = formatValue ?? ((v: number) => String(Math.round(v * 10) / 10));

  const chartData = useMemo(() => {
    if (!values.length) return [];
    // Downsample to max 120 points for buttery smooth rendering
    const maxPoints = 120;
    const stride = Math.max(1, Math.floor(values.length / maxPoints));
    const result: Array<{ index: number; value: number; date: Date }> = [];
    const baseEpoch = 1700000000000;

    for (let i = 0; i < values.length; i += stride) {
      const v = values[i];
      const sec = i * stepSeconds;
      result.push({
        index: i,
        value: v,
        date: new Date(baseEpoch + sec * 1000),
      });
    }
    return result;
  }, [values, stepSeconds]);

  const totalSec = values.length * stepSeconds;
  const avgVal = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const maxVal = values.length ? Math.max(...values) : 0;

  return (
    <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold flex items-center gap-1.5" style={{ color }}>
          {icon}
          {title}
        </span>
        <span className="text-[10px] font-mono text-zinc-500">
          Ø {fmt(avgVal)}
          {unitLabel ? ` ${unitLabel}` : ""} · max {fmt(maxVal)}
        </span>
      </div>

      <div className="h-24 w-full overflow-hidden">
        {chartData.length >= 2 ? (
          <AreaChart
            data={chartData as unknown as Record<string, unknown>[]}
            xDataKey="date"
            aspectRatio="3.2 / 1"
            margin={{ top: 6, right: 6, bottom: 12, left: 6 }}
            className="w-full h-full"
          >
            <Grid horizontal stroke="#27272a" strokeDasharray="3 4" numTicksRows={3} />
            <Area
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <ChartTooltip
              rows={(p) => [
                {
                  color: color,
                  label: title,
                  value: `${fmt(Number(p.value))}${unitLabel ? ` ${unitLabel}` : ""}`,
                },
              ]}
            />
          </AreaChart>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-zinc-600">
            Keine Daten
          </div>
        )}
      </div>

      <div className="flex justify-between text-[9px] font-mono text-zinc-600">
        <span>0:00</span>
        <span>
          {Math.floor(totalSec / 3600)}:{String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function paceFromMps(mps: number): string {
  if (!mps || mps <= 0) return "–";
  const secPerKm = 1000 / mps;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

const ZONE_COLORS = ["#34d399", "#a3e635", "#fbbf24", "#fb923c", "#f87171"];
const ZONE_NAMES = ["Z1 Erholung", "Z2 Grundlage", "Z3 Tempo", "Z4 Schwelle", "Z5 VO2Max"];

function ZoneBars({ zones }: { zones?: Array<{ zoneNumber?: number; secsInZone?: number }> }) {
  const valid = (zones || []).filter((z) => (z.secsInZone ?? 0) > 0);
  if (valid.length === 0) return null;
  const total = valid.reduce((a, z) => a + (z.secsInZone || 0), 0);
  return (
    <div className="space-y-2">
      <div className="h-5 w-full rounded-xl overflow-hidden flex gap-px bg-zinc-900">
        {valid.map((z) => (
          <div
            key={z.zoneNumber}
            style={{
              width: `${((z.secsInZone || 0) / total) * 100}%`,
              background: ZONE_COLORS[(z.zoneNumber || 1) - 1] || "#71717a",
            }}
            title={`${ZONE_NAMES[(z.zoneNumber || 1) - 1]}: ${fmtDuration(z.secsInZone || 0)}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
        {valid.map((z) => (
          <div key={z.zoneNumber} className="p-2 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
            <span className="text-[10px] font-bold block" style={{ color: ZONE_COLORS[(z.zoneNumber || 1) - 1] }}>
              {ZONE_NAMES[(z.zoneNumber || 1) - 1]}
            </span>
            <span className="text-xs font-mono font-bold text-zinc-100">{fmtDuration(z.secsInZone || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Haupt-Komponente ────────────────────────────────────────────────────────

export default function GarminActivityDetailModal({ isOpen, onClose, activity }: GarminActivityDetailModalProps) {
  const [details, setDetails] = useState<GarminActivityDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const garminId = activity
    ? activity.garminId || (activity.id.startsWith("garmin-") ? activity.id.slice(7) : "")
    : "";

  async function loadDetails(act: GarminActivity) {
    setDetails(null);
    setError(null);
    setLoading(true);
    try {
      const data = await fetchGarminActivityDetails(act);
      setDetails(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen || !activity) return;
    void loadDetails(activity);
  }, [isOpen, activity]);

  if (!isOpen || !activity) return null;

  const s = details?.summary;
  const series = details?.series || {};
  const units = details?.seriesUnits || {};
  const step = details?.sampleStepSeconds || 1;
  const isRun = activity.type === "running";
  const hasGps = (details?.gpsTrack?.length || 0) > 2;

  const statGrid: Array<{ label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode }> = [];
  if (s?.distance) statGrid.push({ label: "Distanz", value: `${(s.distance / 1000).toFixed(2)} km`, icon: <Route size={13} />, color: "text-cyan-400" });
  if (s?.movingDuration || s?.elapsedDuration) statGrid.push({ label: "Zeit (bewegt)", value: fmtDuration(s!.movingDuration || s!.elapsedDuration!), sub: s?.elapsedDuration ? `Gesamt ${fmtDuration(s.elapsedDuration)}` : undefined, icon: <Clock size={13} /> });
  if (s?.averageHR) statGrid.push({ label: "Ø Puls", value: `${Math.round(s.averageHR)} bpm`, sub: s?.maxHR ? `max ${Math.round(s.maxHR)}` : undefined, icon: <Heart size={13} />, color: "text-rose-400" });
  if (s?.averagePower) statGrid.push({ label: "Ø Leistung", value: `${Math.round(s.averagePower)} W`, sub: s?.normalizedPower ? `NP ${Math.round(s.normalizedPower)} W` : undefined, icon: <Zap size={13} />, color: "text-amber-400" });
  if (isRun && s?.averageMovingSpeed) statGrid.push({ label: "Ø Pace", value: paceFromMps(s.averageMovingSpeed), sub: s?.averageSpeed ? `Gesamt ${paceFromMps(s.averageSpeed)}` : undefined, icon: <Footprints size={13} />, color: "text-emerald-400" });
  else if (s?.averageSpeed) statGrid.push({ label: "Ø Speed", value: `${(s.averageSpeed * 3.6).toFixed(1)} km/h`, sub: s?.maxSpeed ? `max ${(s.maxSpeed * 3.6).toFixed(1)}` : undefined, icon: <Gauge size={13} />, color: "text-emerald-400" });
  if (s?.elevationGain != null) statGrid.push({ label: "Höhenmeter", value: `+${Math.round(s.elevationGain)} m`, sub: s?.elevationLoss ? `−${Math.round(s.elevationLoss)} m` : undefined, icon: <Mountain size={13} />, color: "text-orange-400" });
  if (s?.calories) statGrid.push({ label: "Kalorien", value: `${Math.round(s.calories)} kcal`, icon: <Flame size={13} />, color: "text-red-400" });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-cyan-950/20 to-zinc-950">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shrink-0">
              {activity.type === "cycling" ? <Bike size={20} /> : activity.type === "running" ? <Footprints size={20} /> : activity.type === "gym" ? <Dumbbell size={20} /> : <Activity size={20} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-zinc-100 truncate">{activity.name}</h2>
              <p className="text-xs text-zinc-400 truncate">
                {s?.startTimeLocal || activity.startTime}
                {activity.device ? ` · ${activity.device}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {garminId && (
              <a
                href={`https://connect.garmin.com/modern/activity/${garminId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                title="In Garmin Connect öffnen"
              >
                <ExternalLink size={18} />
              </a>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="py-14 flex flex-col items-center gap-3 text-zinc-500">
              <Loader2 size={26} className="animate-spin text-cyan-400" />
              <span className="text-xs">Lade vollständige Telemetrie aus Garmin Connect…</span>
            </div>
          )}
          {error && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-medium flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && details && (
            <>
              {/* Kennzahlen */}
              {statGrid.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {statGrid.map((g) => (
                    <div key={g.label} className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <span className={cn("text-[10px] uppercase font-bold text-zinc-500 flex items-center gap-1", g.color)}>
                        {g.icon}
                        {g.label}
                      </span>
                      <span className="text-base sm:text-lg font-black font-mono text-zinc-100 block">{g.value}</span>
                      {g.sub && <span className="text-[10px] text-zinc-500">{g.sub}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* GPS-Karte */}
              {hasGps && (
                <div className="rounded-2xl overflow-hidden border border-zinc-800 h-56 relative bg-zinc-900">
                  <LeafletMap points={(details.gpsTrack || []).map((p) => [p.lat, p.lon] as [number, number])} />
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/60 text-[10px] font-bold text-zinc-300 flex items-center gap-1 pointer-events-none">
                    <MapPin size={10} className="text-cyan-400" />
                    GPS-Track ({details.gpsTrack!.length} Punkte)
                  </span>
                </div>
              )}

              {/* Messreihen-Grafe */}
              {Object.keys(series).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
                    <TrendingUp size={13} className="text-cyan-400" />
                    Messreihen ({Object.keys(series).length} Kanäle · {step}s Auflösung)
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {series.heartRateBpm && <LineChart title="Herzfrequenz" icon={<Heart size={12} />} color="#f87171" values={series.heartRateBpm} unitLabel="bpm" stepSeconds={step} />}
                    {series.powerWatts && <LineChart title="Leistung" icon={<Zap size={12} />} color="#fbbf24" values={series.powerWatts} unitLabel="W" stepSeconds={step} />}
                    {series.speedMps && <LineChart title={isRun ? "Tempo" : "Geschwindigkeit"} icon={<Gauge size={12} />} color="#34d399" values={series.speedMps.map((v) => v * (isRun ? 1 : 3.6))} unitLabel={isRun ? "m/s" : "km/h"} formatValue={isRun ? paceFromMps : (v) => v.toFixed(1)} stepSeconds={step} />}
                    {series.elevationMeters && <LineChart title="Höhe" icon={<Mountain size={12} />} color="#fb923c" values={series.elevationMeters} unitLabel="m" stepSeconds={step} />}
                    {(series.bikeCadenceRpm || series.runCadenceSpm) && (
                      <LineChart
                        title="Kadenz"
                        icon={<Activity size={12} />}
                        color="#a78bfa"
                        values={series.bikeCadenceRpm || series.runCadenceSpm}
                        unitLabel={units.bikeCadenceRpm || units.runCadenceSpm}
                        stepSeconds={step}
                      />
                    )}
                    {series.airTemperatureC && <LineChart title="Temperatur" icon={<Thermometer size={12} />} color="#38bdf8" values={series.airTemperatureC} unitLabel="°C" stepSeconds={step} />}
                    {series.availableStamina && <LineChart title="Verfügbare Stamina" color="#22d3ee" values={series.availableStamina} stepSeconds={step} />}
                    {series.verticalSpeedMps && <LineChart title="Vertikal-Geschwindigkeit" color="#fdba74" values={series.verticalSpeedMps} unitLabel="m/s" stepSeconds={step} />}
                  </div>
                </div>
              )}

              {/* Zonenverteilung */}
              {(details.hrTimeInZones?.zones?.length || details.powerTimeInZones?.zones?.length) && (
                <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <Timer size={13} className="text-cyan-400" /> Zeit in Zonen
                  </h3>
                  {details.hrTimeInZones?.zones?.length ? (
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-rose-400">Herzfrequenz</span>
                      <ZoneBars zones={details.hrTimeInZones.zones} />
                    </div>
                  ) : null}
                  {details.powerTimeInZones?.zones?.length ? (
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-amber-400">Leistung</span>
                      <ZoneBars zones={details.powerTimeInZones.zones} />
                    </div>
                  ) : null}
                </div>
              )}

              {/* Splits / Runden */}
              {(details.splits?.length ?? 0) > 0 && (
                <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <Route size={13} className="text-cyan-400" /> Runden &amp; Splits ({details.splits!.length})
                  </h3>
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase font-bold text-zinc-500 border-b border-zinc-800">
                          <th className="py-1.5 pr-2">#</th>
                          <th className="py-1.5 pr-2">Distanz</th>
                          <th className="py-1.5 pr-2">Zeit</th>
                          <th className="py-1.5 pr-2">{isRun ? "Pace" : "Speed"}</th>
                          <th className="py-1.5 pr-2">Puls</th>
                          {details.splits!.some((l) => l.averagePower != null) && <th className="py-1.5 pr-2">Power</th>}
                          {details.splits!.some((l) => l.elevationGain != null) && <th className="py-1.5 pr-2">↑ Hm</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {details.splits!.map((lap, i) => (
                          <tr key={i} className="border-b border-zinc-800/50 text-zinc-300 font-mono">
                            <td className="py-1.5 pr-2 text-zinc-500">{lap.lapIndex ?? i + 1}</td>
                            <td className="py-1.5 pr-2">{((lap.distance || 0) / 1000).toFixed(2)} km</td>
                            <td className="py-1.5 pr-2">{fmtDuration(lap.duration || lap.elapsedDuration || 0)}</td>
                            <td className="py-1.5 pr-2 text-emerald-400">{isRun ? paceFromMps(lap.averageMovingSpeed || lap.averageSpeed || 0) : `${((lap.averageMovingSpeed || lap.averageSpeed || 0) * 3.6).toFixed(1)} km/h`}</td>
                            <td className="py-1.5 pr-2 text-rose-400">{lap.averageHR ? Math.round(lap.averageHR) : "–"}</td>
                            {details.splits!.some((l) => l.averagePower != null) && <td className="py-1.5 pr-2 text-amber-400">{lap.averagePower ? Math.round(lap.averagePower) : "–"}</td>}
                            {details.splits!.some((l) => l.elevationGain != null) && <td className="py-1.5 pr-2 text-orange-400">{lap.elevationGain != null ? `+${Math.round(lap.elevationGain)}` : "–"}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Kraft-Übungen */}
              {details.exerciseSets?.exerciseSets && details.exerciseSets.exerciseSets.length > 0 && (
                <StrengthSets sets={details.exerciseSets.exerciseSets} />
              )}

              {/* Wetter & Gear */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {details.weather && (
                  <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 flex items-center gap-1">
                      <CloudSun size={11} className="text-sky-400" /> Wetter bei Start
                    </span>
                    <span className="text-sm font-bold text-zinc-100 block">
                      {details.weather.weatherTypeDTO?.desc || "–"}
                    </span>
                    <span className="text-xs text-zinc-400 block font-mono">
                      {details.weather.temp ? `${Math.round(((details.weather.temp - 32) * 5) / 9)}°C` : ""}
                      {details.weather.windSpeed ? ` · Wind ${Math.round(details.weather.windSpeed * 1.609)} km/h ${details.weather.windDirectionCompassPoint || ""}` : ""}
                      {details.weather.relativeHumidity ? ` · ${details.weather.relativeHumidity}% LF` : ""}
                    </span>
                  </div>
                )}
                {details.gear && details.gear.length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 flex items-center gap-1">
                      <Bike size={11} className="text-cyan-400" /> Equipment
                    </span>
                    {details.gear.map((g, i) => (
                      <span key={i} className="text-xs text-zinc-200 block font-medium">
                        {g.displayName || g.customMakeModel || g.modelName || "Garmin Gear"}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Zusatz-Metriken */}
              {(s?.trainingStressScore || s?.intensityFactor || s?.moderateIntensityMinutes || s?.vigorousIntensityMinutes || s?.activityTrainingLoad) && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {s?.trainingStressScore && (
                    <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">TSS</span>
                      <span className="text-sm font-black font-mono text-purple-400">{Math.round(s.trainingStressScore)}</span>
                    </div>
                  )}
                  {s?.intensityFactor && (
                    <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">IF</span>
                      <span className="text-sm font-black font-mono text-purple-400">{s.intensityFactor.toFixed(2)}</span>
                    </div>
                  )}
                  {s?.activityTrainingLoad && (
                    <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">Train.-Load</span>
                      <span className="text-sm font-black font-mono text-cyan-400">{Math.round(s.activityTrainingLoad)}</span>
                    </div>
                  )}
                  {!!s?.moderateIntensityMinutes && (
                    <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">Moderate Min.</span>
                      <span className="text-sm font-black font-mono text-emerald-400">{s.moderateIntensityMinutes}</span>
                    </div>
                  )}
                  {!!s?.vigorousIntensityMinutes && (
                    <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block">Vigorous Min.</span>
                      <span className="text-sm font-black font-mono text-amber-400">{s.vigorousIntensityMinutes}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Kraft-Sets ──────────────────────────────────────────────────────────────

interface RawSet {
  exercises?: Array<{ category?: string; name?: string }>;
  duration?: number;
  repetitionCount?: number;
  weight?: number;
  setType?: string;
}

function StrengthSets({ sets }: { sets: Array<Record<string, unknown>> }) {
  const groups = useMemo(() => {
    const out: Array<{ label: string; sets: RawSet[] }> = [];
    for (const raw of sets as unknown as RawSet[]) {
      const ex = raw.exercises?.[0];
      const label =
        ex?.name ||
        ex?.category ||
        (raw.setType === "REST" ? null : raw.setType === "WARMUP" ? "Warm-up" : raw.setType === "COOLDOWN" ? "Cool-down" : "Übung");
      if (!label) continue;
      const last = out[out.length - 1];
      if (last && last.label === label) last.sets.push(raw);
      else out.push({ label, sets: [raw] });
    }
    return out.filter((g) => g.sets.some((x) => x.setType !== "REST"));
  }, [sets]);

  if (groups.length === 0) return null;

  return (
    <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-3">
      <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
        <Dumbbell size={13} className="text-cyan-400" /> Kraft-Protokoll ({groups.length} Übungen)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {groups.map((g, i) => (
          <div key={i} className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80">
            <span className="text-xs font-bold text-zinc-100 capitalize block mb-1.5">
              {g.label.replaceAll("_", " ").toLowerCase()}
            </span>
            <div className="flex flex-wrap gap-1">
              {g.sets.map((x, j) => (
                <span key={j} className="px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-[10px] font-mono text-zinc-300">
                  {x.repetitionCount ? `${x.repetitionCount}×` : ""}
                  {x.weight ? `${Math.round(x.weight)} kg` : ""}
                  {!x.repetitionCount && !x.weight && x.duration ? `${Math.round(x.duration / 60)} min` : ""}
                  {!x.repetitionCount && !x.weight && !x.duration ? x.setType : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
