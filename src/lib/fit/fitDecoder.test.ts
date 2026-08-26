import { describe, expect, it } from "vitest";
import { parseFit, FitDecodeError } from "./fitDecoder";

// ─── Synthetische FIT-Datei-Builder ──────────────────────────────────────────

function u16(value: number, littleEndian = true): number[] {
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, value, littleEndian);
  return [...buf];
}

function u32(value: number, littleEndian = true): number[] {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, value >>> 0, littleEndian);
  return [...buf];
}

function fitHeader(dataSize: number): number[] {
  return [
    14,
    0x10,
    ...u16(2100),
    ...u32(dataSize),
    0x2e, 0x46, 0x49, 0x54,
    0x00, 0x00,
  ];
}

type FieldDef = { number: number; size: number; baseType: number };

function definitionMessage(
  localNum: number,
  globalMesgNum: number,
  fields: FieldDef[],
  littleEndian = true
): number[] {
  // Bit 7 = 0 · Bit 6 = 1 (Definition) · Bits 0-3 = LocalNum
  const out: number[] = [0x40 | localNum, 0x00, littleEndian ? 0 : 1];
  out.push(...u16(globalMesgNum, littleEndian));
  out.push(fields.length);
  for (const f of fields) out.push(f.number, f.size, f.baseType);
  return out;
}

function dataMessage(localNum: number, payload: number[]): number[] {
  return [localNum & 0x0f, ...payload];
}

const RECORD_FIELDS: FieldDef[] = [
  { number: 253, size: 4, baseType: 0x86 },
  { number: 3, size: 1, baseType: 0x02 },
  { number: 4, size: 1, baseType: 0x02 },
  { number: 7, size: 2, baseType: 0x84 },
  { number: 73, size: 4, baseType: 0x86 },
  { number: 78, size: 4, baseType: 0x86 },
];

function encodeRecordSample(sample: {
  ts: number;
  hr?: number;
  cad?: number;
  power?: number;
  speedMms?: number;
  altRaw?: number;
}): number[] {
  return [
    ...u32(sample.ts),
    sample.hr ?? 0xff,
    sample.cad ?? 0xff,
    ...(sample.power !== undefined ? u16(sample.power) : [0xff, 0xff]),
    ...(sample.speedMms !== undefined ? u32(sample.speedMms) : [0xff, 0xff, 0xff, 0xff]),
    ...(sample.altRaw !== undefined ? u32(sample.altRaw) : [0xff, 0xff, 0xff, 0xff]),
  ];
}

const SESSION_FIELDS: FieldDef[] = [
  { number: 253, size: 4, baseType: 0x86 },
  { number: 0, size: 1, baseType: 0x02 },
  { number: 2, size: 4, baseType: 0x86 },
  { number: 13, size: 2, baseType: 0x84 },
  { number: 20, size: 1, baseType: 0x02 },
  { number: 24, size: 2, baseType: 0x84 },
  { number: 49, size: 2, baseType: 0x84 },
  { number: 50, size: 2, baseType: 0x84 },
  { number: 51, size: 2, baseType: 0x84 },
];

function buildFit(bodyMessages: number[][]): ArrayBuffer {
  const body = bodyMessages.flat();
  const bytes = [...fitHeader(body.length), ...body];
  return Uint8Array.from(bytes).buffer;
}

const BASE_TS = 1756100000;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("parseFit – Header", () => {
  it("wirft bei fehlender .FIT-Signatur", () => {
    const bytes = new Uint8Array(64);
    expect(() => parseFit(bytes.buffer)).toThrow(FitDecodeError);
  });

  it("wirft bei zu kurzer Datei", () => {
    expect(() => parseFit(new Uint8Array(4).buffer)).toThrow(FitDecodeError);
  });
});

