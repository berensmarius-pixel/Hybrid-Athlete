#!/usr/bin/env python3
import asyncio
import argparse
import json
import logging
import os
import sys
import time
import urllib.request
import urllib.error
from bleak import BleakScanner

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("InsmartFG260")

def calculate_body_composition(weight_kg, impedance_ohms, height_cm=193, age=25, gender="male"):
    height_m = height_cm / 100.0
    bmi = round(weight_kg / (height_m * height_m), 1)
    is_male = (gender.lower() == "male")
    
    impedance = impedance_ohms if (100 < impedance_ohms < 1500) else 520
    height_sq_over_r = (height_cm * height_cm) / impedance

    if is_male:
        lean_mass = 0.485 * height_sq_over_r + 0.338 * weight_kg + 5.32
    else:
        lean_mass = 0.476 * height_sq_over_r + 0.295 * weight_kg + 5.49

    lean_mass = min(weight_kg * 0.92, max(weight_kg * 0.65, lean_mass))
    fat_mass = max(0.0, weight_kg - lean_mass)
    body_fat_pct = round((fat_mass / weight_kg) * 100.0, 1)

    muscle_mass_kg = round(lean_mass * 0.75, 1)
    muscle_mass_pct = round((muscle_mass_kg / weight_kg) * 100.0, 1)
    water_kg = lean_mass * 0.73
    water_pct = round((water_kg / weight_kg) * 100.0, 1)

    bone_mass_kg = round(lean_mass * 0.055 if is_male else lean_mass * 0.048, 1)
    base_visceral = (bmi - 18.5) * 0.6 + (body_fat_pct - 10.0) * 0.25
    visceral_fat = max(1, min(15, int(round(base_visceral))))
    bmr_kcal = int(round(10 * weight_kg + 6.25 * height_cm - 5 * age + (5 if is_male else -161)))

    return {
        "weight": round(weight_kg, 2),
        "bmi": bmi,
        "bodyFatPct": body_fat_pct,
        "muscleMassKg": muscle_mass_kg,
        "muscleMassPct": muscle_mass_pct,
        "waterPct": water_pct,
        "boneMassKg": bone_mass_kg,
        "visceralFat": visceral_fat,
        "bmrKcal": bmr_kcal,
        "source": "Insmart FG260",
    }

def post_measurement(app_url, data, api_secret=None, user_id="local"):
    url = f"{app_url.rstrip('/')}/api/scale/webhook"
    # Add userId to payload for deterministic ID generation
    data["userId"] = user_id
    payload = json.dumps(data).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_secret:
        headers["Authorization"] = f"Bearer {api_secret}"
    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            resp_body = response.read().decode("utf-8")
            logger.info(f"✅ Messung erfolgreich an App übertragen: {resp_body}")
            return True
    except urllib.error.HTTPError as e:
        logger.error(f"❌ HTTP {e.code} beim Senden an {url} (API-Secret korrekt konfiguriert?)")
        return False
    except Exception as e:
        logger.error(f"❌ Fehler beim Senden an {url}: {e}")
        return False

def parse_fg260_payload(raw_bytes):
    if not raw_bytes or len(raw_bytes) < 10:
        return None

    status = raw_bytes[6]
    is_locked = (status == 0xA2)

    raw_val = (raw_bytes[8] << 8) | raw_bytes[9]
    if raw_val == 0:
        return None
        
    weight_kg = round(219.54 - (raw_val * 0.014693), 2)
    
    impedance = 520
    if len(raw_bytes) >= 12:
        raw_imp = (raw_bytes[10] << 8) | raw_bytes[11]
        if 150 < raw_imp < 1800:
            impedance = raw_imp

    if 10.0 <= weight_kg <= 220.0:
        return weight_kg, impedance, is_locked

    return None

