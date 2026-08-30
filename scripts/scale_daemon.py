#!/usr/bin/env python3
"""
scale_daemon.py - Robuster passiver BLE-Daemon fuer InSmart FG260 / Fitdays-Waagen.

Offline-First-Architektur:
    1. BleakScanner im Broadcast-Modus (kein connect(), keine Verbindungsprobleme).
    2. Manufacturer-Payload (Company-ID 0xA0AC) wird dekodiert.
    3. Aggregator erkennt das Ende einer Messung (stabilisiert), filtert Ausreisser
       und entprellt (Debounce), damit pro Wiegung genau EIN Event entsteht.
    4. JEDE Messung wird SOFORT lokal in eine SQLite-Datenbank geschrieben
       (.scale_data/measurements.db, sync_status=0) - nichts geht verloren,
       auch wenn die App aus ist oder kein Netzwerk besteht.
    5. Ein Background-Sync-Worker prueft Konnektivitaet und laedt alle
       ungesyncerten Datensaetze als Batch nach /api/metrics/weight hoch
       (exponentielles Backoff bei Fehlern). Nach 200/201 werden die Datensaetze
       lokal als sync_status=1 markiert.

Protokoll (verifiziert, Details siehe scale_sniffer.py):

    Payload ab Company-ID 41132 (0xA0AC), 12 Bytes:
        [0..5]  MAC reversed | [6] Status | [7..9] Gewicht | [10] Typ | [11] Checksumme
        Status: 0x20=misst, 0xA0=stabil, 0xA2=stabil+Koerperwerte
        Typ:    0x0D=nur Gewicht, 0x06=mit Impedanz
        Gewicht: raw24(BigEndian[7..9]) ^ 0xA0A0 - 0xC80000  =>  Gramm (/1000 => kg)

Logs laufen auf STDERR, damit stdout beim Pipen nur saubere JSON-Events enthaelt.
"""

import argparse
import asyncio
import hashlib
import json
import logging
import os
import random
import socket
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from urllib.parse import urlsplit

try:
    from bleak import BleakScanner
except ImportError:
    sys.exit("bleak fehlt:  pip install bleak")

# ---------------------------------------------------------------------------
# Protokoll-Konstanten (hier feinjustieren, identisch zu scale_sniffer.py)
# ---------------------------------------------------------------------------
MFG_COMPANY_ID = 41132              # 0xA0AC
WEIGHT_XOR_MASK = 0xA0A0            # De-Shuffle-Maske
WEIGHT_ZERO_BASE = 0xC80000         # Rohwert = 0.00 kg
GRAMS_PER_LSB = 1000

STATUS_MEASURING = 0x20
STATUS_STABLE = 0xA0                # final, nur Gewicht
STATUS_STABLE_BODY = 0xA2           # final, mit Koerperwerten
STABLE_STATUSES = (STATUS_STABLE, STATUS_STABLE_BODY)

TYPE_WEIGHT_ONLY = 0x0D
TYPE_BODY = 0x06

logger = logging.getLogger("scale-daemon")


# ---------------------------------------------------------------------------
# Frame-Decodierung
# ---------------------------------------------------------------------------
def decode_weight(raw3: bytes) -> Optional[float]:
    if len(raw3) != 3:
        return None
    raw24 = int.from_bytes(raw3, "big") ^ WEIGHT_XOR_MASK
    grams = raw24 - WEIGHT_ZERO_BASE
    if grams < 0 or grams > 400_000:
        return None
    return round(grams / GRAMS_PER_LSB, 3)


def decode_weight_legacy(meas_frame: bytes) -> Optional[float]:
    """Legacy-Decodierung (pi_zero_scale_bridge.py): Gewicht als 16-bit BE in
    Bytes 8..9 des Gesamtpayloads mit linearer Formel. Aeltere FG260-Firmware-
    Varianten nutzen dieses Layout statt des Icomon-24-bit-Encodings."""
    if len(meas_frame) < 4:
        return None
    raw16 = int.from_bytes(meas_frame[2:4], "big")
    if raw16 == 0:
        return None  # Null-Frame (Idle/Leer) - kein gueltiges Gewicht
    kg = round(219.54 - raw16 * 0.014693, 2)
    if 10 <= kg <= 220:
        return kg
    return None


def decode_weight_any(payload: bytes) -> tuple:
    """Probiert beide bekannten Encodings; liefert (kg, encoding) oder (None, '-')."""
    meas = payload[6:12]
    w = decode_weight(meas[1:4])
    if w is not None:
        return w, "icomon24"
    w2 = decode_weight_legacy(meas)
    if w2 is not None:
        return w2, "legacy16"
    return None, "-"


def verify_checksum(payload: bytes) -> Optional[bool]:
    if len(payload) < 12:
        return None
    return (sum(payload[6:11]) & 0x0F) == (payload[11] & 0x0F)


def impedance_candidates(meas_frame: bytes) -> List[int]:
    """Plausibilitaetsgefilterte Impedanz-Kandidaten (150-1500 Ohm), sortiert nach Naehe zu 500."""
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


