/**
 * Minimaler In-Prozess-Mutex: serialisiert Critical Sections, die
 * Read-Modify-Write auf gemeinsame Ressourcen ausführen (z. B. JSON-Dateien
 * im Webhook). Verhindert verlorene Updates bei gleichzeitigen Requests.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  /** Führt `fn` exklusiv aus – Aufrufe werden der Reihe nach abgearbeitet. */
  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(fn);
    // Queue darf nie rejected sein, sonst blockieren Folgeaufrufe für immer
    this.tail = result.catch(() => {});
    return result;
  }
}
