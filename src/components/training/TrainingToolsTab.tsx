"use client";

import { Bike, Activity, MapPin } from "lucide-react";

interface TrainingToolsTabProps {
  onOpenRoutes: () => void;
  onOpenAnatomy: () => void;
}

export default function TrainingToolsTab({
  onOpenRoutes,
  onOpenAnatomy,
}: TrainingToolsTabProps) {
  return (
    <div className="p-3.5 sm:p-5 lg:p-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full space-y-4 sm:space-y-6 pb-28 md:pb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-2 gap-4 sm:gap-6">
        {/* GPX Routes Card */}
        <div className="p-5 sm:p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800/80 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
              <Bike size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Rennrad-Routen & GPX Tracks</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Importiere, plane und analysiere Höhenprofile und GPX-Routen für dein nächstes Outdoor-Training.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenRoutes}
            className="w-full py-3 rounded-2xl bg-orange-500 hover:bg-orange-400 text-zinc-950 font-bold text-xs shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <MapPin size={16} />
            <span>Routenplaner öffnen</span>
          </button>
        </div>

        {/* Muscle Anatomy Card */}
        <div className="p-5 sm:p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800/80 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <Activity size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Muskel-Anatomie & Belastungs-Heatmap</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Visualisiere beanspruchte Muskelgruppen und Erholungszustände über deinen gesamten Trainingszyklus.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenAnatomy}
            className="w-full py-3 rounded-2xl bg-purple-500 hover:bg-purple-400 text-zinc-950 font-bold text-xs shadow-md shadow-purple-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Activity size={16} />
            <span>Anatomie-Viewer öffnen</span>
          </button>
        </div>
      </div>
    </div>
  );
}