async def run_scale_listener(app_url, height_cm, age, gender, api_secret=None, user_id="local"):
    logger.info("=" * 65)
    logger.info("🚀 Hybrid Athlete - Insmart FG260 Scale Bridge aktiv")
    logger.info(f"📍 Ziel-App URL: {app_url}/api/scale/webhook")
    logger.info(f"🔐 API-Secret: {'aktiv' if api_secret else 'NICHT gesetzt (Server lehnt ggf. ab)'}")
    logger.info(f"👤 Profil: {height_cm} cm | {age} Jahre | {gender}")
    logger.info("📡 Warte auf Insmart FG260 (einfach auf die Waage stellen)...")
    logger.info("=" * 65)

    last_sent_time = 0
    readings = []
    locked_reading = None
    last_seen = 0

    def detection_callback(device, advertisement_data):
        nonlocal last_sent_time, readings, locked_reading, last_seen

        addr = (device.address or "").upper()
        name = (device.name or advertisement_data.local_name or "")
        mfg = advertisement_data.manufacturer_data or {}
        uuids = str(advertisement_data.service_uuids or "").lower()

        is_fg260 = (addr == "A0:91:57:B2:D0:E8") or (name == "AAA006") or (41132 in mfg) or ("ffb0" in uuids)

        if is_fg260:
            raw = mfg.get(41132)
            if not raw and advertisement_data.service_data:
                raw = list(advertisement_data.service_data.values())[0] if advertisement_data.service_data else None

            if raw:
                parsed = parse_fg260_payload(raw)
                if parsed:
                    w, imp, locked = parsed
                    now = time.time()
                    last_seen = now
                    readings.append((w, imp))
                    if locked:
                        locked_reading = (w, imp)
                        logger.info(f"🔒 Insmart FG260 LOCK: {w:.2f} kg | Imp: {imp} Ohm")
                    else:
                        logger.info(f"⚖️ Insmart Signal: {w:.2f} kg | Imp: {imp} Ohm")

    scanner = BleakScanner(
        detection_callback=detection_callback,
        scanning_mode="active",
        bluez={"duplicate_data": True}
    )

    while True:
        try:
            await scanner.start()
            logger.info("🔵 Bluetooth LE Scanner läuft permanent (Active Mode + All Packets)...")
            
            while True:
                await asyncio.sleep(0.3)
                now = time.time()

                if (readings or locked_reading) and (now - last_seen > 1.0):
                    if now - last_sent_time > 6:
                        if locked_reading:
                            final_w, final_imp = locked_reading
                        else:
                            final_w = round(readings[-1][0], 2)
                            final_imp = readings[-1][1]

                        logger.info("=" * 65)
                        logger.info(f"🎯 FINALE MESSUNG FIXIERT: {final_w:.2f} kg")
                        comp = calculate_body_composition(final_w, final_imp, height_cm, age, gender)
                        logger.info(f"📊 {comp['bodyFatPct']}% KFA | {comp['muscleMassKg']} kg Muskeln | {comp['waterPct']}% Wasser | {comp['bmrKcal']} kcal BMR")
                        logger.info("=" * 65)

                        if post_measurement(app_url, comp, api_secret, user_id=user_id):
                            last_sent_time = now

                    readings.clear()
                    locked_reading = None
                    
        except Exception as e:
            logger.warning(f"⚠️ Scanner-Neustart: {e}")
            try:
                await scanner.stop()
            except Exception:
                pass
            await asyncio.sleep(2)

def main():
    parser = argparse.ArgumentParser(description="Insmart FG260 Scale Bridge")
    parser.add_argument("--app-url", default="http://192.168.178.38:3000", help="URL of App")
    parser.add_argument("--height", type=int, default=193, help="Athlete height in cm")
    parser.add_argument("--age", type=int, default=25, help="Athlete age")
    parser.add_argument("--gender", default="male", help="male/female")
    parser.add_argument("--api-secret", default=None, help="APP_API_SECRET der App (oder Env-Var HA_API_SECRET)")
    parser.add_argument("--user-id", default="local", help="User ID for the measurement")

    args = parser.parse_args()
    api_secret = args.api_secret or os.environ.get("HA_API_SECRET")
    asyncio.run(run_scale_listener(args.app_url, args.height, args.age, args.gender, api_secret, args.user_id))

if __name__ == "__main__":
    main()
