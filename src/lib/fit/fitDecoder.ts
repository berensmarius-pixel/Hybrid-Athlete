// ─── Binary FIT Stream Decoder (FIT Protocol Rev 2.x) ────────────────────────

export interface FitRecordSample {
  timestamp: number;
  power: number | null;
  cadence: number | null;
  heartRate: number | null;
  speed: number | null;
  altitude: number | null;
  distance: number | null;
  positionLat: number | null;
  positionLong: number | null;
}

export interface FitSessionSummary {
  sport?: string;
  subSport?: string;
  startTime?: number;
  timestamp?: number;
  totalElapsedTimeSeconds?: number;
  totalTimerTimeSeconds?: number;
  totalDistanceMeters?: number;
  totalCalories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadence?: number;
  maxCadence?: number;
  avgPowerWatts?: number;
  maxPowerWatts?: number;
  normalizedPowerWatts?: number;
  trainingStressScore?: number;
  intensityFactor?: number;
  totalAscentMeters?: number;
  totalDescentMeters?: number;
}

export interface FitParseResult {
  records: FitRecordSample[];
  sessions: FitSessionSummary[];
  laps: FitLapSummary[];
  timeCreated?: number;
}

export interface FitLapSummary {
  startTime?: number;
  totalTimerTimeSeconds?: number;
  totalDistanceMeters?: number;
  avgHeartRate?: number;
  avgPowerWatts?: number;
}

export class FitDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FitDecodeError";
  }
}

interface FieldDefinition {
  number: number;
  size: number;
  baseType: number;
}

interface MessageDefinition {
  globalMesgNum: number;
  littleEndian: boolean;
  fields: FieldDefinition[];
  devFields: FieldDefinition[];
}

type RawValues = Map<number, number | bigint>;

interface BaseTypeInfo {
  size: number;
  invalid: bigint;
  isFloat: boolean;
  isString: boolean;
}

const BASE_TYPES: Record<number, BaseTypeInfo> = {
  0x00: { size: 1, invalid: 0xffn, isFloat: false, isString: false },
  0x01: { size: 1, invalid: 0x80n, isFloat: false, isString: false },
  0x02: { size: 1, invalid: 0xffn, isFloat: false, isString: false },
  0x83: { size: 2, invalid: 0x8000n, isFloat: false, isString: false },
  0x84: { size: 2, invalid: 0xffffn, isFloat: false, isString: false },
  0x85: { size: 4, invalid: 0x80000000n, isFloat: false, isString: false },
  0x86: { size: 4, invalid: 0xffffffffn, isFloat: false, isString: false },
  0x07: { size: 1, invalid: 0x00n, isFloat: false, isString: true },
  0x88: { size: 4, invalid: 0xffffffffn, isFloat: true, isString: false },
  0x09: { size: 8, invalid: 0xffffffffffffffffn, isFloat: true, isString: false },
  0x0a: { size: 4, invalid: 0xffffffffn, isFloat: true, isString: false },
  0x8c: { size: 1, invalid: 0x00n, isFloat: false, isString: false },
  0x8d: { size: 2, invalid: 0x0000n, isFloat: false, isString: false },
  0x8e: { size: 4, invalid: 0x00000000n, isFloat: false, isString: false },
  0x8f: { size: 1, invalid: 0xffn, isFloat: false, isString: false },
};

const MESG_FILE_ID = 0;
const MESG_SESSION = 18;
const MESG_LAP = 19;
const MESG_RECORD = 20;

const SEMICIRCLES_TO_DEG = 180 / 2147483648;

