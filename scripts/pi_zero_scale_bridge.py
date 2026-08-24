#!/usr/bin/env python3
"""
Hybrid Athlete - Insmart / Fitdays Raspberry Pi Zero 2W Bluetooth Scale Bridge
-----------------------------------------------------------------------------
Listens 24/7 for your Insmart / Fitdays BLE smart scale.
Whenever you step on the scale, it captures the weight & body composition
and posts it directly to your Hybrid Athlete application!

Installation on Raspberry Pi Zero 2W:
    pip install bleak urllib3

Usage:
    python pi_zero_scale_bridge.py --app-url http://192.168.178.50:3000
"""

import asyncio
import argparse
import json
import logging
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
logger = logging.getLogger("ScaleBridge")

# Known Scale Name prefixes
SCALE_PREFIXES = ("Insmart", "Fitdays", "ICOMON", "Scale", "Health", "Chipsea", "Body")

def calculate_body_composition(weight_kg, impedance_ohms, height_cm=180, age=26, gender="male"):
    """Calculate full BIA body composition metrics from weight and resistance"""
    height_m = height_cm / 100.0
    bmi = round(weight_kg / (height_m * height_m), 1)
    is_male = (gender.lower() == "male")
    
    impedance = impedance_ohms if (100 < impedance_ohms < 1500) else 520
    height_sq_over_r = (height_cm * height_cm) / impedance

    # Lukaski & Deurenberg BIA equation
    if is_male:
        lean_mass = 0.485 * height_sq_over_r + 0.338 * weight_kg + 5.32
    else:
        lean_mass = 0.476 * height_sq_over_r + 0.295 * weight_kg + 5.49

    lean_mass = min(weight_kg * 0.92, max(weight_kg * 0.60, lean_mass))
    fat_mass = max(0.0, weight_kg - lean_mass)
    body_fat_pct = round((fat_mass / weight_kg) * 100.0, 1)

    muscle_mass_kg = round(lean_mass * 0.74, 1)
    muscle_mass_pct = round((muscle_mass_kg / weight_kg) * 100.0, 1)
    water_kg = lean_mass * 0.73
    water_pct = round((water_kg / weight_kg) * 100.0, 1)

    bone_mass_kg = round(lean_mass * 0.055 if is_male else lean_mass * 0.048, 1)
    base_visceral = (bmi - 18.5) * 0.6 + (body_fat_pct - 10.0) * 0.25
    visceral_fat = max(1, min(15, int(round(base_visceral))))
    
    bmr_kcal = int(round(10 * weight_kg + 6.25 * height_cm - 5 * age + (5 if is_male else -161)))

    return {
        "weight": round(weight_kg, 1),
        "bmi": bmi,
        "bodyFatPct": body_fat_pct,
        "muscleMassKg": muscle_mass_kg,
        "muscleMassPct": muscle_mass_pct,
        "waterPct": water_pct,
        "boneMassKg": bone_mass_kg,
        "visceralFat": visceral_fat,
        "bmrKcal": bmr_kcal,
        "source": "Raspberry Pi Zero 2W",
    }

def post_measurement(app_url, data):
    """Send measurement to Hybrid Athlete Webhook"""
    url = f"{app_url.rstrip('/')}/api/scale/webhook"
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            resp_body = response.read().decode("utf-8")
            logger.info(f"✅ Messung erfolgreich an App gesendet: {resp_body}")
            return True
    except Exception as e:
        logger.error(f"❌ Fehler beim Senden an {url}: {e}")
        return False

