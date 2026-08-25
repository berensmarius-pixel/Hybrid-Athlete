#!/usr/bin/env python3
"""
scale_sniffer.py - Passiver BLE-Sniffer fuer InSmart FG260 / Fitdays / Yolanda(QN)-Waagen.

Zweck:
    Diagnose-Tool. Hoert BLE-Advertisements passiv ab (KEIN connect(), kein aktives Scanning),
    damit die genaue Byte-Struktur beim Wiegen analysiert werden kann.

Protokoll-Reverse-Engineering (verifiziert an InSmart/Fitdays-Broadcast-Waagen):

    Bleak liefert Manufacturer-Data als Dict {company_id: bytes}.
    Diese Waage sendet unter company_id 41132 (0xA0AC) ein 12-Byte-Payload:

        [0..5]  MAC der Waage, reversed
        [6]     Status:   0x20 = misst (live) | 0xA0 = stabil/final | 0xA2 = stabil + Koerperwerte
        [7..9]  Gewicht (3 Byte, odd encoding, siehe decode_weight)
        [10]    Typ:      0x0D = nur Gewicht     | 0x06 = mit Impedanz/Koerperwerten
        [11]    Checksumme: obere 4 Bit variabel, untere 4 Bit = Summe(Bytes 6..10) & 0x0F

    Gewicht-Decodierung ("Icomon"-Encoding):
        raw24 = big-endian 24-bit der Bytes [7..9]
        raw24 ^= 0xA0A0          # XOR auf High-Nibble von Byte 8 und Byte 9
        gramm = raw24 - 0xC80000 # Nullpunkt
        kg    = gramm / 1000
        Beispiel: c9 c3 be -> 0xC9C3BE ^ 0xA0A0 = 0xC9631E -> -0xC80000 = 90910 g = 90.91 kg

Feinjustierung:
    - Stimmt das dekodierte Gewicht nicht mit dem Display ueberein, sind nur die drei
      Konstanten XOR_MASK / WEIGHT_BASE / GRAMS_PER_LSB anzupassen.
    - Mit --jsonl werden alle Rohpakete mitgeschrieben (Replay/Regressionstest moeglich).
"""

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

try:
    from bleak import BleakScanner
except ImportError:
    sys.exit("bleak fehlt:  pip install bleak")

# ---------------------------------------------------------------------------
# Protokoll-Konstanten (hier feinjustieren)
# ---------------------------------------------------------------------------
MFG_COMPANY_ID = 41132              # 0xA0AC - Hersteller-Key im Advertisement
WEIGHT_XOR_MASK = 0xA0A0            # De-Shuffle-Maske (High-Nibbles von Byte 8+9)
WEIGHT_ZERO_BASE = 0xC80000         # Rohwert entspricht 0.00 kg
GRAMS_PER_LSB = 1000                # 1 LSB = 1 g

STATUS_FLAGS = {
    0x20: "measuring",
    0xA0: "stabilized",
    0xA2: "stabilized+body",
}
TYPE_FLAGS = {
    0x0D: "weight-only",
    0x06: "body-composition",
}

# Substring-Filter (case-insensitive), falls keine MAC angegeben wurde
DEFAULT_NAME_FILTERS = ["aaa", "qn-", "insmart", "fg260", "fitdays", "scale"]


# ---------------------------------------------------------------------------
# Decoder
# ---------------------------------------------------------------------------
def decode_weight(raw3: bytes) -> Optional[float]:
    """3 Gewicht-Bytes -> kg (Icomon-Encoding), None bei unsinnigem Wert."""
    if len(raw3) != 3:
        return None
    raw24 = int.from_bytes(raw3, "big") ^ WEIGHT_XOR_MASK
    grams = raw24 - WEIGHT_ZERO_BASE
    if grams < 0 or grams > 400_000:
        return None
    return round(grams / GRAMS_PER_LSB, 3)


def verify_checksum(payload: bytes) -> Optional[bool]:
    """Untere 4 Bits von Byte 11 == Summe(Bytes 0..5 des Messframes) & 0x0F."""
    if len(payload) < 12:
        return None
    expected = sum(payload[6:11]) & 0x0F
    return (payload[11] & 0x0F) == expected