function decodeBaseValue(
  view: DataView,
  offset: number,
  def: MessageDefinition,
  baseType: number
): number | undefined {
  const info = BASE_TYPES[baseType];
  if (!info || offset + info.size > view.byteLength) return undefined;

  const le = def.littleEndian;
  let raw: bigint;

  switch (baseType) {
    case 0x01:
      raw = BigInt(view.getInt8(offset));
      break;
    case 0x02:
      raw = BigInt(view.getUint8(offset));
      break;
    case 0x83:
      raw = BigInt(view.getInt16(offset, le));
      break;
    case 0x84:
      raw = BigInt(view.getUint16(offset, le));
      break;
    case 0x85:
      raw = BigInt(view.getInt32(offset, le));
      break;
    case 0x86:
      raw = BigInt(view.getUint32(offset, le));
      break;
    case 0x88:
      return view.getFloat32(offset, le);
    case 0x09:
      return view.getFloat64(offset, le);
    case 0x0a:
      return view.getFloat32(offset, le);
    case 0x8c:
      raw = BigInt(view.getUint8(offset));
      if (raw === 0n) return undefined;
      return Number(raw);
    case 0x8d:
      raw = BigInt(view.getUint16(offset, le));
      if (raw === 0n) return undefined;
      return Number(raw);
    case 0x8e:
      raw = BigInt(view.getUint32(offset, le));
      if (raw === 0n) return undefined;
      return Number(raw);
    default:
      raw = BigInt(view.getUint8(offset));
      break;
  }

  if (raw === info.invalid) return undefined;
  const signed =
    baseType === 0x83 || baseType === 0x85 || baseType === 0x01
      ? BigInt.asIntN(info.size * 8, raw)
      : raw;
  return Number(signed);
}

function readValues(
  view: DataView,
  cursorRef: { i: number },
  def: MessageDefinition
): RawValues {
  const values: RawValues = new Map();

  for (const field of def.fields) {
    const info = BASE_TYPES[field.baseType];
    if (!info) {
      cursorRef.i += field.size;
      continue;
    }
    if (cursorRef.i + field.size > view.byteLength) {
      cursorRef.i = view.byteLength;
      break;
    }

    if (field.size > info.size && !info.isString) {
      const lastOffset = cursorRef.i + field.size - info.size;
      const value = decodeBaseValue(view, lastOffset, def, field.baseType);
      if (value !== undefined) values.set(field.number, value);
    } else if (info.isString && field.size > 0) {
      let text = "";
      for (let b = 0; b < field.size; b++) {
        const byte = view.getUint8(cursorRef.i + b);
        if (byte !== 0x00) text += String.fromCharCode(byte);
      }
      const parsed = Number(text.trim());
      values.set(field.number, Number.isFinite(parsed) ? parsed : 0n);
    } else {
      const value = decodeBaseValue(view, cursorRef.i, def, field.baseType);
      if (value !== undefined) values.set(field.number, value);
    }
    cursorRef.i += field.size;
  }

  for (const field of def.devFields) {
    cursorRef.i += field.size;
  }

  return values;
}

