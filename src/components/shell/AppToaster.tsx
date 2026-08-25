"use client";

import { useEffect } from "react";
import { Toaster, toast } from "sonner";

/**
 * Globales Toast-System (sonner) im App-Design.
 * Lauscht zusätzlich auf zentrale Storage-Fehler (Quota) aus usePersistentState.
 */
export default function AppToaster() {
  useEffect(() => {
    const onQuota = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      toast.error("Speicher voll – Daten wurden evtl. nicht gesichert.", {
        description: `Betroffen: ${detail?.key ?? "localStorage"}. Bitte alte Daten exportieren und löschen.`,
        duration: 10000,
      });
    };
    window.addEventListener("ha-storage-quota", onQuota);
    return () => window.removeEventListener("ha-storage-quota", onQuota);
  }, []);

  return (
    <Toaster
      theme="dark"
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        style: {
          background: "#18181b",
          border: "1px solid #3f3f46",
          color: "#f4f4f5",
        },
      }}
    />
  );
}
