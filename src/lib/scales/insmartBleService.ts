// ─── Insmart / Fitdays Web Bluetooth (BLE) Service ───────────────────────────

import { BodyCompositionEntry } from "@/types";
import { generateId } from "@/lib/utils";

export interface UserScaleProfile {
  heightCm: number; // e.g. 180
  age: number; // e.g. 26
  gender: "male" | "female"; // "male" | "female"
}

export interface BleScaleReading {
  weightKg: number;
  impedanceOhms?: number;
  isStabilized: boolean;
  rawHex?: string;
  calculatedComposition?: Partial<BodyCompositionEntry>;
}

// Common GATT Services used by Insmart, Icomon, Chipsea, Fitdays, and standard BLE scales
const SCALE_SERVICES = [
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ffb0-0000-1000-8000-00805f9b34fb",
  0xfff0,
  0xffb0,
  "weight_scale", // 0x181D
  "body_composition", // 0x181B
];

const SCALE_CHARACTERISTICS = [
  "0000fff1-0000-1000-8000-00805f9b34fb",
  "0000fff4-0000-1000-8000-00805f9b34fb",
  "0000ffb2-0000-1000-8000-00805f9b34fb",
  0xfff1,
  0xfff4,
  0xffb2,
  "weight_measurement", // 0x2A9D
  "body_composition_measurement", // 0x2A9C
];

/**
 * Calculate full body composition from Weight + BIA Impedance (Insmart / Fitdays algorithm)
 */
export function calculateBodyComposition(
  weightKg: number,
  impedanceOhms: number,
  profile: UserScaleProfile = { heightCm: 180, age: 26, gender: "male" }
): Partial<BodyCompositionEntry> {
  const { heightCm, age, gender } = profile;
  const heightM = heightCm / 100;
  const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
  const isMale = gender === "male";
  const sexFactor = isMale ? 1 : 0;

  // Impedance Index (H^2 / R)
  const impedance = impedanceOhms > 100 && impedanceOhms < 1500 ? impedanceOhms : 520;
  const heightSqOverR = (heightCm * heightCm) / impedance;

  // Fat Free Mass (FFM) / Lean Body Mass estimation (Lukaski & Deurenberg BIA equation)
  let leanMassKg = isMale
    ? 0.485 * heightSqOverR + 0.338 * weightKg + 5.32
    : 0.476 * heightSqOverR + 0.295 * weightKg + 5.49;

  // Bound lean mass to physically realistic limits
  leanMassKg = Math.min(weightKg * 0.92, Math.max(weightKg * 0.60, leanMassKg));

  const fatMassKg = Math.max(0, weightKg - leanMassKg);
  const bodyFatPct = Math.round((fatMassKg / weightKg) * 100 * 10) / 10;

  // Muscle mass (Skeletal muscle is ~73-75% of lean mass)
  const muscleMassKg = Math.round(leanMassKg * 0.74 * 10) / 10;
  const muscleMassPct = Math.round((muscleMassKg / weightKg) * 100 * 10) / 10;

  // Total Body Water (TBW is ~73% of lean mass)
  const waterKg = leanMassKg * 0.73;
  const waterPct = Math.round((waterKg / weightKg) * 100 * 10) / 10;

  // Bone mass estimate
  const boneMassKg = isMale
    ? Math.round((leanMassKg * 0.055) * 10) / 10
    : Math.round((leanMassKg * 0.048) * 10) / 10;

  // Visceral fat estimate (1 to 15 rating)
  const baseVisceral = (bmi - 18.5) * 0.6 + (bodyFatPct - 10) * 0.25;
  const visceralFat = Math.max(1, Math.min(15, Math.round(baseVisceral)));

  // BMR (Mifflin-St Jeor formula)
  const bmrKcal = Math.round(
    10 * weightKg + 6.25 * heightCm - 5 * age + (isMale ? 5 : -161)
  );

  // Metabolic age
  const metabolicAge = Math.max(18, Math.min(75, Math.round(age + (bodyFatPct > 20 ? (bodyFatPct - 20) * 0.6 : -3))));

  // Subcutaneous fat %
  const subcutaneousFatPct = Math.max(5, Math.round((bodyFatPct * 0.85) * 10) / 10);

  // Protein %
  const proteinPct = Math.round(((leanMassKg - waterKg - boneMassKg) / weightKg) * 100 * 10) / 10;

  return {
    weight: weightKg,
    bmi,
    bodyFatPct,
    muscleMassKg,
    muscleMassPct,
    waterPct,
    boneMassKg,
    visceralFat,
    bmrKcal,
    metabolicAge,
    subcutaneousFatPct,
    proteinPct,
  };
}

export class InsmartBleManager {
  private device: any = null;
  private server: any = null;

  /**
   * Check if Web Bluetooth API is supported in current browser
   */
  public isSupported(): boolean {
    return typeof window !== "undefined" && "bluetooth" in navigator;
  }

