"use client";

import { useEffect } from "react";
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
      <div className="w-full max-w-md p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-4 text-center">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-lg font-semibold text-zinc-100">
          Etwas ist schiefgelaufen
        </h1>
        <p className="text-sm text-zinc-400">
          Ein Fehler ist beim Rendern aufgetreten. Deine gespeicherten Daten
          sind nicht betroffen.
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <Button onClick={reset}>Erneut versuchen</Button>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="border-zinc-700"
          >
            App neu laden
          </Button>
        </div>
      </div>
    </div>
  );
}