function num(values: RawValues, key: number): number | undefined {
  const v = values.get(key);
  if (v === undefined) return undefined;
  const n = typeof v === "bigint" ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

const SPORT_ENUMS: Record<number, string> = {
  0: "manual",
  1: "running",
  2: "cycling",
  3: "transition",
  4: "fitness_equipment",
  5: "swimming",
  10: "hiking",
  26: "training",
};

const SUB_SPORT_ENUMS: Record<number, string> = {
  11: "indoor_cycling",
  12: "virtual_ride",
  13: "indoor_running",
  17: "strength_training",
};

export function parseFit(input: ArrayBuffer | Uint8Array): FitParseResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes.length < 14) throw new FitDecodeError("Datei zu kurz für FIT-Header.");
  if (
    bytes[8] !== 0x2e ||
    bytes[9] !== 0x46 ||
    bytes[10] !== 0x49 ||
    bytes[11] !== 0x54
  ) {
    throw new FitDecodeError("Ungültige FIT-Signatur (.FIT fehlt).");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint8(0);
  const dataStart = headerSize >= 12 ? headerSize : 14;
  const dataLength = view.getUint32(4, true);
  const dataEnd = Math.min(bytes.length, dataStart + dataLength);

  const definitions = new Map<number, MessageDefinition>();
  const recordsByTs = new Map<number, FitRecordSample>();
  const sessions: FitSessionSummary[] = [];
  const laps: FitLapSummary[] = [];
  let timeCreated: number | undefined;
  let lastTimestamp: number | undefined;

  const ensureRecord = (ts: number): FitRecordSample => {
    let rec = recordsByTs.get(ts);
    if (!rec) {
      rec = {
        timestamp: ts,
        power: null,
        cadence: null,
        heartRate: null,
        speed: null,
        altitude: null,
        distance: null,
        positionLat: null,
        positionLong: null,
      };
      recordsByTs.set(ts, rec);
    }
    return rec;
  };

  let cursor = dataStart;
  while (cursor < dataEnd) {
    const headerByte = view.getUint8(cursor++);

    // Bitlayout (FIT SDK ≥ 20.03):
    //   Bit 7 = 1            → Compressed-Timestamp-Datamessage (LocalNum Bits 5-6, Offset Bits 0-4)
    //   Bit 7 = 0, Bit 6 = 1 → Definition (Dev-Flag Bit 5, LocalNum Bits 0-3)
    //   Bit 7 = 0, Bit 6 = 0 → normale Datamessage (LocalNum Bits 0-3)

    if ((headerByte & 0x80) !== 0) {
      const localNum = (headerByte >> 5) & 0x03;
      const tsOffset = headerByte & 0x1f;
      if (lastTimestamp !== undefined) {
        let ts = (lastTimestamp & ~0x1f) + tsOffset;
        while (ts < lastTimestamp) ts += 32;
        lastTimestamp = ts;
      }
      const def = definitions.get(localNum);
      if (!def) continue;
      if (cursor + definitionSize(def) > dataEnd) break;

      const cursorRef = { i: cursor };
      const values = readValues(view, cursorRef, def);
      cursor = cursorRef.i;

      applyMessage(
        def.globalMesgNum,
        values,
        { ensureRecord, sessions, laps },
        () => lastTimestamp,
        () => {},
        (v) => {
          timeCreated = v;
        }
      );
      continue;
    }

    if ((headerByte & 0x40) !== 0) {
      if (cursor + 5 > dataEnd) break;
      cursor += 1;
      const littleEndian = view.getUint8(cursor) === 0;
      const globalMesgNum = view.getUint16(cursor + 1, littleEndian);
      cursor += 3;
      const numFields = view.getUint8(cursor++);
      const fields: FieldDefinition[] = [];
      for (let f = 0; f < numFields; f++) {
        if (cursor + 3 > dataEnd) break;
        fields.push({
          number: view.getUint8(cursor),
          size: view.getUint8(cursor + 1),
          baseType: view.getUint8(cursor + 2),
        });
        cursor += 3;
      }
      const devFields: FieldDefinition[] = [];
      if ((headerByte & 0x20) !== 0 && cursor < dataEnd) {
        const numDev = view.getUint8(cursor++);
        for (let f = 0; f < numDev; f++) {
          if (cursor + 3 > dataEnd) break;
          devFields.push({
            number: view.getUint8(cursor),
            size: view.getUint8(cursor + 1),
            baseType: view.getUint8(cursor + 2),
          });
          cursor += 3;
        }
      }
      definitions.set(headerByte & 0x0f, { globalMesgNum, littleEndian, fields, devFields });
      continue;
    }

    const localNum = headerByte & 0x0f;
    const def = definitions.get(localNum);
    if (!def) continue;
    if (cursor + definitionSize(def) > dataEnd) break;

    const cursorRef = { i: cursor };
    const values = readValues(view, cursorRef, def);
    cursor = cursorRef.i;

    applyMessage(
      def.globalMesgNum,
      values,
      { ensureRecord, sessions, laps },
      () => lastTimestamp,
      (ts) => {
        lastTimestamp = ts;
      },
      (v) => {
        timeCreated = v;
      }
    );
  }

  const records = [...recordsByTs.values()].sort((a, b) => a.timestamp - b.timestamp);
  return { records, sessions, laps, timeCreated };
}

