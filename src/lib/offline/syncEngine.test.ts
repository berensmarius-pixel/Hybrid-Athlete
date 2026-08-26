import { describe, expect, it } from "vitest";
import { collapseQueueEntries } from "./syncEngine";
import type { SyncQueueEntry } from "./db";

function entry(
  targetKey: string,
  createdAt: number,
  extra?: Partial<SyncQueueEntry>
): SyncQueueEntry {
  return {
    entity: "sessions",
    targetKey,
    snapshot: { targetKey, createdAt },
    status: "pending",
    retryCount: 0,
    createdAt,
    ...extra,
  };
}

describe("collapseQueueEntries", () => {
  it("kollabiert mehrere Einträge pro Entity auf den neuesten Snapshot", () => {
    const collapsed = collapseQueueEntries([
      entry("hybrid_athlete_sessions", 100),
      entry("hybrid_athlete_sessions", 300),
      entry("hybrid_athlete_sessions", 200),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].createdAt).toBe(300);
  });

  it("behält den neuesten Eintrag je unterschiedlichem Target-Key", () => {
    const collapsed = collapseQueueEntries([
      entry("hybrid_athlete_sessions", 100),
      entry("hybrid_athlete_body_weight", 90),
      entry("hybrid_athlete_sessions", 150),
      entry("hybrid_athlete_body_weight", 250),
    ]);
    expect(collapsed.map((e) => [e.targetKey, e.createdAt]).sort()).toEqual([
      ["hybrid_athlete_body_weight", 250],
      ["hybrid_athlete_sessions", 150],
    ]);
  });

  it("liefert ein leeres Ergebnis für eine leere Queue", () => {
    expect(collapseQueueEntries([])).toEqual([]);
  });

  it("behandelt fehlende createdAt-Werte als 0 (ältester Kandidat)", () => {
    const missingDate = { targetKey: "key-a" } as Parameters<typeof collapseQueueEntries>[0][number];
    const b = entry("key-a", 42);
    const collapsed = collapseQueueEntries([missingDate, b]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].createdAt).toBe(42);
  });});
