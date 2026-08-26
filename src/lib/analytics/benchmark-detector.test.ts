import { describe, expect, it } from "vitest";
import {
  applyFtpUpdate,
  detectFtpBreakthrough,
  emitBenchmarkEvents,
  extractMaxSustainedPower,
  fitMorton3Param,
  mergeBenchmarkHistory,
  powerSeriesFromDetails,
  scanActivityBenchmarks,
} from "@/lib/analytics/benchmark-detector";
import type { GarminActivityDetails } from "@/types";

function constantStream(watts: number, seconds: number): number[] {
  return Array.from({ length: seconds }, () => watts);
}

describe("extractMaxSustainedPower", () => {
  it("findet das beste gleitende Fenster über der Dauer", () => {
    const stream = [
      ...constantStream(200, 60),
      ...constantStream(320, 30),
      ...constantStream(210, 90),
    ];
    const best = extractMaxSustainedPower(stream, 30);
    expect(best).not.toBeNull();
    expect(best!.bestWatts).toBe(320);
    expect(best!.label).toBe("30s");
    expect(best!.startSecond).toBe(60);
  });

  it("mittelt korrekt über ein 20-Minuten-Fenster", () => {
    const stream = [
      ...constantStream(250, 1200),
      ...constantStream(300, 1200),
    ];
    const best = extractMaxSustainedPower(stream, 1200);
    expect(best!.bestWatts).toBe(300);
  });

  it("gibt null zurück, wenn die Dauer den Stream übersteigt", () => {
    expect(extractMaxSustainedPower(constantStream(200, 10), 30)).toBeNull();
    expect(extractMaxSustainedPower([], 5)).toBeNull();
  });

  it("überspringt Fenster mit ungültigen (NaN) Werten", () => {
    const stream = [...constantStream(300, 6), NaN, ...constantStream(300, 6)];
    const best = extractMaxSustainedPower(stream, 5);
    expect(best).not.toBeNull();
    expect(best!.bestWatts).toBe(300);
  });
});

describe("scanActivityBenchmarks", () => {
  it("extrahiert alle Standarddauern und die eFTP", () => {
    const stream = [
      ...constantStream(220, 1800),
      ...constantStream(310, 1200),
      ...constantStream(230, 600),
      ...constantStream(700, 6),
    ];
    const scan = scanActivityBenchmarks({ watts: stream });
    expect(scan.bests.map((b) => b.label)).toEqual([
      "5s",
      "30s",
      "1m",
      "5m",
      "20m",
      "60m",
    ]);
    const p20 = scan.bests.find((b) => b.durationSeconds === 1200)!;
    expect(p20.bestWatts).toBe(310);
    expect(scan.eftp20mWatts).toBe(Math.round(310 * 0.95));
    expect(scan.method).toBe("eftp_20m");
  });

  it("fällt bei kurzen Einheiten aufs CP-Modell zurück oder meldet none", () => {
    const short = scanActivityBenchmarks({
      watts: constantStream(260, 45),
    });
    expect(short.eftp20mWatts).toBeNull();
    expect(["morton_cp", "none"]).toContain(short.method);
  });
});

describe("fitMorton3Param", () => {
  it("rekonstruiert ein synthetisches CP-Modell", () => {
    const cp = 260;
    const wPrime = 18000;
    const k = 15;
    const points = [60, 300, 600, 1200].map((t) => ({
      durationSeconds: t,
      watts: cp + wPrime / (t + k),
    }));
    const fit = fitMorton3Param(points);
    expect(fit).not.toBeNull();
    expect(fit!.cpWatts).toBeGreaterThanOrEqual(cp - 3);
    expect(fit!.cpWatts).toBeLessThanOrEqual(cp + 3);
    expect(Math.abs(fit!.wPrimeJoules - wPrime)).toBeLessThanOrEqual(1000);
    expect(Math.abs(fit!.tauSeconds - k)).toBeLessThanOrEqual(8);
    expect(fit!.r2).toBeGreaterThan(0.99);
  });

  it("braucht mindestens 3 Punkte und ausreichende Spannweite", () => {
    expect(
      fitMorton3Param([
        { durationSeconds: 60, watts: 320 },
        { durationSeconds: 300, watts: 280 },
      ])
    ).toBeNull();
    expect(
      fitMorton3Param([
        { durationSeconds: 5, watts: 800 },
        { durationSeconds: 30, watts: 600 },
        { durationSeconds: 60, watts: 400 },
      ])
    ).toBeNull();
  });
});

