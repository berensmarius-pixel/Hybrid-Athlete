"use client";

import {
  Dispatch,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  applyServerValue,
  hydrateFromServer,
  readStoredJson,
  warnStorageError,
  writeState,
} from "@/lib/persistence/stateStore";

export interface PersistentStateOptions<T> {
  /** Validiert/normalisiert den geladenen Rohwert. Rückgabe null = verwerfen. */
  validate?: (raw: unknown) => T | null;
  /** Transformiert den Wert vor dem Persistieren (z. B. Base64-Fotos entfernen). */
  transformForStorage?: (value: T) => T;
}

/**
 * State mit transparenter Persistenz:
 * localStorage (sofortiger Cache) + Supabase-Spiegelung via /api/state.
 *
 * - Hydratisiert einmalig nach Mount: zuerst synchron aus dem localStorage,
 *   danach wird der Server-Stand gemerged (Server gewinnt bei Konflikt,
 *   außer es gibt pending lokale Änderungen).
 * - Schreibt bei JEDER Änderung nach der Hydratation lokal + debounced zum Server.
 * - Keine Side-Effects in setState-Updatern (React-konform, StrictMode-sicher).
 * - Quota-/Netzwerkfehler werden gewarnt statt still verschluckt.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  options?: PersistentStateOptions<T>
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const didHydrateRef = useRef(false);
  const optionsRef = useRef(options);

  // Options-Ref außerhalb des Renders pflegen (React-Compiler-konform).
  // Läuft vor dem Hydration-Effekt, damit validate/transform beim Mount bereit sind.
  useEffect(() => {
    optionsRef.current = options;
  });

  // ── Hydratation (einmalig pro Key) ─────────────────────────────────────────
  useEffect(() => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;

    // queueMicrotask: erfüllt die React-Compiler-Regel "kein synchrones
    // setState im Effect", läuft aber noch vor dem nächsten Paint.
    queueMicrotask(() => {
      // 1. Lokaler Cache sofort (synchron verfügbar)
      const local = readStoredJson<T | null>(key, null, optionsRef.current?.validate);
      if (local !== null && local !== undefined) {
        setState(local);
      }
      setHydrated(true);
    });

    // 2. Server-Stand asynchron mergen (Source of Truth)
    let cancelled = false;
    void hydrateFromServer([key]).then((serverValues) => {
      if (cancelled || !serverValues.has(key)) return;
      const raw = serverValues.get(key);
      const validated = optionsRef.current?.validate
        ? optionsRef.current.validate(raw)
        : (raw as T);
      if (validated === null || validated === undefined) return;
      if (applyServerValue(key, validated)) {
        setState(validated);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  // ── Persistierung nach jeder Änderung ──────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    try {
      const value = optionsRef.current?.transformForStorage
        ? optionsRef.current.transformForStorage(state)
        : state;
      writeState(key, value);
    } catch (err) {
      warnStorageError(key, err, "write");
    }
  }, [hydrated, key, state]);

  return [state, setState];
}
