import { describe, expect, it } from "vitest";
import { Mutex } from "@/lib/server/mutex";

describe("Mutex", () => {
  it("serialisiert gleichzeitige Aufrufe in Reihenfolge", async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    await Promise.all([
      mutex.run(async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push(1);
      }),
      mutex.run(async () => {
        order.push(2);
      }),
      mutex.run(() => order.push(3)),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  it("blockiert die Queue nicht, wenn ein Aufruf fehlschlägt", async () => {
    const mutex = new Mutex();

    await expect(
      mutex.run(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    await expect(mutex.run(() => "ok")).resolves.toBe("ok");
  });

  it("gibt das Ergebnis des Aufrufs zurück", async () => {
    const mutex = new Mutex();
    const value = await mutex.run(() => 42);
    expect(value).toBe(42);
  });
});