describe("parseFit – Record Messages", () => {
  it("dekodiert Timestamp, Power, HR, Cadence, Speed und Altitude", () => {
    const buffer = buildFit([
      definitionMessage(0, 20, RECORD_FIELDS),
      dataMessage(0, encodeRecordSample({ ts: BASE_TS, hr: 140, cad: 90, power: 250, speedMms: 8200, altRaw: 2750 })),
      dataMessage(0, encodeRecordSample({ ts: BASE_TS + 1, hr: 142, cad: 92, power: 265, speedMms: 8500, altRaw: 2800 })),
    ]);

    const result = parseFit(buffer);

    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      timestamp: BASE_TS,
      heartRate: 140,
      cadence: 90,
      power: 250,
      speed: 8.2,
      altitude: 2750 / 5 - 500,
    });
    expect(result.records[1].power).toBe(265);
    expect(result.records[1].altitude).toBeCloseTo(60, 5);
  });

  it("behandelt Invalid-Werte (0xFF/0xFFFF/0xFFFFFFFF) als null", () => {
    const buffer = buildFit([
      definitionMessage(0, 20, RECORD_FIELDS),
      dataMessage(0, encodeRecordSample({ ts: BASE_TS })),
    ]);

    const result = parseFit(buffer);
    expect(result.records[0].heartRate).toBeNull();
    expect(result.records[0].cadence).toBeNull();
    expect(result.records[0].power).toBeNull();
    expect(result.records[0].speed).toBeNull();
    expect(result.records[0].altitude).toBeNull();
  });

  it("merged mehrere Record-Messages mit gleichem Timestamp (Multi-Channel)", () => {
    const powerOnly: FieldDef[] = [
      { number: 253, size: 4, baseType: 0x86 },
      { number: 7, size: 2, baseType: 0x84 },
    ];
    const hrOnly: FieldDef[] = [
      { number: 253, size: 4, baseType: 0x86 },
      { number: 3, size: 1, baseType: 0x02 },
    ];

    const buffer = buildFit([
      definitionMessage(0, 20, powerOnly),
      definitionMessage(1, 20, hrOnly),
      dataMessage(0, [...u32(BASE_TS), ...u16(300)]),
      dataMessage(1, [...u32(BASE_TS), 150]),
    ]);

    const result = parseFit(buffer);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].power).toBe(300);
    expect(result.records[0].heartRate).toBe(150);
  });

  it("unterstützt Compressed-Timestamp-Header (Offset auf letzte Sekunde)", () => {
    const noTsFields: FieldDef[] = RECORD_FIELDS.filter((f) => f.number !== 253);
    const payloadNoTs = (hr: number, power: number): number[] => [
      hr, 0xff,
      ...u16(power),
      ...u32(0xffffffff),
      ...u32(0xffffffff),
    ];

    const buffer = buildFit([
      definitionMessage(0, 20, RECORD_FIELDS),
      dataMessage(0, encodeRecordSample({ ts: BASE_TS, hr: 140, power: 100 })),
      // Redefinition ohne Timestamp-Feld – Standard bei Compressed Headers
      definitionMessage(0, 20, noTsFields),
      // Bit 7 = 1 (compressed) · Bits 5-6 LocalNum 0 · Bits 0-4 Offset 5 → 0x85
      [0x85, ...payloadNoTs(142, 110)],
    ]);

    const result = parseFit(buffer);
    expect(result.records).toHaveLength(2);
    expect(result.records[1].timestamp).toBe(BASE_TS + 5);
    expect(result.records[1].power).toBe(110);
    expect(result.records[1].heartRate).toBe(142);
  });

  it("parst Big-Endian-Definitionen korrekt", () => {
    const beFields: FieldDef[] = [
      { number: 253, size: 4, baseType: 0x86 },
      { number: 7, size: 2, baseType: 0x84 },
    ];
    const buffer = buildFit([
      definitionMessage(0, 20, beFields, false),
      dataMessage(0, [...u32(BASE_TS), ...u16(1234, false)]),
    ]);

    const result = parseFit(buffer);
    expect(result.records[0].power).toBe(1234);
  });

  it("sortiert Records chronologisch unabhängig von Eingabereihenfolge", () => {
    const buffer = buildFit([
      definitionMessage(0, 20, RECORD_FIELDS),
      dataMessage(0, encodeRecordSample({ ts: BASE_TS + 3, power: 10 })),
      dataMessage(0, encodeRecordSample({ ts: BASE_TS + 1, power: 20 })),
      dataMessage(0, encodeRecordSample({ ts: BASE_TS + 2, power: 30 })),
    ]);

    const powers = parseFit(buffer).records.map((r) => r.power);
    expect(powers).toEqual([20, 30, 10]);
  });

  it("ignoriert Daten ohne vorherige Definition, ohne zu crashen", () => {
    const buffer = buildFit([
      dataMessage(5, [1, 2, 3]),
      definitionMessage(0, 20, RECORD_FIELDS),
      dataMessage(0, encodeRecordSample({ ts: BASE_TS, power: 200 })),
    ]);

    const result = parseFit(buffer);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].power).toBe(200);
  });
});

describe("parseFit – Session Summary", () => {
  it("mappt Session-Felder inkl. Skalierung und Sport-Enum", () => {
    const buffer = buildFit([
      definitionMessage(0, 18, SESSION_FIELDS),
      dataMessage(0, [
        ...u32(BASE_TS + 3600),
        2,
        ...u32(BASE_TS),
        ...u16(650),
        150,
        ...u16(240),
        ...u16(255),
        ...u16(455),
        ...u16(880),
      ]),
    ]);

    const result = parseFit(buffer);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      sport: "cycling",
      startTime: BASE_TS,
      timestamp: BASE_TS + 3600,
      totalCalories: 650,
      avgHeartRate: 150,
      avgPowerWatts: 240,
      normalizedPowerWatts: 255,
      trainingStressScore: 45.5,
      intensityFactor: 0.88,
    });
  });
});