def impedance_candidates(meas_frame: bytes) -> List[int]:
    """Best-effort: plausible Impedanz-Rohwerte aus den Nutzbytes (UNVERIFIZIERT!).

    Body-Frames (Status 0xA2 / Typ 0x06) tragen in Bytes 7..9 vermutlich die
    Impedanz (16-bit, oft 0.01-Ohm-Aufloesung). Kandidaten werden nach
    Naehe zu 500 Ohm (typischer Mensch) sortiert - erstes Element = bester Tipp.
    """
    cand: List[int] = []
    if len(meas_frame) < 3:
        return cand
    d = meas_frame[:3]
    for raw in (
        int.from_bytes(d[0:2], "big"),
        int.from_bytes(d[1:3], "big"),
        int.from_bytes(d[0:2], "little"),
        int.from_bytes(d[1:3], "little"),
    ):
        for div in (1, 10, 100):
            val = int(raw / div)
            if 150 <= val <= 1500 and val not in cand:
                cand.append(val)
    cand.sort(key=lambda v: abs(v - 500))
    return cand


def parse_fg260_payload(payload: bytes) -> Optional[dict]:
    """Vollstaendiges Manufacturer-Payload (ab Company-ID) -> strukturiert oder None."""
    if len(payload) < 12:
        return None
    meas = payload[6:12]
    status = meas[0]
    weight_kg = decode_weight(meas[1:4])
    return {
        "mac_in_payload": bytes(reversed(payload[0:6])).hex(":").upper(),
        "status_raw": status,
        "status": STATUS_FLAGS.get(status, f"unknown(0x{status:02X})"),
        "weight_kg": weight_kg,
        "type_raw": meas[4],
        "type": TYPE_FLAGS.get(meas[4], f"unknown(0x{meas[4]:02X})"),
        "checksum_ok": verify_checksum(payload),
        "impedance_candidates": impedance_candidates(meas) if status == 0xA2 or meas[4] == 0x06 else [],
    }


# ---------------------------------------------------------------------------
# Sniffer
# ---------------------------------------------------------------------------
class Sniffer:
    def __init__(self, args, jsonl_file=None):
        self.args = args
        self.jsonl = jsonl_file
        self.mac_filters = {m.strip().upper() for m in (args.mac or "").split(",") if m.strip()}
        self.name_filters = [n.lower() for n in (args.names.split(",") if args.names else DEFAULT_NAME_FILTERS)]
        # Kollaps identischer aufeinanderfolgender Payloads pro Geraet
        self._last: Dict[str, Tuple[str, int, float]] = {}

    def _matches(self, addr: str, name: str, adv) -> bool:
        if self.args.all:
            return True
        if self.mac_filters and addr in self.mac_filters:
            return True
        if MFG_COMPANY_ID in (self._get(adv, "manufacturer_data") or {}):
            return True
        lname = (name or "").lower()
        return any(f in lname for f in self.name_filters)

    def callback(self, device, advertisement_data):
        try:
            self._handle(device, advertisement_data)
        except Exception as exc:  # niemals den Scanner-Callback sterben lassen
            print(f"[sniffer-error] {exc}", file=sys.stderr)

    @staticmethod
    def _get(obj, key, default=None):
        """Feldzugriff, der sowohl Objekte als auch dicts (bleak>=3) abdeckt."""
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    def _handle(self, a, b) -> None:
        # bleak>=3: Argumente koennen Objekte ODER dicts sein -> normalisieren
        def _is_adv(o) -> bool:
            if isinstance(o, dict):
                return "manufacturer_data" in o
            return hasattr(o, "manufacturer_data")

        if _is_adv(b) or not _is_adv(a):
            dev, adv = a, b
        else:
            adv, dev = a, b

        addr = str(self._get(dev, "address", "") or "").upper()
        name = self._get(dev, "name") or self._get(adv, "local_name") or ""
        mfg = self._get(adv, "manufacturer_data") or {}
        sdata = self._get(adv, "service_data") or {}
        uuids = list(self._get(adv, "service_uuids") or [])
        rssi = self._get(adv, "rssi")
        now = time.time()

        if not self._matches(addr, name, mfg and adv):
            return

        payload_hexes = {f"0x{k:04X}": bytes(v).hex() for k, v in mfg.items()}
        sdata_hexes = {str(k): bytes(v).hex() for k, v in sdata.items()}

        # Identische Frames kollabieren (Idle-Waage broadcastet konstant)
        sig = json.dumps([payload_hexes, sdata_hexes], sort_keys=True)
        prev_sig, prev_count, _prev_rssi = self._last.get(addr, ("", 0, None))
        repeat_note = ""
        if prev_sig == sig:
            if not self.args.dupes:
                self._last[addr] = [sig, prev_count + 1, rssi]
                return
            repeat_note = f" (identisch x{prev_count + 1})"
        self._last[addr] = [sig, 0 if prev_sig != sig else prev_count + 1, rssi]

        ts = datetime.now().astimezone()
        header = (
            f"{ts.strftime('%H:%M:%S.%f')[:-3]}  {addr:<17} RSSI {rssi:>4} dBm  "
            f"name={name or '?':<10}{repeat_note}"
        )
        print(header)
        for key, hx in payload_hexes.items():
            print(f"           mfg {key}: {hx}")
        for key, hx in sdata_hexes.items():
            print(f"           svc {key}: {hx}")
        if uuids:
            print(f"           uuids: {', '.join(uuids)}")

        fg_key = f"0x{MFG_COMPANY_ID:04X}"
        parsed = None
        if fg_key in payload_hexes:
            parsed = parse_fg260_payload(bytes.fromhex(payload_hexes[fg_key]))
            if parsed and self.args.decode:
                w = parsed["weight_kg"]
                w_str = f"{w:.2f} kg" if w is not None else "-"
                imp = ",".join(str(c) for c in parsed["impedance_candidates"]) or "-"
                ck = {True: "OK", False: "BAD", None: "?"}[parsed["checksum_ok"]]
                print(
                    f"           >> status={parsed['status']:<16} typ={parsed['type']:<18} "
                    f"ck={ck:<3} gewicht={w_str:>10}  impedanz_kand={imp}"
                )

        if self.jsonl:
            rec = {
                "ts": ts.isoformat(timespec="milliseconds"),
                "mac": addr,
                "name": name,
                "rssi": rssi,
                "manufacturer_data": payload_hexes,
                "service_data": sdata_hexes,
                "service_uuids": uuids,
                "decoded": parsed,
            }
            self.jsonl.write(json.dumps(rec, ensure_ascii=False) + "\n")
            self.jsonl.flush()