  /**
   * Scan and connect to Insmart / Fitdays scale via Web Bluetooth
   */
  public async connectAndListen(
    profile: UserScaleProfile,
    onReading: (reading: BleScaleReading) => void,
    onStatusChange: (status: string) => void
  ): Promise<BodyCompositionEntry> {
    if (!this.isSupported()) {
      throw new Error("Web Bluetooth wird in diesem Browser nicht unterstützt. Bitte nutze Chrome, Edge oder WebBLE.");
    }

    onStatusChange("Suche nach Insmart / Fitdays Waage...");

    // Request Bluetooth Device
    const nav = navigator as any;
    const device = await nav.bluetooth.requestDevice({
      filters: [
        { namePrefix: "Insmart" },
        { namePrefix: "Fitdays" },
        { namePrefix: "ICOMON" },
        { namePrefix: "Scale" },
        { namePrefix: "Health" },
        { namePrefix: "Chipsea" },
      ],
      optionalServices: [
        "0000fff0-0000-1000-8000-00805f9b34fb",
        "0000ffb0-0000-1000-8000-00805f9b34fb",
        "weight_scale",
        "body_composition",
      ],
    });

    this.device = device;
    onStatusChange(`Verbinde mit ${device.name || "Körperfettwaage"}...`);

    const server = await device.gatt.connect();
    this.server = server;

    onStatusChange("Verbunden! Bitte barfuß auf die Waage stellen...");

    return new Promise<BodyCompositionEntry>((resolve, reject) => {
      let finalReading: BodyCompositionEntry | null = null;

      const handleValueChange = (event: any) => {
        const value: DataView = event.target.value;
        const hexArray = [];
        for (let i = 0; i < value.byteLength; i++) {
          hexArray.push(value.getUint8(i).toString(16).padStart(2, "0"));
        }
        const hexString = hexArray.join(" ");

        // Packet parser for Insmart / Icomon (e.g. CF ... or Standard Weight Scale 0x181D)
        let weightKg = 0;
        let impedance = 520;
        let isStabilized = false;

        if (value.byteLength >= 5) {
          const byte0 = value.getUint8(0);

          // Insmart / Icomon packet format: CF 10 weight_high weight_low status imp_high imp_low
          if (byte0 === 0xcf || byte0 === 0xff || byte0 === 0xfd) {
            const rawWeight = (value.getUint8(2) << 8) | value.getUint8(3);
            weightKg = Math.round((rawWeight / 100) * 10) / 10;
            const statusByte = value.getUint8(4);
            isStabilized = (statusByte & 0x01) === 1 || (statusByte & 0x10) !== 0 || weightKg > 20;

            if (value.byteLength >= 7) {
              const rawImp = (value.getUint8(5) << 8) | value.getUint8(6);
              if (rawImp > 100 && rawImp < 2000) {
                impedance = rawImp;
              }
            }
          } else {
            // Standard GATT Weight Measurement packet
            const rawWeight = (value.getUint8(1) | (value.getUint8(2) << 8));
            weightKg = Math.round((rawWeight * 0.005) * 10) / 10;
            isStabilized = true;
          }
        }

        if (weightKg > 10) {
          const comp = calculateBodyComposition(weightKg, impedance, profile);

          onReading({
            weightKg,
            impedanceOhms: impedance,
            isStabilized,
            rawHex: hexString,
            calculatedComposition: comp,
          });

          if (isStabilized && weightKg > 30) {
            finalReading = {
              id: generateId(),
              date: new Date().toISOString(),
              weight: weightKg,
              bodyFatPct: comp.bodyFatPct,
              muscleMassKg: comp.muscleMassKg,
              muscleMassPct: comp.muscleMassPct,
              waterPct: comp.waterPct,
              boneMassKg: comp.boneMassKg,
              visceralFat: comp.visceralFat,
              bmrKcal: comp.bmrKcal,
              bmi: comp.bmi,
              metabolicAge: comp.metabolicAge,
              source: "Insmart BLE",
            };

            onStatusChange(`Messung abgeschlossen: ${weightKg} kg (${comp.bodyFatPct}% KFA)`);
            setTimeout(() => {
              this.disconnect();
              if (finalReading) resolve(finalReading);
            }, 800);
          }
        }
      };

      // Discover available primary services and listen for notifications
      (async () => {
        try {
          const services = await server.getPrimaryServices();
          let subscribed = false;

          for (const service of services) {
            try {
              const characteristics = await service.getCharacteristics();
              for (const char of characteristics) {
                if (char.properties.notify || char.properties.indicate) {
                  await char.startNotifications();
                  char.addEventListener("characteristicvaluechanged", handleValueChange);
                  subscribed = true;
                }
              }
            } catch {
              // Ignore single characteristic errors
            }
          }

          if (!subscribed) {
            onStatusChange("Warnung: Keine Benachrichtigungs-Charakteristik gefunden. Warte auf Messung...");
          }
        } catch (err: any) {
          this.disconnect();
          reject(err);
        }
      })();
    });
  }

  public disconnect() {
    try {
      if (this.device && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }
    } catch {}
    this.device = null;
    this.server = null;
  }
}