interface ApplyContext {
  ensureRecord: (ts: number) => FitRecordSample;
  sessions: FitSessionSummary[];
  laps: FitLapSummary[];
}

function definitionSize(def: MessageDefinition): number {
  return (
    def.fields.reduce((sum, f) => sum + f.size, 0) +
    def.devFields.reduce((sum, f) => sum + f.size, 0)
  );
}

function applyMessage(
  globalMesgNum: number,
  values: RawValues,
  ctx: ApplyContext,
  getLastTs: () => number | undefined,
  setLastTs: (ts: number) => void,
  setTimeCreated: (ts: number) => void
): void {
  if (globalMesgNum === MESG_RECORD) {
    const tsField = num(values, 253);
    const ts = tsField ?? getLastTs();
    if (ts === undefined) return;
    setLastTs(ts);
    const rec = ctx.ensureRecord(ts);

    const hr = num(values, 3);
    if (hr !== undefined) rec.heartRate = hr;
    const cadence = num(values, 4);
    if (cadence !== undefined) rec.cadence = cadence;
    const power = num(values, 7);
    if (power !== undefined) rec.power = power;

    const enhancedSpeed = num(values, 73);
    const legacySpeed = num(values, 6);
    const speedRaw = enhancedSpeed ?? legacySpeed;
    if (speedRaw !== undefined) rec.speed = speedRaw / 1000;

    const enhancedAlt = num(values, 78);
    const legacyAlt = num(values, 2);
    const altRaw = enhancedAlt ?? legacyAlt;
    if (altRaw !== undefined) rec.altitude = altRaw / 5 - 500;

    const distance = num(values, 5);
    if (distance !== undefined) rec.distance = distance / 100;

    const lat = num(values, 0);
    if (lat !== undefined) rec.positionLat = lat * SEMICIRCLES_TO_DEG;
    const lon = num(values, 1);
    if (lon !== undefined) rec.positionLong = lon * SEMICIRCLES_TO_DEG;
    return;
  }

  if (globalMesgNum === MESG_SESSION) {
    const sportEnum = num(values, 0);
    const subSportEnum = num(values, 1);
    ctx.sessions.push({
      sport: sportEnum !== undefined ? SPORT_ENUMS[sportEnum] : undefined,
      subSport: subSportEnum !== undefined ? SUB_SPORT_ENUMS[subSportEnum] : undefined,
      startTime: num(values, 2),
      timestamp: num(values, 253),
      totalElapsedTimeSeconds: scale(num(values, 5), 1000),
      totalTimerTimeSeconds: scale(num(values, 6), 1000),
      totalDistanceMeters: scale(num(values, 7), 100),
      totalCalories: num(values, 13),
      avgHeartRate: num(values, 20),
      maxHeartRate: num(values, 21),
      avgCadence: num(values, 22),
      maxCadence: num(values, 23),
      avgPowerWatts: num(values, 24),
      maxPowerWatts: num(values, 25),
      totalAscentMeters: num(values, 26),
      totalDescentMeters: num(values, 27),
      normalizedPowerWatts: num(values, 49),
      trainingStressScore: scale(num(values, 50), 10),
      intensityFactor: scale(num(values, 51), 1000),
    });
    return;
  }

  if (globalMesgNum === MESG_LAP) {
    ctx.laps.push({
      startTime: num(values, 2),
      totalTimerTimeSeconds: scale(num(values, 8), 1000),
      totalDistanceMeters: scale(num(values, 9), 100),
      avgHeartRate: num(values, 15),
      avgPowerWatts: num(values, 19),
    });
    return;
  }

  if (globalMesgNum === MESG_FILE_ID) {
    const created = num(values, 4);
    if (created !== undefined) setTimeCreated(created);
  }
}

function scale(value: number | undefined, factor: number): number | undefined {
  if (value === undefined) return undefined;
  return value / factor;
}
