"use client";

import { useState, useRef } from "react";
import {
  X,
  Bluetooth,
  Upload,
  Scale,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileSpreadsheet,
  Activity,
  Heart,
  Droplets,
  Dumbbell,
  Percent,
  Calendar,
  ChevronRight,
  Info,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { InsmartBleManager, BleScaleReading, UserScaleProfile } from "@/lib/scales/insmartBleService";
import { parseFitdaysCsv } from "@/lib/scales/fitdaysParser";
import type { BodyCompositionEntry } from "@/types";
import { generateId, getLocalDateString } from "@/lib/utils";

interface BodyCompositionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BodyCompositionModal({ isOpen, onClose }: BodyCompositionModalProps) {
  const { addBodyWeight, importMultipleBodyCompositionEntries } = useApp();

  const [activeTab, setActiveTab] = useState<"bluetooth" | "import">("bluetooth");

  // Profile configuration for BIA calculations
  const [profile, setProfile] = useState<UserScaleProfile>({
    heightCm: 180,
    age: 26,
    gender: "male",
  });

  // Bluetooth State
  const [bleStatus, setBleStatus] = useState<string>("Bereit zur Verbindung");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [liveReading, setLiveReading] = useState<BleScaleReading | null>(null);
  const [bleSuccessEntry, setBleSuccessEntry] = useState<BodyCompositionEntry | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);
  const bleManagerRef = useRef<InsmartBleManager | null>(null);

  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsedEntries, setCsvParsedEntries] = useState<BodyCompositionEntry[]>([]);
  const [csvParsing, setCsvParsing] = useState<boolean>(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  // Manual Form State
  const [manualDate, setManualDate] = useState<string>(getLocalDateString());
  const [manualWeight, setManualWeight] = useState<string>("");
  const [manualFat, setManualFat] = useState<string>("");
  const [manualMuscle, setManualMuscle] = useState<string>("");
  const [manualWater, setManualWater] = useState<string>("");
  const [manualVisceral, setManualVisceral] = useState<string>("");
  const [manualSaved, setManualSaved] = useState<boolean>(false);

  if (!isOpen) return null;

  // ─── Bluetooth Handlers ───────────────────────────────────────────────────────

  async function handleStartBleScan() {
    setBleError(null);
    setBleSuccessEntry(null);
    setLiveReading(null);
    setIsScanning(true);

    try {
      if (!bleManagerRef.current) {
        bleManagerRef.current = new InsmartBleManager();
      }

      const result = await bleManagerRef.current.connectAndListen(
        profile,
        (reading) => {
          setLiveReading(reading);
        },
        (statusText) => {
          setBleStatus(statusText);
        }
      );

      setBleSuccessEntry(result);
      addBodyWeight(result);
      setIsScanning(false);
    } catch (err: any) {
      console.warn("BLE Fehler:", err);
      setIsScanning(false);
      setBleError(err.message || "Bluetooth-Verbindung konnte nicht hergestellt werden.");
      setBleStatus("Verbindung fehlgeschlagen");
    }
  }

  // ─── CSV Import Handlers ──────────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processCsvFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processCsvFile(file);
  }

  function processCsvFile(file: File) {
    setCsvFile(file);
    setCsvError(null);
    setCsvParsing(true);
    setImportSuccessCount(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = parseFitdaysCsv(text);

        if (!result.success || result.entries.length === 0) {
          setCsvError(result.errors.join(", ") || "Keine gültigen Messungen gefunden.");
          setCsvParsedEntries([]);
        } else {
          setCsvParsedEntries(result.entries);
        }
      } catch (err: any) {
        setCsvError("Fehler beim Lesen der Datei: " + err.message);
      } finally {
        setCsvParsing(false);
      }
    };
    reader.onerror = () => {
      setCsvError("Fehler beim Öffnen der Datei.");
      setCsvParsing(false);
    };
    reader.readAsText(file);
  }

  function handleConfirmImport() {
    if (csvParsedEntries.length === 0) return;
    importMultipleBodyCompositionEntries(csvParsedEntries);
    setImportSuccessCount(csvParsedEntries.length);
    setTimeout(() => {
      onClose();
    }, 1500);
  }

  // ─── Manual Submit ────────────────────────────────────────────────────────────

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const w = parseFloat(manualWeight.replace(",", "."));
    if (isNaN(w) || w <= 0) return;

    const fat = manualFat ? parseFloat(manualFat.replace(",", ".")) : undefined;
    const muscle = manualMuscle ? parseFloat(manualMuscle.replace(",", ".")) : undefined;
    const water = manualWater ? parseFloat(manualWater.replace(",", ".")) : undefined;
    const visceral = manualVisceral ? parseInt(manualVisceral, 10) : undefined;

    const entry: BodyCompositionEntry = {
      id: generateId(),
      date: manualDate,
      weight: w,
      bodyFatPct: fat,
      muscleMassKg: muscle,
      muscleMassPct: muscle ? Math.round((muscle / w) * 100 * 10) / 10 : undefined,
      waterPct: water,
      visceralFat: visceral,
      source: "Manual",
    };

    addBodyWeight(entry);
    setManualSaved(true);
    setTimeout(() => {
      setManualSaved(false);
      onClose();
    }, 1200);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-900 via-blue-950/20 to-zinc-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Scale size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>Insmart & Fitdays Waage</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Körperanalyse
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Gewicht, Körperfett %, Muskelmasse & Wasser synchronisieren
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 px-4 pt-2 gap-2 shrink-0 bg-zinc-950/60">
          <button
            type="button"
            onClick={() => setActiveTab("bluetooth")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === "bluetooth"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Bluetooth size={14} />
            <span>Bluetooth Live-Scan</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("import")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === "import"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileSpreadsheet size={14} />
            <span>Fitdays CSV-Import</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* ── Tab 1: Bluetooth Live ────────────────────────────────────────── */}
          {activeTab === "bluetooth" && (
            <div className="space-y-4">
              {/* Profile Config Strip */}
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs">
                <span className="text-zinc-400">BIA-Berechnungsprofil:</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-200">{profile.heightCm} cm</span>
                  <span className="text-zinc-600">•</span>
                  <span className="font-semibold text-zinc-200">{profile.age} Jahre</span>
                  <span className="text-zinc-600">•</span>
                  <span className="font-semibold text-zinc-200">{profile.gender === "male" ? "Männlich" : "Weiblich"}</span>
                </div>
              </div>

              {/* Live Scale Visualizer */}
              <div className="p-6 rounded-3xl bg-linear-to-b from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800 text-center space-y-3 relative overflow-hidden">
                <div className="relative inline-flex items-center justify-center">
                  <div
                    className={`w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center transition-all ${
                      isScanning
                        ? "border-blue-500 shadow-xl shadow-blue-500/20 animate-pulse bg-blue-500/5"
                        : bleSuccessEntry
                        ? "border-emerald-500 bg-emerald-500/5"
                        : "border-zinc-800 bg-zinc-950"
                    }`}
                  >
                    <Scale size={24} className={isScanning ? "text-blue-400" : bleSuccessEntry ? "text-emerald-400" : "text-zinc-600"} />
                    <span className="text-xl font-mono font-bold text-zinc-100 mt-1">
                      {liveReading?.weightKg || bleSuccessEntry?.weight || "--.-"}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-zinc-500">kg</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-zinc-200">{bleStatus}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Schalte Bluetooth am Handy/PC ein und tippe mit dem Fuß kurz auf die Insmart-Waage.
                  </p>
                </div>

                {bleError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-center gap-2">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{bleError}</span>
                  </div>
                )}

                {bleSuccessEntry && (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-2 animate-in zoom-in-95">
                    <div className="flex items-center justify-center gap-1.5 font-bold">
                      <CheckCircle2 size={16} />
                      <span>Messung erfolgreich gespeichert!</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-center">
                        <span className="text-[10px] text-zinc-500 block">Körperfett</span>
                        <span className="text-sm font-bold text-zinc-100">{bleSuccessEntry.bodyFatPct}%</span>
                      </div>
                      <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-center">
                        <span className="text-[10px] text-zinc-500 block">Muskelmasse</span>
                        <span className="text-sm font-bold text-blue-400">{bleSuccessEntry.muscleMassKg} kg</span>
                      </div>
                      <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-center">
                        <span className="text-[10px] text-zinc-500 block">Wasser</span>
                        <span className="text-sm font-bold text-emerald-400">{bleSuccessEntry.waterPct}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {!bleSuccessEntry && (
                  <button
                    type="button"
                    onClick={handleStartBleScan}
                    disabled={isScanning}
                    className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>Verbinde mit Insmart-Waage...</span>
                      </>
                    ) : (
                      <>
                        <Bluetooth size={15} />
                        <span>Insmart Waage verbinden & wiegen</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Tab 2: Fitdays CSV Import ────────────────────────────────────── */}
          {activeTab === "import" && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="p-6 rounded-2xl border-2 border-dashed border-zinc-800 hover:border-blue-500/50 bg-zinc-950/60 text-center space-y-3 transition-colors cursor-pointer"
                onClick={() => document.getElementById("csvFileInput")?.click()}
              >
                <input
                  id="csvFileInput"
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mx-auto">
                  <Upload size={22} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">
                    {csvFile ? csvFile.name : "Fitdays CSV-Datei hier ablegen"}
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    oder klicken, um eine Exportdatei vom Smartphone auszuwählen
                  </p>
                </div>
              </div>

              {/* Instructions */}
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 space-y-1">
                <p className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Info size={13} className="text-blue-400" />
                  <span>So exportierst du aus Fitdays:</span>
                </p>
                <p className="text-[11px]">
                  1. Öffne die <strong>Fitdays App</strong> ➔ Gehe auf <strong>Verlauf / Chart</strong>.
                </p>
                <p className="text-[11px]">
                  2. Klicke oben rechts auf das <strong>Exportieren-Symbol</strong> und teile die CSV-Datei mit deinem PC oder Browser.
                </p>
              </div>

              {csvError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{csvError}</span>
                </div>
              )}

              {csvParsedEntries.length > 0 && (
                <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200">
                      Gefundene Messungen: {csvParsedEntries.length}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {csvParsedEntries[csvParsedEntries.length - 1]?.date} bis {csvParsedEntries[0]?.date}
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {csvParsedEntries.slice(0, 5).map((e, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-zinc-900/60">
                        <span className="font-mono text-zinc-400">{e.date}</span>
                        <span className="font-bold text-zinc-100">{e.weight} kg</span>
                        <span className="text-blue-400 font-semibold">{e.bodyFatPct ? `${e.bodyFatPct}% KFA` : "--"}</span>
                        <span className="text-emerald-400 font-semibold">{e.muscleMassKg ? `${e.muscleMassKg}kg Muskel` : "--"}</span>
                      </div>
                    ))}
                    {csvParsedEntries.length > 5 && (
                      <p className="text-[11px] text-center text-zinc-500 italic pt-1">
                        ... und {csvParsedEntries.length - 5} weitere Messungen
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={15} />
                    <span>Alle {csvParsedEntries.length} Messungen in Hybrid Athlete importieren</span>
                  </button>
                </div>
              )}

              {importSuccessCount !== null && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 animate-in zoom-in-95">
                  <CheckCircle2 size={16} />
                  <span>{importSuccessCount} Messungen erfolgreich importiert!</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