def impedance_primary(meas_frame: bytes) -> Optional[int]:
    """Impedanz aus einem Body-Frame (Status 0xA2), gegen Fitdays kalibriert.

    Verifiziert per Screenshot-Vergleich (16:21 Messung): Bytes 7..8 des
    Gesamtpayloads (d[0:2], BigEndian / 100) ist die Impedanz, die Fitdays
    fuer seine KFA-Berechnung verwendet (R=444 -> 19.1% vs. Fitdays 19.6%).
    Bytes 8..9 sind konstant (411) und NICHT die Impedanz.
    """
    if len(meas_frame) < 4:
        return None
    for lo, hi in ((1, 3), (2, 4)):
        z = int(int.from_bytes(meas_frame[lo:hi], "big") / 100)
        if 150 <= z <= 1500:
            return z
    return None


def parse_fg260_payload(payload: bytes) -> Optional[dict]:
    if len(payload) < 12:
        return None
    meas = payload[6:12]
    status = meas[0]
    weight_kg, weight_encoding = decode_weight_any(payload)
    return {
        "status_raw": status,
        "stable": status in STABLE_STATUSES,
        "weight_kg": weight_kg,
        "weight_encoding": weight_encoding,
        "type_raw": meas[4],
        "has_body_flag": meas[4] == TYPE_BODY,
        "checksum_ok": verify_checksum(payload),
        "impedance_ohm": impedance_primary(meas)
        if status == STATUS_STABLE_BODY or meas[4] == TYPE_BODY else None,
        "impedance_candidates": impedance_candidates(meas)
        if status == STATUS_STABLE_BODY or meas[4] == TYPE_BODY else [],
        "mac_in_payload": bytes(reversed(payload[0:6])).hex(":").upper(),
    }


# ---------------------------------------------------------------------------
# Messungs-Aggregator (Plausibilitaet + Debounce)
# ---------------------------------------------------------------------------
@dataclass
class ScaleEvent:
    weight_kg: float
    impedance_ohm: Optional[int]
    impedance_verified: bool
    rssi: Optional[int]
    checksum_ok: Optional[bool]
    measured_at: str
    weight_source: str = "stabilized-frame"


class MeasurementAggregator:
    """Wandelt den Broadcast-Strom in saubere Mess-Events um (eins pro Wiegung).

    Session-Modell:
      - Eine Session beginnt mit dem ersten Frame nach Funkstille > SESSION_TIMEOUT
        oder bei Gewichtssprung >= REWEIGH_DELTA_KG.
      - Pro Session wird max. EIN stabiler Wert emittiert; innerhalb der Session
        unterdruecken wir alle weiteren stabilen Frames, solange sie nahe am
        emittierten Wert liegen (< REWEIGH_DELTA_KG).
      - Zusatzschutz: Mindestabstand DEBOUNCE Sekunden zwischen zwei Events.
    """

    REWEIGH_DELTA_KG = 0.5
    LIVE_FALLBACK_MAX_AGE_S = 60.0
    # Rampenschutz: Live-Fallback nur, wenn die Live-Phase schon laenger laeuft
    # und die letzten beiden Live-Werte ruhig sind (verhindert 35-kg-Events
    # waehrend des Aufsteigens bei noch zirkulierenden A2-Replay-Frames).
    LIVE_SETTLE_MIN_AGE_S = 10.0
    LIVE_SETTLE_SPAN_S = 2.0
    LIVE_SETTLE_TOL_KG = 0.3
    # Merge-Fenster: gleicher Wert kurz nach dem letzten Event (auch über
    # Session-Grenzen hinweg, z.B. A0-Replay-Frame 60 s später) -> unterdrücken.
    MERGE_WINDOW_S = 180.0

    def __init__(self, min_weight: float, max_weight: float, debounce: float,
                 session_timeout: float = 60.0):
        self.min_weight = min_weight
        self.max_weight = max_weight
        self.debounce = debounce
        self.session_timeout = session_timeout
        self._last_frame_ts: Optional[float] = None
        self._session_first_ts: Optional[float] = None
        self._last_emit_ts = 0.0
        self._last_emitted_kg: Optional[float] = None
        self._emitted_this_session = False
        self._live_history: List[tuple] = []          # [(ts, kg), ...]
        self._session_impedance: Optional[int] = None
        self._warned_mac_mismatch = False

    def feed(self, parsed: dict, rssi: Optional[int], ts: float) -> Optional[ScaleEvent]:
        # Session-Grenze erkennen (emittierter Wert bleibt fuer Merge-Fenster erhalten)
        new_session = (
            self._last_frame_ts is None
            or (ts - self._last_frame_ts) > self.session_timeout
        )
        if new_session:
            self._emitted_this_session = False
            self._live_history = []
            self._session_impedance = None
            self._session_first_ts = ts
        self._last_frame_ts = ts

        weight = parsed["weight_kg"]
        weight_source = "stabilized-frame"

        # Live-Werte als Fallback-Puffer mitfuehren
        if parsed["status_raw"] == STATUS_MEASURING:
            if weight is not None and self.min_weight <= weight <= self.max_weight:
                self._live_history.append((ts, weight))
                if len(self._live_history) > 12:
                    self._live_history = self._live_history[-12:]
            return None

        # Impedanz aus A2-Frames fuer die gesamte Session merken
        if parsed.get("impedance_ohm") is not None:
            self._session_impedance = parsed["impedance_ohm"]

        if parsed["stable"] and weight is None and parsed["status_raw"] == STATUS_STABLE_BODY:
            # Body-Frame ohne Gewicht (FG260-Varianten senden im A2-Frame nur
            # die Impedanz): Gewicht aus den Live-Frames der Session ableiten.
            hist = self._live_history
            settled = (
                len(hist) >= 2
                and (ts - self._session_first_ts) >= self.LIVE_SETTLE_MIN_AGE_S
                and (ts - hist[-1][0]) <= self.LIVE_FALLBACK_MAX_AGE_S
                and (hist[-1][0] - hist[-2][0]) >= self.LIVE_SETTLE_SPAN_S * 0.5
                and abs(hist[-1][1] - hist[-2][1]) <= self.LIVE_SETTLE_TOL_KG
            )
            if settled:
                weight = hist[-1][1]
                weight_source = "live-fallback"
            elif hist and (ts - hist[-1][0]) <= self.LIVE_FALLBACK_MAX_AGE_S:
                # Entspannter Fallback: manche Waagen stabilisieren in < 2 s,
                # sodass die strenge Ruhe-Kriterien nie erfuellt sind. Das
                # Maximum der letzten Live-Werte entspricht dem finalen Wert
                # (beim Aufsteigen steigt das Gewicht monoton).
                weight = max(w for _, w in hist[-8:])
                weight_source = "live-fallback"
        if not parsed["stable"] or weight is None:
            return None
        if weight == 0 or not (self.min_weight <= weight <= self.max_weight):
            logger.debug("Ausreisser verworfen: %.2f kg", weight)
            return None

        near_last = (
            self._last_emitted_kg is not None
            and abs(weight - self._last_emitted_kg) < self.REWEIGH_DELTA_KG
        )
        # Pro Session nur EIN Event: Waagen broadcasten waehrend des Stehens
        # kontinuierlich stabil klingende Ramp-Werte - jedes weitere would
        # sonst als eigene Wiegung zaehlen. Cross-Session-Replays innerhalb
        # des Merge-Fensters unten abfangen.
        if self._emitted_this_session:
            return None
        merged_recent = (
            near_last and (ts - self._last_emit_ts) < self.MERGE_WINDOW_S
        )
        if merged_recent:
            return None  # Replay-Frame der letzten Wiegung
        if near_last and (ts - self._last_emit_ts) < self.debounce:
            return None

        self._last_emit_ts = ts
        self._last_emitted_kg = weight
        self._emitted_this_session = True

        imp = parsed.get("impedance_ohm") or self._session_impedance
        return ScaleEvent(
            weight_kg=round(weight, 2),
            impedance_ohm=imp,
            impedance_verified=False,
            rssi=rssi,
            checksum_ok=parsed["checksum_ok"],
            measured_at=datetime.now().astimezone().isoformat(timespec="seconds"),
            weight_source=weight_source,
        )