def build_scanner(callback, scan_mode: str):
    """Erzeugt den Scanner mit Fallback-Kette (bleak-3.x-kompatibel).

    bleak >= 3 lehnt scanning_mode="passive" ohne bluez-or_patterns ab;
    deshalb: gewuenschter Modus -> Modus ohne Extra-Kwargs -> Minimal-Konfig.
    """
    attempts = [
        dict(detection_callback=callback, scanning_mode=scan_mode,
             bluez={"duplicate_data": False}),
        dict(detection_callback=callback, scanning_mode=scan_mode),
        dict(detection_callback=callback),
    ]
    last_exc = None
    for kwargs in attempts:
        try:
            return BleakScanner(**kwargs)
        except Exception as exc:
            last_exc = exc
    raise last_exc


async def run(args) -> None:
    jsonl_file = open(args.jsonl, "a", encoding="utf-8") if args.jsonl else None
    sniffer = Sniffer(args, jsonl_file)

    scanner = build_scanner(sniffer.callback, args.scan_mode)
    print("=" * 78)
    print("FG260 Broadcast-Sniffer (verbindungslos, kein connect)")
    print(f"  Scan-Modus : {args.scan_mode}")
    print(f"  MAC-Filter : {sorted(sniffer.mac_filters) or 'aus'}")
    print(f"  Name-Filter: {sniffer.name_filters if not args.all else 'aus (--all)'}")
    print(f"  Mfg-Key    : 0x{MFG_COMPANY_ID:04X} wird immer akzeptiert")
    print("  Steig auf die Waage. Ctrl+C beendet.")
    print("=" * 78)

    try:
        await scanner.start()
        if args.duration:
            await asyncio.sleep(args.duration)
        else:
            while True:
                await asyncio.sleep(3600)
    except KeyboardInterrupt:
        pass
    finally:
        try:
            await scanner.stop()
        except Exception:
            pass
        if jsonl_file:
            jsonl_file.close()
        print("\n[sniffer] beendet.")


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Passiver BLE-Sniffer fuer InSmart FG260 / Fitdays-Waagen",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--mac", default="", help="Komma-separierte MAC-Filter, z.B. A0:91:57:B2:D0:E8")
    ap.add_argument("--names", default=None, help="Komma-separierte Namens-Substring-Filter (Default: typische Namen)")
    ap.add_argument("--all", action="store_true", help="ungefiltert: ALLE BLE-Geraete anzeigen")
    ap.add_argument("--scan-mode", choices=["active", "passive"], default="active",
                    help="active liefert auch Namen (Scan-Response); passive braucht in "
                         "bleak>=3 zwingend bluez-Filter und wird hier nur mit Fallback versucht")
    ap.add_argument("--decode", action="store_true", help="FG260-Frames direkt dekodieren (Gegencheck mit Display)")
    ap.add_argument("--dupes", action="store_true", help="auch identische Folgeframes ausgeben")
    ap.add_argument("--jsonl", metavar="FILE", help="alle Rohpakete als JSONL mitschreiben")
    ap.add_argument("--duration", type=int, default=0, help="nach N Sekunden automatisch beenden (0 = endlos)")
    args = ap.parse_args()

    if not args.decode and not args.all and not args.jsonl:
        args.decode = True  # Default: Decode-Vorschau an, solange nichts anderes gewuenscht
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