def parse_scale_payload(manufacturer_data, service_data):
    """Extract weight & impedance from raw BLE advertisement packets"""
    raw_bytes = None
    
    # Check manufacturer data
    if manufacturer_data:
        for k, v in manufacturer_data.items():
            if len(v) >= 5:
                raw_bytes = v
                break

    # Check service data if manufacturer data not present
    if not raw_bytes and service_data:
        for k, v in service_data.items():
            if len(v) >= 5:
                raw_bytes = v
                break

    if not raw_bytes or len(raw_bytes) < 4:
        return None

    # Insmart / Icomon / Chipsea protocol parser
    byte0 = raw_bytes[0]
    weight_kg = 0.0
    impedance = 520
    is_stabilized = False

    # Format 1: 0xCF or 0xFF or 0xFD
    if byte0 in (0xCF, 0xFF, 0xFD) and len(raw_bytes) >= 5:
        raw_w = (raw_bytes[2] << 8) | raw_bytes[3]
        weight_kg = raw_w / 100.0
        status_byte = raw_bytes[4]
        is_stabilized = (status_byte & 0x01 == 1) or (status_byte & 0x10 != 0) or weight_kg > 20
        if len(raw_bytes) >= 7:
            raw_imp = (raw_bytes[5] << 8) | raw_bytes[6]
            if 100 < raw_imp < 2000:
                impedance = raw_imp
    else:
        # Standard GATT payload
        raw_w = raw_bytes[1] | (raw_bytes[2] << 8)
        weight_kg = raw_w * 0.005
        is_stabilized = True

    if 30.0 < weight_kg < 250.0 and is_stabilized:
        return weight_kg, impedance

    return None

async def run_scale_listener(app_url, height_cm, age, gender):
    logger.info("=" * 65)
    logger.info("🚀 Hybrid Athlete - Raspberry Pi Zero 2W Scale Bridge aktiv")
    logger.info(f"📍 Ziel-App URL: {app_url}/api/scale/webhook")
    logger.info(f"👤 Profil: {height_cm} cm | {age} Jahre | {gender}")
    logger.info("📡 Warte auf Messung der Insmart-Waage (einfach draufstellen)...")
    logger.info("=" * 65)

    last_sent_time = 0
    last_sent_weight = 0.0

    def detection_callback(device, advertisement_data):
        nonlocal last_sent_time, last_sent_weight

        dev_name = device.name or advertisement_data.local_name or ""
        is_scale = any(dev_name.startswith(p) for p in SCALE_PREFIXES)

        # Also inspect advertisement raw data even if name is omitted
        parsed = parse_scale_payload(
            advertisement_data.manufacturer_data,
            advertisement_data.service_data
        )

        if parsed:
            weight_kg, impedance = parsed
            now = time.time()

            # Debounce duplicate transmissions within 15 seconds
            if (now - last_sent_time > 15) or (abs(weight_kg - last_sent_weight) > 1.0):
                logger.info(f"⚖️ Waage erkannt ({dev_name or device.address}): {weight_kg} kg | Impedanz: {impedance} Ohm")
                comp = calculate_body_composition(weight_kg, impedance, height_cm, age, gender)
                logger.info(f"📊 Berechnet: {comp['bodyFatPct']}% KFA | {comp['muscleMassKg']} kg Muskelmasse | {comp['waterPct']}% Wasser")
                
                success = post_measurement(app_url, comp)
                if success:
                    last_sent_time = now
                    last_sent_weight = weight_kg

    scanner = BleakScanner(detection_callback=detection_callback)
    
    while True:
        try:
            await scanner.start()
            logger.info("🔵 Bluetooth LE Scanning läuft permanent...")
            while True:
                await asyncio.sleep(3600)
        except Exception as e:
            logger.warning(f"⚠️ Scanner-Fehler / Neustart in 5 Sekunden: {e}")
            try:
                await scanner.stop()
            except Exception:
                pass
            await asyncio.sleep(5)

def main():
    parser = argparse.ArgumentParser(description="Insmart / Fitdays Raspberry Pi Zero 2W Scale Bridge")
    parser.add_argument("--app-url", default="http://localhost:3000", help="URL of Hybrid Athlete Next.js app")
    parser.add_argument("--height", type=int, default=180, help="Athlete height in cm")
    parser.add_argument("--age", type=int, default=26, help="Athlete age")
    parser.add_argument("--gender", default="male", help="Athlete gender (male/female)")

    args = parser.parse_args()
    asyncio.run(run_scale_listener(args.app_url, args.height, args.age, args.gender))

if __name__ == "__main__":
    main()
