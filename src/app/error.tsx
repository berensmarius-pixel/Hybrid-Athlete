"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-Error-Boundary: fängt Render-/Data-Fehler der Seite ab,
 * statt die PWA mit White-Screen zu beenden.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[App] Render-Fehler:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-4 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
          <AlertTriangle size={28} />
        </div>
        <h1 className="text-lg font-bold text-zinc-100">
          Etwas ist schiefgelaufen
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Ein Fehler ist beim Rendern aufgetreten. Deine gespeicherten Daten
          sind nicht betroffen.
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
          <Button onClick={reset} className="min-h-[44px] px-5 font-bold cursor-pointer">
            <RefreshCw size={15} />
            <span>Erneut versuchen</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-5 border-zinc-700 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
          >
            App neu laden
          </Button>
        </div>
      </div>
    </div>
  );
}