describe("detectFtpBreakthrough", () => {
  const baseScan = scanActivityBenchmarks({
    activityId: "act-1",
    watts: [
      ...constantStream(280, 1200),
      ...constantStream(150, 1300),
      ...constantStream(900, 6),
    ],
  });

  it("löst bei >2 % über dem Profil-FTP aus", () => {
    const payload = detectFtpBreakthrough(baseScan, 260);
    expect(payload).not.toBeNull();
    expect(payload!.newFtpWatts).toBe(Math.round(280 * 0.95));
    expect(payload!.deltaPercent).toBeGreaterThan(2);
    expect(payload!.message).toContain("neue 20-Minuten-Bestleistung");
    expect(payload!.message).toContain("Trainingsbereiche jetzt aktualisieren?");
  });

  it("löst nicht bei ≤2 % Abweichung aus", () => {
    expect(detectFtpBreakthrough(baseScan, 268)).toBeNull();
    expect(detectFtpBreakthrough(baseScan, 274)).toBeNull();
  });

  it("ignoriert Scans ohne FTP-Schätzung", () => {
    const empty = scanActivityBenchmarks({ watts: [] });
    expect(detectFtpBreakthrough(empty, 260)).toBeNull();
  });
});

describe("mergeBenchmarkHistory", () => {
  it("hält pro Dauer nur das Maximum und bleibt pure", () => {
    const now = new Date().toISOString();
    const scanA = scanActivityBenchmarks({
      activityId: "a",
      watts: constantStream(300, 3600),
    });
    const history = mergeBenchmarkHistory(null, scanA, now);
    expect(history.records).toHaveLength(6);

    const scanB = scanActivityBenchmarks({
      activityId: "b",
      watts: [
        ...constantStream(310, 1200),
        ...constantStream(150, 2400),
      ],
    });
    const merged = mergeBenchmarkHistory(history, scanB, now);
    const p20 = merged.records.find((r) => r.durationSeconds === 1200)!;
    expect(p20.bestWatts).toBeGreaterThan(
      history.records.find((r) => r.durationSeconds === 1200)!.bestWatts
    );
    expect(p20.activityId).toBe("b");
    expect(history.records.every((r) => r.activityId === "a")).toBe(true);
  });
});

describe("powerSeriesFromDetails", () => {
  it("liest den Watts-Stream inklusive Sample-Step", () => {
    const details = {
      success: true,
      activityId: "1",
      series: { watts: [100, 200, 300] },
      sampleStepSeconds: 2,
    } as unknown as GarminActivityDetails;
    expect(powerSeriesFromDetails(details)).toEqual({
      watts: [100, 200, 300],
      sampleStepSeconds: 2,
    });
  });

  it("akzeptiert alternative Power-Keys und lehnt Fehlendes ab", () => {
    const details = {
      success: true,
      activityId: "1",
      series: { directPower: [250, 260] },
    } as unknown as GarminActivityDetails;
    expect(powerSeriesFromDetails(details)?.watts).toEqual([250, 260]);
    expect(powerSeriesFromDetails(null)).toBeNull();
    expect(powerSeriesFromDetails({ success: true, activityId: "1" })).toBeNull();
  });
});

describe("applyFtpUpdate", () => {
  it("berechnet alle 7 Power-Zonen neu", () => {
    const result = applyFtpUpdate(295);
    expect(result).not.toBeNull();
    expect(result!.profile.ftpWatts).toBe(295);
    expect(result!.zones).toHaveLength(7);
    expect(result!.zones[3].minWatts).toBe(Math.round(295 * 0.91));
  });

  it("lehnt unplausible FTP-Werte ab", () => {
    expect(applyFtpUpdate(0)).toBeNull();
    expect(applyFtpUpdate(-50)).toBeNull();
    expect(applyFtpUpdate(5000)).toBeNull();
  });
});

describe("emitBenchmarkEvents", () => {
  it("liefert Scan + Breakthrough ohne Browser-Seiteneffekte", () => {
    const { scan, breakthrough } = emitBenchmarkEvents({
      activityId: "act-9",
      currentFtpWattsOverride: 250,
      watts: constantStream(300, 3600),
    });
    expect(scan.method).toBe("eftp_20m");
    expect(breakthrough).not.toBeNull();
    expect(breakthrough!.previousFtpWatts).toBe(250);
    expect(breakthrough!.deltaWatts).toBe(
      breakthrough!.newFtpWatts - breakthrough!.previousFtpWatts
    );
  });

  it("meldet keinen Durchbruch unterhalb der Schwelle", () => {
    const { breakthrough } = emitBenchmarkEvents({
      currentFtpWattsOverride: 290,
      watts: constantStream(300, 3600),
    });
    expect(breakthrough).toBeNull();
  });
});