# ---------------------------------------------------------------------------
# Body-Composition + Webhook (aus pi_zero_scale_bridge.py uebernommen)
# ---------------------------------------------------------------------------
def calculate_body_composition(weight_kg, impedance_ohms, height_cm=193, age=25,
                               gender="male", athlete=False):
    """Body-Composition nach dem Fitdays/Yolanda-Modell (reverse-engineered).

    Kalibriert gegen zwei Fitdays-Screenshots (25.08., 97.60 kg, R_raw=444):
    Alle Werte (KFA, Fett, FFM, Muskel, Skelett, Knochen, Protein, Wasser,
    Viszeral, BMR) reproduzieren die Fitdays-Anzeige auf +-0.1.

    Modell:
      R_eff    = R_raw * 1.0125                  (Kontakt-Kompensation, kalibriert)
      FFM      = 0.485*H^2/R_eff + 0.338*W + 5.32 (m) / 0.476/0.295/5.49 (w)
      Sportler : FFM *= 1.065
      Fett     = round(W - FFM, 1);  KFA = Fett/W
      Knochen  = 0.0501 * FFM
      Muskeln  = FFM(gerundet) - Knochen
      Skelett-M% = 0.6465 * FFM / W
      Wasser   = 0.7225 * FFM;  Protein = 0.228 * FFM
      BMR      = 370 + 21.6 * FFM                (Katch-McArdle)
      Viszeral = clamp(0.039*Fett + 8.35, 1, 30)
    """
    is_male = gender.lower() == "male"
    r_raw = impedance_ohms if impedance_ohms and (150 < impedance_ohms < 1500) else 445
    r_eff = r_raw * 1.0125
    h2r = (height_cm * height_cm) / r_eff

    if is_male:
        ffm = 0.485 * h2r + 0.338 * weight_kg + 5.32
    else:
        ffm = 0.476 * h2r + 0.295 * weight_kg + 5.49
    if athlete:
        ffm *= 1.065
    ffm = min(weight_kg * 0.95, max(weight_kg * 0.60, ffm))

    fat_kg = round(weight_kg - ffm, 1)
    body_fat_pct = round((fat_kg / weight_kg) * 100.0, 1)
    ffm_r = round(ffm, 1)
    bone_mass_kg = round(0.0501 * ffm_r, 1)
    muscle_mass_kg = round(ffm_r - bone_mass_kg, 1)
    water_kg = round(0.7225 * ffm_r, 1)
    protein_kg = round(0.228 * ffm_r, 1)
    bmr_kcal = int(round(370 + 21.6 * ffm))
    visceral_fat = round(min(30.0, max(1.0, 0.039 * fat_kg + 8.35)), 1)

    height_m = height_cm / 100.0
    bmi = round(weight_kg / (height_m * height_m), 1)

    return {
        "weight": round(weight_kg, 2),
        "bmi": bmi,
        "bodyFatPct": body_fat_pct,
        "fatMassKg": fat_kg,
        "fatFreeMassKg": ffm_r,
        "muscleMassKg": muscle_mass_kg,
        "muscleMassPct": round((muscle_mass_kg / weight_kg) * 100.0, 1),
        "skeletalMusclePct": round((0.646 * ffm_r / weight_kg) * 100.0, 1),
        "waterKg": water_kg,
        "waterPct": round((water_kg / weight_kg) * 100.0, 1),
        "proteinKg": protein_kg,
        "proteinPct": round((0.228 * ffm_r / weight_kg) * 100.0, 1),
        "boneMassKg": bone_mass_kg,
        "visceralFat": visceral_fat,
        "bmrKcal": bmr_kcal,
        "impedanceOhm": int(round(r_raw)),
        "athlete": athlete,
        "source": "Insmart FG260",
    }


def resolve_api_secret(args) -> Optional[str]:
    """API-Secret fuer den Cloud-Sync: CLI > Datei > Umgebungsvariable.

    Die Datei darf das Secret nackt enthalten ODER als Zeile
    'APP_API_SECRET=xxx' (z.B. kopierte .env.local). CR/LF und
    Whitespace werden toleriert.
    """
    if args.api_secret:
        return args.api_secret.strip()
    if args.api_secret_file:
        try:
            with open(args.api_secret_file, "r", encoding="utf-8") as fh:
                content = fh.read()
        except OSError as exc:
            logger.warning("Secret-Datei %s nicht lesbar: %s", args.api_secret_file, exc)
            return None
        for line in content.splitlines():
            line = line.strip()
            if line.startswith("APP_API_SECRET="):
                return line.split("=", 1)[1].strip()
        content = content.strip()
        return content or None
    import os
    env = os.environ.get("APP_API_SECRET")
    return env.strip() if env else None


# ---------------------------------------------------------------------------
# Lokale Persistenz (SQLite) - Offline-First-Speicher
# ---------------------------------------------------------------------------
class MeasurementStore:
    """Dauerhafter lokaler Messungs-Cache.

    Schema (Anforderung): id, timestamp (ISO UTC), weight_kg, impedance_raw,
    body_fat_pct, sync_status BOOLEAN DEFAULT false. Zusaetzlich wird der
    komplette Body-Comp-Payload als JSON vorgehalten sowie Retry-Buchhaltung
    (sync_attempts/last_error), damit der Sync-Worker idempotent und
    beobachtbar arbeitet.
    """

    def __init__(self, db_path: str):
        self.db_path = os.path.abspath(os.path.expanduser(db_path))
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        # RLock: Methoden rufen sich intern verschachtelt auf (init -> _init_schema)
        self._lock = threading.RLock()
        # check_same_thread=False: Zugriff aus BLE-Callback (Event-Loop-Thread)
        # und Sync-Worker (to_thread) - serialisiert ueber self._lock.
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._init_schema()

    def _init_schema(self) -> None:
        with self._conn, self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS measurements (
                    id             TEXT PRIMARY KEY,
                    timestamp      TEXT NOT NULL,
                    weight_kg      REAL NOT NULL,
                    impedance_raw  INTEGER,
                    body_fat_pct   REAL,
                    payload        TEXT NOT NULL,
                    sync_status    INTEGER NOT NULL DEFAULT 0,
                    sync_attempts  INTEGER NOT NULL DEFAULT 0,
                    last_error     TEXT,
                    created_at     TEXT NOT NULL
                )
                """
            )
            self._conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_measurements_unsynced "
                "ON measurements (sync_status, created_at)"
            )

    @staticmethod
    def _deterministic_id(user_id: str, measured_at_utc: str) -> str:
        """Generate deterministic ID matching cloud API: scale_<sha256(user_id|measured_at)[:24]>"""
        return f"scale_{hashlib.sha256(f'{user_id}|{measured_at_utc}'.encode()).hexdigest()[:24]}"

    def insert(self, event: "ScaleEvent", payload: dict, user_id: str = "local") -> str:
        """Messung sofort persistent machen (WAL-Commit < 1 ms typisch)."""
        ts_utc = datetime.fromisoformat(event.measured_at).astimezone(timezone.utc).isoformat(
            timespec="seconds"
        )
        record_id = self._deterministic_id(user_id, ts_utc)
        with self._conn, self._lock:
            self._conn.execute(
                "INSERT OR IGNORE INTO measurements (id, timestamp, weight_kg, impedance_raw,"
                " body_fat_pct, payload, sync_status, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
                (
                    record_id,
                    ts_utc,
                    float(event.weight_kg),
                    event.impedance_ohm,
                    float(payload["bodyFatPct"]) if payload.get("bodyFatPct") is not None else None,
                    json.dumps(payload, ensure_ascii=False),
                    self._utc_now_iso(),
                ),
            )
        return record_id

    MAX_SYNC_ATTEMPTS = 50  # Gift-Datensaetze irgendwann aufgeben

    def fetch_unsynced(self, limit: int) -> List[dict]:
        with self._lock:
            cur = self._conn.execute(
                "SELECT id, timestamp, weight_kg, impedance_raw, body_fat_pct, payload"
                " FROM measurements"
                " WHERE sync_status = 0 AND sync_attempts < ?"
                " ORDER BY created_at ASC LIMIT ?",
                (self.MAX_SYNC_ATTEMPTS, limit),
            )
            rows = cur.fetchall()
        out = []
        for r in rows:
            try:
                payload = json.loads(r[5])
            except (ValueError, TypeError):
                payload = {}
            out.append(
                {
                    "id": r[0],
                    "timestamp": r[1],
                    "weight_kg": r[2],
                    "impedance_raw": r[3],
                    "body_fat_pct": r[4],
                    "payload": payload,
                }
            )
        return out

    def mark_synced(self, ids: List[str]) -> None:
        if not ids:
            return
        with self._conn, self._lock:
            self._conn.executemany(
                "UPDATE measurements SET sync_status = 1, last_error = NULL WHERE id = ?",
                [(i,) for i in ids],
            )

    def mark_failed(self, ids: List[str], error: str) -> None:
        if not ids:
            return
        with self._conn, self._lock:
            self._conn.executemany(
                "UPDATE measurements SET sync_attempts = sync_attempts + 1,"
                " last_error = ? WHERE id = ?",
                [(error[:200], i) for i in ids],
            )

    def prune_synced(self, retention_days: int) -> int:
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=retention_days)
        ).isoformat(timespec="seconds")
        # ISO-UTC-Strings vergleichen lexikographisch korrekt
        with self._conn, self._lock:
            cur = self._conn.execute(
                "DELETE FROM measurements WHERE sync_status = 1 AND created_at < ?",
                (cutoff,),
            )
            return cur.rowcount

    def counts(self) -> Dict[str, int]:
        with self._lock:
            cur = self._conn.execute(
                "SELECT sync_status, COUNT(*) FROM measurements GROUP BY sync_status"
            )
        result = {"synced": 0, "pending": 0}
        for status, count in cur.fetchall():
            key = "synced" if status == 1 else "pending"
            result[key] = result.get(key, 0) + int(count)
        return result

    def close(self) -> None:
        with self._lock:
            try:
                self._conn.close()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Background Cloud-Sync-Worker (Konnektivitaet + exponentielles Backoff)
# ---------------------------------------------------------------------------
class CloudSyncWorker:
    """Laedt ungesyncerte Messungen an {app_url}/api/metrics/weight hoch.

    - Konnektivitaetspruefung per TCP-Connect zum App-Host (3 s Timeout).
    - Batch-POST (max. 100 Records) mit Bearer/x-api-key.
    - Bei 200/201: Datensaetze lokal als sync_status=1 markieren.
    - Bei Fehlern: exponentielles Backoff 30 s * 2^n, gedeckelt auf 1 h,
      plus Jitter. Erfolgreiche Syncs setzen den Backoff zurueck.
    """

    BACKOFF_BASE_S = 30.0
    BACKOFF_MAX_S = 3600.0
    BATCH_LIMIT = 100
    CONNECT_TIMEOUT_S = 3.0
    POST_TIMEOUT_S = 12.0
    PRUNE_INTERVAL_S = 3600.0

    def __init__(self, app_url: str, api_secret: Optional[str], store: MeasurementStore,
                 interval_s: float, retention_days: int):
        self.app_url = app_url.rstrip("/")
        self.api_secret = api_secret
        self.store = store
        self.interval_s = max(5.0, interval_s)
        self.retention_days = max(1, retention_days)
        self._wake = asyncio.Event()
        self._consecutive_failures = 0
        self._next_allowed_monotonic = 0.0
        self._last_prune = 0.0

    # Von emit() aus dem BLE-Callback gerufen - weckt den Worker sofort.
    def wake(self) -> None:
        self._wake.set()

    def _backoff_delay_s(self) -> float:
        delay = min(
            self.BACKOFF_BASE_S * (2 ** min(self._consecutive_failures, 10)),
            self.BACKOFF_MAX_S,
        )
        return delay * random.uniform(0.85, 1.15)

    async def run(self) -> None:
        logger.info("Cloud-Sync-Worker aktiv (Ziel: %s/api/metrics/weight)", self.app_url)
        while True:
            timeout = max(1.0, self._next_allowed_monotonic - time.monotonic())
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                pass
            self._wake.clear()

            now_mono = time.monotonic()
            if now_mono < self._next_allowed_monotonic:
                await asyncio.sleep(self._next_allowed_monotonic - now_mono)

            pending = self.store.counts()["pending"]
            if pending == 0:
                self._maybe_prune()
                continue

            try:
                await asyncio.to_thread(self._sync_cycle)
            except Exception as exc:  # defensiv: Worker darf niemals sterben
                logger.warning("Sync-Zyklus fehlgeschlagen: %s", exc)
                self._register_failure(str(exc))
            self._maybe_prune()

    def _maybe_prune(self) -> None:
        now_mono = time.monotonic()
        if now_mono - self._last_prune >= self.PRUNE_INTERVAL_S:
            self._last_prune = now_mono
            try:
                pruned = self.store.prune_synced(self.retention_days)
                if pruned:
                    logger.info("Alt-Datenbereinigung: %d synchronisierte Messungen geloescht", pruned)
            except Exception as exc:
                logger.debug("Bereinigung fehlgeschlagen: %s", exc)

    def _has_connectivity(self) -> bool:
        parts = urlsplit(self.app_url)
        host = parts.hostname
        port = parts.port or (443 if parts.scheme == "https" else 80)
        if not host:
            return False
        try:
            with socket.create_connection((host, port), timeout=self.CONNECT_TIMEOUT_S):
                return True
        except OSError:
            return False

    def _post_batch(self, records: List[dict]) -> List[str]:
        """Blockierender Batch-POST; liefert die vom Server bestaetigten IDs."""
        measurements = []
        for rec in records:
            payload = dict(rec["payload"] or {})
            payload.update(
                {
                    "id": rec["id"],
                    "timestamp": rec["timestamp"],
                    "weightKg": rec["weight_kg"],
                    "impedanceRaw": rec["impedance_raw"],
                    "bodyFatPct": rec["body_fat_pct"]
                    if rec["body_fat_pct"] is not None
                    else payload.get("bodyFatPct"),
                    "userId": payload.get("userId", "local"),
                }
            )
            measurements.append(payload)

        url = f"{self.app_url}/api/metrics/weight"
        req = urllib.request.Request(
            url,
            data=json.dumps({"measurements": measurements}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        if self.api_secret:
            # Die App (src/proxy.ts) akzeptiert Bearer ODER x-api-key
            req.add_header("Authorization", f"Bearer {self.api_secret}")
            req.add_header("x-api-key", self.api_secret)

        sent_ids = [rec["id"] for rec in records]
        with urllib.request.urlopen(req, timeout=self.POST_TIMEOUT_S) as response:
            # py3.8-urllib hat nur getcode(); http.client-Objekte haben .status.
            # Kein getattr mit Methodenaufruf als Default (evaluiert immer!).
            if hasattr(response, "status"):
                status = response.status
            else:
                status = response.getcode()
            if status not in (200, 201):
                raise RuntimeError(f"Unerwarteter HTTP-Status {status}")
            resp_body = response.read().decode("utf-8", errors="replace")

        confirmed_ids: List[str] = []
        try:
            data = json.loads(resp_body)
            if isinstance(data.get("synced"), list) and data["synced"]:
                confirmed_ids = [i for i in data["synced"] if i in set(sent_ids)]
        except ValueError:
            pass
        # Fallback: Server hat 200/201 geantwortet, aber ohne ID-Liste ->
        # gesamten Batch als erfolgreich werten (Upsert ist idempotent).
        if not confirmed_ids:
            confirmed_ids = sent_ids
        return confirmed_ids

    def _sync_cycle(self) -> None:
        records = self.store.fetch_unsynced(self.BATCH_LIMIT)
        if not records:
            return
        if not self._has_connectivity():
            logger.info(
                "Keine Verbindung zu %s - %d Messung(en) bleiben offline gepuffert",
                self.app_url, len(records),
            )
            self._register_failure("no-connectivity")
            return
        try:
            confirmed = self._post_batch(records)
            self.store.mark_synced(confirmed)
            failed = [r["id"] for r in records if r["id"] not in set(confirmed)]
            if failed:
                self.store.mark_failed(failed, "vom Server abgelehnt")
            self._consecutive_failures = 0
            self._next_allowed_monotonic = 0.0
            remaining = self.store.counts()["pending"]
            logger.info(
                "☁️ Sync OK: %d/%d hochgeladen | noch offen: %d",
                len(confirmed), len(records), remaining,
            )
        except urllib.error.HTTPError as exc:
            logger.error("HTTP %s beim Cloud-Sync (%s)", exc.code, exc.reason)
            self.store.mark_failed([r["id"] for r in records], f"HTTP {exc.code}")
            self._register_failure(f"HTTP {exc.code}")
        except Exception as exc:
            logger.error("Cloud-Sync fehlgeschlagen: %s", exc)
            self.store.mark_failed([r["id"] for r in records], str(exc))
            self._register_failure(str(exc))

    def _register_failure(self, reason: str) -> None:
        self._consecutive_failures += 1
        delay = self._backoff_delay_s()
        self._next_allowed_monotonic = time.monotonic() + delay
        logger.warning(
            "Sync-Backoff: naechster Versuch in %.0f s (Versuch %d, Grund: %s)",
            delay, self._consecutive_failures, reason,
        )


# ---------------------------------------------------------------------------
# Daemon-Hauptloop
# ---------------------------------------------------------------------------
def build_scanner(callback, scan_mode: str):
    """Scanner mit Fallback-Kette: bleak>=3 lehnt 'passive' ohne bluez-or_patterns ab.

    Beide Modi sind verbindungslos; 'active' sendet zusaetzlich Scan-Requests
    (liefert auch Geraetenamen) und ist der sichere Default.
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
    aggregator = MeasurementAggregator(args.min_weight, args.max_weight, args.debounce,
                                       session_timeout=args.session_timeout)
    mac_filters = {m.strip().upper() for m in (args.mac or "").split(",") if m.strip()}
    stats = {"frames": 0, "events": 0, "scan_started": 0.0}
    api_secret = resolve_api_secret(args)

    # ── Offline-First: lokale SQLite-Persistenz + Cloud-Sync-Worker ──────────
    store = MeasurementStore(args.db_path)
    counts = store.counts()
    if counts["pending"]:
        logger.info(
            "💾 %d lokal gepufferte Messung(en) warten auf Cloud-Sync.",
            counts["pending"],
        )

    sync_worker: Optional[CloudSyncWorker] = None
    if args.app_url:
        sync_worker = CloudSyncWorker(
            args.app_url, api_secret, store,
            interval_s=args.sync_interval,
            retention_days=args.retention_days,
        )
        if api_secret:
            logger.info("Cloud-Sync-Auth aktiv (Bearer/x-api-key gesetzt).")
        else:
            logger.warning("Kein API-Secret konfiguriert - die App wird Sync-POSTs ggf. mit 401 ablehnen.")
    else:
        logger.warning("--app-url leer: nur lokale Speicherung, kein Cloud-Sync.")

    def emit(event: ScaleEvent) -> None:
        # Mehrbenutzer-Trennung nach Gewicht: unterhalb der Schwelle wird die
        # Messung dem zweiten Nutzer (z.B. Freundin) zugeordnet.
        is_heavy_user = event.weight_kg >= args.threshold_kg
        user_id = args.user_main if is_heavy_user else args.user_second
        comp = calculate_body_composition(
            event.weight_kg, event.impedance_ohm, args.height, args.age,
            args.gender, athlete=args.athlete and is_heavy_user
        )
        # 1. SOFORT persistent speichern (Offline-First, sync_status=0)
        record_id = store.insert(event, comp, user_id)
        payload = {
            **comp,
            "id": record_id,
            "userId": user_id,
            "measuredAt": event.measured_at,
            "timestamp": datetime.fromisoformat(event.measured_at)
            .astimezone(timezone.utc)
            .isoformat(timespec="seconds"),
            "impedanceOhm": event.impedance_ohm,
            "impedanceVerified": event.impedance_verified,
            "weightSource": event.weight_source,
            "rssi": event.rssi,
            "checksumOk": event.checksum_ok,
            "synced": False,
        }
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        logger.info(
            "== FINALE MESSUNG [%s]: %.2f kg (%s) | Impedanz=%s Ohm%s | KFA %.1f%% | BMI %.1f ==",
            user_id,
            event.weight_kg,
            event.weight_source,
            event.impedance_ohm if event.impedance_ohm is not None else "-",
            "" if event.impedance_verified else " (unverifiziert)",
            comp["bodyFatPct"],
            comp["bmi"],
        )
        logger.info("💾 Messung lokal gespeichert (%s), Cloud-Sync angestossen", record_id)
        # 2. Sync-Worker sofort wecken (Upload erfolgt non-blocking)
        if sync_worker is not None:
            sync_worker.wake()

    def detection_callback(a, b) -> None:
        # bleak>=3 liefert Argumente teils als Objekte, teils als dicts
        def _get(o, k, d=None):
            if isinstance(o, dict):
                return o.get(k, d)
            return getattr(o, k, d)

        def _is_adv(o) -> bool:
            if isinstance(o, dict):
                return "manufacturer_data" in o
            return hasattr(o, "manufacturer_data")

        try:
            if _is_adv(b) or not _is_adv(a):
                dev, adv = a, b
            else:
                adv, dev = a, b

            addr = str(_get(dev, "address", "") or "").upper()
            name = _get(dev, "name") or _get(adv, "local_name") or ""
            mfg = _get(adv, "manufacturer_data") or {}

            if mac_filters and addr not in mac_filters:
                return
            raw = mfg.get(MFG_COMPANY_ID)
            if raw is None:
                lname = str(name).lower()
                if not any(f in lname for f in ("aaa", "qn-", "insmart", "fg260", "fitdays")):
                    return
                raw = next(iter(mfg.values()), None)
            if not raw:
                return

            stats["frames"] += 1

            # Warmup: BlueZ reicht beim Scanner-Start gecachte Advertisements
            # alter Messungen nach -> nicht als neue Wiegung werten.
            if time.time() - stats["scan_started"] < args.warmup:
                logger.debug("Warmup-Frame verworfen (Cache): %s", bytes(raw).hex())
                return

            parsed = parse_fg260_payload(bytes(raw))
            if parsed is None:
                logger.debug("Zu kurzes Payload ignoriert: %s", bytes(raw).hex())
                return
            log = logger.info if (parsed["stable"] and parsed["weight_kg"] is None) else logger.debug
            log("Frame: %s | status=%s gewicht=%s (%s) impedanz=%s",
                bytes(raw).hex(), parsed["status_raw"],
                parsed["weight_kg"], parsed["weight_encoding"], parsed["impedance_ohm"])
            stats.setdefault("status_counts", {})
            key = f"0x{parsed['status_raw']:02X}"
            stats["status_counts"][key] = stats["status_counts"].get(key, 0) + 1
            if not mac_filters:
                reported = addr.replace(":", "")
                if reported and parsed["mac_in_payload"].replace(":", "") != reported:
                    if not aggregator._warned_mac_mismatch:
                        aggregator._warned_mac_mismatch = True
                        logger.warning(
                            "MAC im Payload (%s) weicht von der Advertising-Adresse (%s) ab - "
                            "ggf. --mac setzen oder Offsets pruefen.",
                            parsed["mac_in_payload"], addr,
                        )

            if parsed["checksum_ok"] is False:
                logger.debug("Checksummen-Fehler im Frame: %s", bytes(raw).hex())

            event = aggregator.feed(parsed, _get(adv, "rssi"), time.time())
            if event is not None:
                stats["events"] += 1
                emit(event)
        except Exception as exc:
            logger.exception("Callback-Fehler: %s", exc)

    scanner = build_scanner(detection_callback, args.scan_mode)

    if sync_worker is not None:
        asyncio.get_running_loop().create_task(sync_worker.run())

    counts = store.counts()
    logger.info("=" * 70)
    logger.info("FG260 Scale-Daemon aktiv (passiver Broadcast-Empfang, kein connect)")
    logger.info("Offline-First: SQLite unter %s (offen: %d, synchronisiert: %d)",
                store.db_path, counts["pending"], counts["synced"])
    logger.info("Cloud-Ziel: %s/api/metrics/weight | Profil: %scm/%sj/%s",
                args.app_url or "(deaktiviert)", args.height, args.age, args.gender)
    logger.info("Mehrbenutzer: >= %.0f kg -> '%s' | < %.0f kg -> '%s'",
                args.threshold_kg, args.user_main, args.threshold_kg, args.user_second)
    logger.info("Filter: Gewicht %s-%s kg | Debounce %ss | MAC %s",
                args.min_weight, args.max_weight, args.debounce,
                sorted(mac_filters) or "auto (Mfg-Key/Name)")
    logger.info("=" * 70)

    while True:
        try:
            await scanner.start()
            stats["scan_started"] = time.time()
            logger.info("BLE-Scanner laeuft (%s). Warte auf Messung...", args.scan_mode)
            last_reported = 0
            while True:
                await asyncio.sleep(15.0)
                if stats["frames"] != last_reported:
                    dist = ", ".join(f"{k}:{v}" for k, v in
                                     sorted(stats.get("status_counts", {}).items()))
                    logger.info("Lebenszeichen: %d Frames (%s) | %d Events emittiert",
                                stats["frames"], dist or "-", stats["events"])
                    last_reported = stats["frames"]
                elif stats["frames"] == 0 and last_reported == 0 and stats.get("_nagged") is not True:
                    stats["_nagged"] = True
                    logger.info(
                        "Noch keine Frames empfangen. Moegliche Ursachen: Waage schlaeft, "
                        "Fitdays-App am Handy ist mit der Waage verbunden (Broadcast pausiert), "
                        "oder MAC-Filter falsch."
                    )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Scanner-Neustart nach Fehler: %s", exc)
            try:
                await scanner.stop()
            except Exception:
                pass
            await asyncio.sleep(args.restart_delay)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Passiver BLE-Daemon fuer InSmart FG260 (Fitdays/Yolanda-Protokoll)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--mac", default="", help="MAC der Waage (empfohlen), z.B. A0:91:57:B2:D0:E8")
    ap.add_argument("--app-url", default="http://192.168.178.38:3000",
                    help="Basis-URL der App (Ziel: /api/metrics/weight); leerer String ('') deaktiviert den Cloud-Sync")
    ap.add_argument("--db-path", default=os.path.expanduser("~/.scale_data/measurements.db"),
                    help="Pfad der lokalen SQLite-Datenbank (Offline-Cache)")
    ap.add_argument("--sync-interval", type=float, default=60.0,
                    help="Mindestabstand zwischen zwei Sync-Zyklen in Sekunden")
    ap.add_argument("--retention-days", type=int, default=90,
                    help="Synchronisierte Messungen nach so vielen Tagen lokal loeschen")
    ap.add_argument("--threshold-kg", type=float, default=80.0,
                    help="Gewichtsschwelle der Mehrbenutzer-Trennung")
    ap.add_argument("--user-main", default="local",
                    help="user_id fuer Messungen >= --threshold-kg (Hauptnutzer)")
    ap.add_argument("--user-second", default="freundin",
                    help="user_id fuer Messungen < --threshold-kg (zweiter Nutzer)")
    ap.add_argument("--height", type=int, default=193)
    ap.add_argument("--age", type=int, default=25)
    ap.add_argument("--gender", default="male", choices=["male", "female"])
    ap.add_argument("--athlete", action="store_true",
                    help="Sportler-Modus (Fitdays 'Sport'-Profil: FFM*1.065)")
    ap.add_argument("--min-weight", type=float, default=20.0, help="Plausibilitaets-Untergrenze kg")
    ap.add_argument("--max-weight", type=float, default=200.0, help="Plausibilitaets-Obergrenze kg")
    ap.add_argument("--debounce", type=float, default=30.0, help="Mindestabstand zweier Events (s)")
    ap.add_argument("--session-timeout", type=float, default=60.0,
                    help="Funkstille in Sekunden, nach der eine neue Wiegung angenommen wird")
    ap.add_argument("--restart-delay", type=float, default=2.0, help="Wartezeit nach Scanner-Fehler (s)")
    ap.add_argument("--scan-mode", choices=["active", "passive"], default="active",
                    help="verbindungslos; active liefert zusaetzlich Geraetenamen")
    ap.add_argument("--warmup", type=float, default=3.0,
                    help="Sekunden nach Scanner-Start, in denen Cache-Replays von BlueZ ignoriert werden")
    ap.add_argument("--api-secret", default=None, help="APP_API_SECRET fuer den Webhook (sonst Datei/Umgebung)")
    ap.add_argument("--api-secret-file", default="/home/pi/.scale_env",
                    help="Datei mit Zeile APP_API_SECRET=... (leer = deaktiviert)")
    ap.add_argument("-v", "--verbose", action="store_true", help="Debug-Logging (stderr)")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stderr,
    )

    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        logger.info("Beendet.")


if __name__ == "__main__":
    main()
