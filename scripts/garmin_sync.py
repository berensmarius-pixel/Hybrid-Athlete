#!/usr/bin/env python3
"""
Garmin Connect Sync Engine
Powered by cyberjunky/python-garminconnect (https://github.com/cyberjunky/python-garminconnect)
Provides genuine, automated sync for Garmin Forerunner 265, Edge 840 & health metrics.
"""

import sys
import os
import re
import json
import logging
import argparse
from datetime import datetime, date
from pathlib import Path

# Warnings ausschließlich auf stderr – stdout bleibt reines JSON für die API-Routen.
logger = logging.getLogger("garmin_sync")
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stderr)
    _handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.WARNING)

try:
    from garminconnect import (
        Garmin,
        GarminConnectConnectionError,
        GarminConnectAuthenticationError,
        GarminConnectTooManyRequestsError,
    )
except ImportError:
    print(json.dumps({"error": "garminconnect package not found. Run pip install garminconnect."}))
    sys.exit(1)

def _resolve_token_dir():
    """Token-Ablage außerhalb von Cloud-Sync-Ordnern (OneDrive etc.).

    Priorität:
      1. Env-Var GARMIN_TOKEN_DIR
      2. Plattform-Standard außerhalb des Repos:
         - Windows: %LOCALAPPDATA%\\hybrid-athlete\\garmin_tokens
         - macOS/Linux: ~/.local/state/hybrid-athlete/garmin_tokens
    """
    env_dir = os.environ.get("GARMIN_TOKEN_DIR")
    if env_dir:
        return os.path.abspath(env_dir)

    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return os.path.join(base, "hybrid-athlete", "garmin_tokens")

    xdg_state = os.environ.get("XDG_STATE_HOME") or os.path.join(
        os.path.expanduser("~"), ".local", "state"
    )
    return os.path.join(xdg_state, "hybrid-athlete", "garmin_tokens")


TOKEN_DIR = _resolve_token_dir()

# Einmalige Migration: altes Repo-lokales .garmin_tokens/ (lag ggf. im
# OneDrive-Sync) in das neue Verzeichnis verschieben.
_LEGACY_TOKEN_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", ".garmin_tokens"
)


def _migrate_legacy_tokens():
    try:
        legacy = os.path.abspath(_LEGACY_TOKEN_DIR)
        if (
            os.path.isdir(legacy)
            and not os.path.isdir(TOKEN_DIR)
            and any(f.endswith(".json") for f in os.listdir(legacy))
        ):
            import shutil

            shutil.move(legacy, TOKEN_DIR)
            logger.info("Garmin-Tokens migriert nach %s", TOKEN_DIR)
    except Exception as exc:
        logger.warning("Token-Migration fehlgeschlagen: %s", exc)


_migrate_legacy_tokens()


def get_garmin_client(email=None, password=None, mfa_code=None):
    os.makedirs(TOKEN_DIR, exist_ok=True)
    garmin = Garmin(email=email, password=password, is_cn=False)
    
    # 1. Try login with existing saved tokens first
    token_files = [f for f in os.listdir(TOKEN_DIR) if f.endswith(".json")] if os.path.exists(TOKEN_DIR) else []
    if token_files and not email:
        try:
            garmin.login(tokenstore=TOKEN_DIR)
            return garmin, None
        except Exception:
            pass

    if not email or not password:
        return None, "Keine Anmeldedaten und keine gespeicherten Tokens gefunden. Bitte zuerst in Garmin Connect einloggen."

    # 2. Login with credentials and save tokens to TOKEN_DIR
    try:
        garmin.login(tokenstore=TOKEN_DIR)
        try:
            garmin.garth.dump(TOKEN_DIR)
        except Exception:
            pass
        return garmin, None
    except Exception as e:
        err_msg = str(e)
        if "MFA" in err_msg or "2FA" in err_msg or "two-step" in err_msg.lower():
            return None, "MFA_REQUIRED"
        return None, err_msg


def do_login(email, password, mfa_code=None):
    os.makedirs(TOKEN_DIR, exist_ok=True)
    garmin = Garmin(email=email, password=password, is_cn=False)
    try:
        garmin.login(tokenstore=TOKEN_DIR)
        try:
            garmin.garth.dump(TOKEN_DIR)
        except Exception:
            pass
        return {
            "success": True,
            "message": "Erfolgreich mit Garmin Connect verbunden (via cyberjunky/python-garminconnect).",
        }
    except Exception as e:
        err_str = str(e)
        if "MFA" in err_str or "2FA" in err_str or "two-step" in err_str.lower():
            return {"success": False, "mfa_required": True, "error": "Zwei-Faktor-Code (MFA) erforderlich."}
        return {"success": False, "error": err_str}


def do_sync(date_str=None, email=None, password=None):
    if not date_str:
        date_str = date.today().isoformat()

    garmin, err = get_garmin_client(email, password)
    if not garmin:
        return {"success": False, "error": err or "Authentifizierung fehlgeschlagen"}

    result = {
        "success": True,
        "date": date_str,
        "syncedAt": datetime.now().isoformat(),
        "engine": "cyberjunky/python-garminconnect",
        "devices": [],
        "health": {},
        "activities": [],
    }

    # 0. Detect Connected Devices (Forerunner 265, Edge 840, etc.)
    try:
        devices = garmin.get_devices()
        for d in devices:
            d_name = d.get("productDisplayName") or d.get("displayName") or d.get("partNumber", "Garmin Device")
            result["devices"].append({
                "name": d_name,
                "partNumber": d.get("partNumber"),
                "unitId": d.get("unitId"),
            })
    except Exception:
        pass

    # 1. User Daily Summary & Stats (Active Calories, Total Calories, Steps, Floors, Distances)
    try:
        stats = garmin.get_stats(date_str)
        if stats and isinstance(stats, dict):
            active_cals = stats.get("activeKilocalories") or stats.get("wellnessActiveKilocalories") or 0
            total_cals = stats.get("totalKilocalories") or stats.get("wellnessKilocalories") or 0
            bmr_cals = stats.get("bmrKilocalories")
            
            result["health"]["activeCaloriesBurned"] = round(active_cals)
            result["health"]["totalCaloriesBurned"] = round(total_cals)
            if bmr_cals:
                result["health"]["bmrCalories"] = round(bmr_cals)
            result["health"]["steps"] = stats.get("totalSteps", 0)
            if stats.get("dailyStepGoal"):
                result["health"]["dailyStepGoal"] = int(stats.get("dailyStepGoal"))
            if stats.get("totalDistanceMeters"):
                result["health"]["totalDistanceMeters"] = round(stats.get("totalDistanceMeters"))
            if stats.get("floorsAscended"):
                result["health"]["floorsClimbed"] = round(stats.get("floorsAscended"))
            if stats.get("minHeartRate"):
                result["health"]["minHeartRate"] = int(stats.get("minHeartRate"))
            if stats.get("maxHeartRate"):
                result["health"]["maxHeartRate"] = int(stats.get("maxHeartRate"))
    except Exception:
        pass

    # 2. Resting Heart Rate (via get_rhr_day)
    try:
        rhr_data = garmin.get_rhr_day(date_str)
        metrics = rhr_data.get("allMetrics", {}).get("metricsMap", {}).get("WELLNESS_RESTING_HEART_RATE", [])
        if metrics and len(metrics) > 0:
            rhr_val = metrics[0].get("value")
            if rhr_val:
                result["health"]["restingHeartRate"] = round(rhr_val)
    except Exception:
        pass

    # 3. Training Readiness & Recovery Time
    try:
        readiness_data = garmin.get_training_readiness(date_str)
        if readiness_data:
            entry = readiness_data[-1] if isinstance(readiness_data, list) and len(readiness_data) > 0 else readiness_data
            if isinstance(entry, dict):
                score = entry.get("score") or entry.get("trainingReadinessValue") or entry.get("value")
                if score is not None:
                    result["health"]["trainingReadiness"] = int(score)
                recovery_mins = entry.get("recoveryTime")
                if recovery_mins is not None:
                    result["health"]["recoveryTimeHours"] = round(recovery_mins / 60, 1)
    except Exception:
        pass

    # 4. Body Battery & All-Day Stress
    try:
        bb_data = garmin.get_body_battery(date_str)
        if bb_data and isinstance(bb_data, list) and len(bb_data) > 0:
            last_day_entry = bb_data[-1]
            values_array = last_day_entry.get("bodyBatteryValuesArray") or []
            current_bb = None
            for item in reversed(values_array):
                if isinstance(item, list) and len(item) >= 2 and item[1] is not None:
                    current_bb = item[1]
                    break
            
            if current_bb is not None:
                result["health"]["bodyBattery"] = int(current_bb)
            elif last_day_entry.get("charged"):
                result["health"]["bodyBattery"] = int(last_day_entry.get("charged"))
            
            if last_day_entry.get("charged"):
                result["health"]["bodyBatteryCharged"] = last_day_entry.get("charged")
            if last_day_entry.get("drained"):
                result["health"]["bodyBatteryDrained"] = last_day_entry.get("drained")
    except Exception:
        pass

    # 4b. All-Day Stress Breakdown
    try:
        stress_data = garmin.get_all_day_stress(date_str)
        if stress_data and isinstance(stress_data, dict):
            if stress_data.get("avgStressLevel") is not None and stress_data.get("avgStressLevel") >= 0:
                result["health"]["avgStressLevel"] = int(stress_data.get("avgStressLevel"))
            if stress_data.get("maxStressLevel") is not None:
                result["health"]["maxStressLevel"] = int(stress_data.get("maxStressLevel"))
            if stress_data.get("restStressDuration"):
                result["health"]["stressDurationRestMinutes"] = round(stress_data.get("restStressDuration") / 60)
            if stress_data.get("lowStressDuration"):
                result["health"]["stressDurationLowMinutes"] = round(stress_data.get("lowStressDuration") / 60)
            if stress_data.get("mediumStressDuration"):
                result["health"]["stressDurationMediumMinutes"] = round(stress_data.get("mediumStressDuration") / 60)
            if stress_data.get("highStressDuration"):
                result["health"]["stressDurationHighMinutes"] = round(stress_data.get("highStressDuration") / 60)
    except Exception:
        pass

    # 5. HRV Data & RMSSD Status
    try:
        hrv_data = garmin.get_hrv_data(date_str)
        if hrv_data and isinstance(hrv_data, dict):
            status_summary = hrv_data.get("hrvSummary", {})
            status_str = str(status_summary.get("status", "")).lower()
            weekly_avg = status_summary.get("weeklyAvg")
            last_night_avg = status_summary.get("lastNightAvg")

            if weekly_avg:
                result["health"]["hrvWeeklyAvgMs"] = round(weekly_avg)
            if last_night_avg:
                result["health"]["hrvLastNightMs"] = round(last_night_avg)

            if "balanced" in status_str or "optimal" in status_str:
                result["health"]["hrvStatus"] = "balanced"
            elif "unbalanced" in status_str:
                result["health"]["hrvStatus"] = "unbalanced"
            elif "low" in status_str:
                result["health"]["hrvStatus"] = "low"
            elif "poor" in status_str:
                result["health"]["hrvStatus"] = "poor"
            else:
                if last_night_avg and last_night_avg >= 50:
                    result["health"]["hrvStatus"] = "balanced"
                elif last_night_avg and last_night_avg >= 35:
                    result["health"]["hrvStatus"] = "unbalanced"
                else:
                    result["health"]["hrvStatus"] = "balanced"
    except Exception:
        pass

    # 6. Sleep Data & Sleep Architecture
    try:
        sleep_data = garmin.get_sleep_data(date_str)
        if sleep_data and isinstance(sleep_data, dict):
            daily_sleep = sleep_data.get("dailySleepDTO", {})
            sleep_time_seconds = daily_sleep.get("sleepTimeSeconds") or 0
            sleep_score = daily_sleep.get("sleepScores", {}).get("overall", {}).get("value")
            
            if sleep_time_seconds > 0:
                result["health"]["sleepDurationHours"] = round(sleep_time_seconds / 3600, 1)
            if sleep_score is not None:
                result["health"]["sleepScore"] = int(sleep_score)
            if daily_sleep.get("deepSleepSeconds"):
                result["health"]["deepSleepSeconds"] = daily_sleep.get("deepSleepSeconds")
            if daily_sleep.get("lightSleepSeconds"):
                result["health"]["lightSleepSeconds"] = daily_sleep.get("lightSleepSeconds")
            if daily_sleep.get("remSleepSeconds"):
                result["health"]["remSleepSeconds"] = daily_sleep.get("remSleepSeconds")
            if daily_sleep.get("awakeSleepSeconds"):
                result["health"]["awakeSleepSeconds"] = daily_sleep.get("awakeSleepSeconds")
    except Exception:
        pass

    # 6b. Respiration & SpO2
    try:
        resp_data = garmin.get_respiration_data(date_str)
        if resp_data and isinstance(resp_data, dict):
            if resp_data.get("avgWakingRespirationValue"):
                result["health"]["avgWakingRespiration"] = round(resp_data.get("avgWakingRespirationValue"), 1)
            if resp_data.get("avgSleepRespirationValue"):
                result["health"]["avgSleepRespiration"] = round(resp_data.get("avgSleepRespirationValue"), 1)
    except Exception:
        pass

    try:
        spo2_data = garmin.get_spo2_data(date_str)
        if spo2_data and isinstance(spo2_data, dict):
            spo2_val = spo2_data.get("lastSevenDaysAvgSpO2") or spo2_data.get("averageSpO2") or spo2_data.get("latestSpO2")
            if spo2_val:
                result["health"]["spO2AvgPct"] = round(spo2_val, 1)
    except Exception:
        pass

    # 7. Training Status, Load Tunnel, Balance & VO2 Max
    try:
        ts = garmin.get_training_status(date_str)
        if ts and isinstance(ts, dict):
            vo2_generic = ts.get("mostRecentVO2Max", {}).get("generic", {})
            vo2_cycling = ts.get("mostRecentVO2Max", {}).get("cycling", {})
            
            if vo2_generic.get("vo2MaxValue"):
                result["health"]["vo2MaxRunning"] = round(vo2_generic.get("vo2MaxPreciseValue") or vo2_generic.get("vo2MaxValue"), 1)
            if vo2_cycling.get("vo2MaxValue"):
                result["health"]["vo2MaxCycling"] = round(vo2_cycling.get("vo2MaxPreciseValue") or vo2_cycling.get("vo2MaxValue"), 1)
            if vo2_generic.get("fitnessAge"):
                result["health"]["fitnessAge"] = int(vo2_generic.get("fitnessAge"))

            # Training Load Balance
            load_balance_map = ts.get("mostRecentTrainingLoadBalance", {}).get("metricsTrainingLoadBalanceDTOMap", {})
            for _, dev_load in load_balance_map.items():
                if dev_load.get("monthlyLoadAerobicLow") is not None:
                    result["health"]["loadLowAerobic"] = round(dev_load.get("monthlyLoadAerobicLow"))
                    result["health"]["loadLowAerobicTargetMin"] = dev_load.get("monthlyLoadAerobicLowTargetMin")
                    result["health"]["loadLowAerobicTargetMax"] = dev_load.get("monthlyLoadAerobicLowTargetMax")
                if dev_load.get("monthlyLoadAerobicHigh") is not None:
                    result["health"]["loadHighAerobic"] = round(dev_load.get("monthlyLoadAerobicHigh"))
                    result["health"]["loadHighAerobicTargetMin"] = dev_load.get("monthlyLoadAerobicHighTargetMin")
                    result["health"]["loadHighAerobicTargetMax"] = dev_load.get("monthlyLoadAerobicHighTargetMax")
                if dev_load.get("monthlyLoadAnaerobic") is not None:
                    result["health"]["loadAnaerobic"] = round(dev_load.get("monthlyLoadAnaerobic"))
                    result["health"]["loadAnaerobicTargetMin"] = dev_load.get("monthlyLoadAnaerobicTargetMin")
                    result["health"]["loadAnaerobicTargetMax"] = dev_load.get("monthlyLoadAnaerobicTargetMax")
                if dev_load.get("trainingBalanceFeedbackPhrase"):
                    result["health"]["trainingBalancePhrase"] = dev_load.get("trainingBalanceFeedbackPhrase")
                break

            # Acute / Chronic Load Tunnel
            status_map = ts.get("mostRecentTrainingStatus", {}).get("latestTrainingStatusData", {})
            for _, dev_data in status_map.items():
                acute_dto = dev_data.get("acuteTrainingLoadDTO", {})
                if acute_dto:
                    if acute_dto.get("dailyTrainingLoadAcute") is not None:
                        result["health"]["acuteTrainingLoad"] = round(acute_dto.get("dailyTrainingLoadAcute"))
                    if acute_dto.get("minTrainingLoadChronic") is not None:
                        result["health"]["minChronicLoad"] = round(acute_dto.get("minTrainingLoadChronic"))
                    if acute_dto.get("maxTrainingLoadChronic") is not None:
                        result["health"]["maxChronicLoad"] = round(acute_dto.get("maxTrainingLoadChronic"))
                    if acute_dto.get("dailyTrainingLoadChronic") is not None:
                        result["health"]["chronicLoad"] = round(acute_dto.get("dailyTrainingLoadChronic"))
                    if acute_dto.get("dailyAcuteChronicWorkloadRatio") is not None:
                        result["health"]["acwrRatio"] = round(acute_dto.get("dailyAcuteChronicWorkloadRatio"), 2)

                phrase = dev_data.get("trainingStatusFeedbackPhrase", "")
                if "PRODUCTIVE" in phrase:
                    result["health"]["trainingStatus"] = "productive"
                elif "MAINTAINING" in phrase:
                    result["health"]["trainingStatus"] = "maintaining"
                elif "RECOVERY" in phrase:
                    result["health"]["trainingStatus"] = "recovery"
                elif "UNPRODUCTIVE" in phrase:
                    result["health"]["trainingStatus"] = "unproductive"
                elif "OVERREACHING" in phrase:
                    result["health"]["trainingStatus"] = "overreaching"
                elif "PEAKING" in phrase:
                    result["health"]["trainingStatus"] = "peaking"
                break
    except Exception:
        pass

    # 8. Recent Activities from Edge 840 and Forerunner 265
    try:
        activities = garmin.get_activities(0, 15)
        for act in activities:
            type_key = act.get("activityType", {}).get("typeKey", "").lower()
            act_type = "running" if "run" in type_key else "cycling" if "cycl" in type_key or "biking" in type_key else "other"
            device_name = act.get("deviceName", "")
            device = "Edge 840" if "edge" in device_name.lower() or "840" in device_name else "Forerunner 265" if "forerunner" in device_name.lower() or "265" in device_name else "Garmin"

            result["activities"].append({
                "id": f"garmin-{act.get('activityId')}",
                "garminId": str(act.get("activityId")),
                "name": act.get("activityName", "Garmin Aktivität"),
                "type": act_type,
                "device": device,
                "startTime": act.get("startTimeLocal") or act.get("startTimeGMT"),
                "durationSeconds": round(act.get("duration", 0)),
                "distanceMeters": round(act.get("distance", 0)),
                "caloriesBurned": round(act.get("calories", 0)),
                "avgHeartRate": round(act.get("averageHR", 0)) if act.get("averageHR") else None,
                "maxHeartRate": round(act.get("maxHR", 0)) if act.get("maxHR") else None,
                "avgPowerWatts": round(act.get("avgPower", 0)) if act.get("avgPower") else None,
                "maxPowerWatts": round(act.get("maxPower", 0)) if act.get("maxPower") else None,
                "elevationGainMeters": round(act.get("elevationGain", 0)) if act.get("elevationGain") else None,
                "trainingEffectAerobic": act.get("aerobicTrainingEffect"),
                "trainingEffectAnaerobic": act.get("anaerobicTrainingEffect"),
            })
    except Exception:
        pass

    return result


# ─── Activity Detail Engine (volle Telemetrie) ───────────────────────────────

SERIES_KEY_MAP = {
    "sumElapsedDuration": "elapsedDuration",
    "directSpeed": "speedMps",
    "directTimestamp": "timestampMs",
    "directPower": "powerWatts",
    "sumDuration": "durationSeconds",
    "directLatitude": "latitude",
    "directBikeCadence": "bikeCadenceRpm",
    "directRunCadence": "runCadenceSpm",
    "directAvailableStamina": "availableStamina",
    "directPotentialStamina": "potentialStamina",
    "directElevation": "elevationMeters",
    "directLongitude": "longitude",
    "sumDistance": "distanceMeters",
    "directFractionalCadence": "fractionalCadence",
    "directHeartRate": "heartRateBpm",
    "sumMovingDuration": "movingDurationSeconds",
    "directAirTemperature": "airTemperatureC",
    "directVerticalSpeed": "verticalSpeedMps",
    "sumAccumulatedPower": "accumulatedPowerKj",
    "directPerformanceCondition": "performanceCondition",
}


def do_activity_details(activity_id, email=None, password=None):
    """
    Lädt ALLE verfügbaren Details zu einer Aktivität aus Garmin Connect:
    Voll-Summary (inkl. Zonen, VO2, Training Effects), Sekunden-Auflösung der
    Messreihen (HF/Tempo/Höhe/Leistung/Kadenz/Temperatur/Stamina), GPS-Track,
    Splits/Runden, HF-/Power-Zonenverteilung, Kraft-Übungs-Sets, Wetter, Gear.
    """
    garmin, err = get_garmin_client(email, password)
    if not garmin:
        return {"success": False, "error": err or "Authentifizierung fehlgeschlagen"}

    result = {
        "success": True,
        "activityId": str(activity_id),
        "fetchedAt": datetime.now().isoformat(),
    }

    # 1. Klassisches Summary (alle aggregierten Kennzahlen) – summaryDTO nach oben flachen
    try:
        raw = garmin.get_activity(activity_id)
        flat = {
            "activityId": raw.get("activityId"),
            "activityName": raw.get("activityName"),
            "activityTypeDTO": raw.get("activityTypeDTO"),
            "eventTypeDTO": raw.get("eventTypeDTO"),
        }
        dto = raw.get("summaryDTO") or {}
        flat.update(dto)
        result["summary"] = flat
    except Exception as e:
        logger.warning(f"summary failed: {e}")
        result["summary"] = None

    # 2. Details-Endpunkt: Messreihen in Sekundenauflösung + GPS-Polyline
    try:
        det = garmin.get_activity_details(activity_id, maxchart=2000, maxpoly=4000)

        descriptors = det.get("metricDescriptors") or []
        rows = det.get("activityDetailMetrics") or []

        idx_key = {}
        units = {}
        for d in descriptors:
            i = d.get("metricsIndex")
            raw_key = d.get("key")
            if i is None or not raw_key:
                continue
            idx_key[i] = SERIES_KEY_MAP.get(raw_key, raw_key)
            unit_obj = d.get("unit") or {}
            if unit_obj.get("key"):
                units[idx_key[i]] = unit_obj["key"]

        # Spaltenweise einsammeln (alle Serien teilen sich dieselben Indizes)
        columns = {}
        for row in rows:
            metrics = row.get("metrics")
            if not isinstance(metrics, list):
                continue
            for i, v in enumerate(metrics):
                key = idx_key.get(i)
                if not key:
                    continue
                columns.setdefault(key, []).append(v)

        # Globales Downsampling (max. 700 Samples, Index-aligniert über alle Serien)
        total = len(next(iter(columns.values()), []))
        step = 1
        if total > 700:
            step = max(1, round(total / 700))

        def sample(lst):
            return lst[::step]

        series = {}
        for key, col in columns.items():
            col_s = sample(col)
            if key == "timestampMs":
                result["timestampsMs"] = [
                    int(v) for v in col_s if isinstance(v, (int, float))
                ]
                continue
            series[key] = col_s

        # Null-Werte aus den Kurven filtern (Charts können Lücken nicht gut)
        cleaned = {}
        for key, vals in series.items():
            if any(v is None for v in vals):
                cleaned_vals = [v for v in vals if v is not None]
                if cleaned_vals:
                    cleaned[key] = cleaned_vals
            else:
                cleaned[key] = vals
        result["series"] = cleaned
        result["seriesUnits"] = units
        result["sampleStepSeconds"] = step  # Abtastintervall in Sekunden

        # GPS-Track aus geoPolylineDTO extrahieren
        geo = det.get("geoPolylineDTO") or {}
        poly = geo.get("polyline") or []
        track = []
        pstep = max(1, len(poly) // 900) if poly else 1
        for pt in poly[::pstep]:
            if isinstance(pt, dict) and pt.get("lat") is not None and pt.get("lon") is not None:
                item = {
                    "lat": round(pt["lat"], 6),
                    "lon": round(pt["lon"], 6),
                }
                if pt.get("altitude"):
                    item["alt"] = round(pt["altitude"], 1)
                track.append(item)
        if track:
            result["gpsTrack"] = track
            result["bounds"] = {
                "minLat": geo.get("minLat"),
                "maxLat": geo.get("maxLat"),
                "minLon": geo.get("minLon"),
                "maxLon": geo.get("maxLon"),
            }
    except Exception as e:
        logger.warning(f"details failed: {e}")

    # 3. Splits / Runden (km-Abschnitte mit Pace/HF/Power/Höhe)
    try:
        splits = garmin.get_activity_splits(activity_id)
        result["splits"] = (splits or {}).get("lapDTOs") or []
    except Exception as e:
        logger.warning(f"splits failed: {e}")
        result["splits"] = []

    # 4. HR Time-in-Zones
    try:
        result["hrTimeInZones"] = garmin.get_activity_hr_in_timezones(activity_id)
    except Exception as e:
        logger.warning(f"hr zones failed: {e}")
        result["hrTimeInZones"] = None

    # 5. Power Time-in-Zones
    try:
        result["powerTimeInZones"] = garmin.get_activity_power_in_timezones(activity_id)
    except Exception as e:
        logger.warning(f"power zones failed: {e}")
        result["powerTimeInZones"] = None

    # 6. Kraft-Übungs-Sets (Gym-Workouts)
    try:
        result["exerciseSets"] = garmin.get_activity_exercise_sets(activity_id)
    except Exception as e:
        logger.warning(f"exercise sets failed: {e}")
        result["exerciseSets"] = None

    # 7. Wetter während der Aktivität
    try:
        result["weather"] = garmin.get_activity_weather(activity_id)
    except Exception as e:
        logger.warning(f"weather failed: {e}")
        result["weather"] = None

    # 8. Verwendetes Equipment (Räder, Schuhe …)
    try:
        result["gear"] = garmin.get_activity_gear(activity_id)
    except Exception as e:
        logger.warning(f"gear failed: {e}")
        result["gear"] = None

    return result


# ─── Binary FIT Download (für die Background-Pipeline) ───────────────────────

def do_download_fit(activity_id, email=None, password=None):
    """
    Lädt die originale binäre .fit-Datei einer Aktivität aus Garmin Connect
    und liefert sie Base64-kodiert im JSON zurück (stdout bleibt reines JSON).
    """
    garmin, err = get_garmin_client(email, password)
    if not garmin:
        return {"success": False, "error": err or "Authentifizierung fehlgeschlagen"}

    data = None
    try:
        data = garmin.download_activity(
            activity_id, dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL
        )
    except Exception as exc_primary:
        try:
            data = garmin.download(f"/download-service/export/FIT/activity/{activity_id}")
        except Exception as exc_fallback:
            return {
                "success": False,
                "error": f"FIT-Download fehlgeschlagen: {exc_primary} / {exc_fallback}",
            }

    fit_bytes = None
    if isinstance(data, (bytes, bytearray)):
        raw = bytes(data)
        if raw[:2] == b"PK":
            import io
            import zipfile

            try:
                with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                    for name in zf.namelist():
                        if name.lower().endswith(".fit"):
                            fit_bytes = zf.read(name)
                            break
            except Exception as exc:
                return {"success": False, "error": f"ZIP-Entpacken fehlgeschlagen: {exc}"}
        elif len(raw) > 12 and raw[8:12] == b".FIT":
            fit_bytes = raw

    if not fit_bytes:
        return {"success": False, "error": "Antwort enthielt keine gültigen FIT-Daten."}

    import base64

    logger.info("FIT geladen: %d Bytes", len(fit_bytes))
    return {
        "success": True,
        "activityId": str(activity_id),
        "sizeBytes": len(fit_bytes),
        "dataBase64": base64.b64encode(fit_bytes).decode("ascii"),
    }


# ─── Garmin Workout Builder & Exercise Dictionary ────────────────────────────

GARMIN_EXERCISE_MAP = {
    # Chest
    "bankdrücken": ("BENCH_PRESS", "BARBELL_BENCH_PRESS"),
    "bench press": ("BENCH_PRESS", "BARBELL_BENCH_PRESS"),
    "langhantel bankdrücken": ("BENCH_PRESS", "BARBELL_BENCH_PRESS"),
    "langhantel-bankdrücken": ("BENCH_PRESS", "BARBELL_BENCH_PRESS"),
    "kurzhantel bankdrücken": ("BENCH_PRESS", "DUMBBELL_BENCH_PRESS"),
    "kurzhantel-bankdrücken": ("BENCH_PRESS", "DUMBBELL_BENCH_PRESS"),
    "dumbbell bench press": ("BENCH_PRESS", "DUMBBELL_BENCH_PRESS"),
    "schrägbankdrücken": ("BENCH_PRESS", "INCLINE_BARBELL_BENCH_PRESS"),
    "incline bench press": ("BENCH_PRESS", "INCLINE_BARBELL_BENCH_PRESS"),
    "incline dumbbell bench press": ("BENCH_PRESS", "INCLINE_DUMBBELL_BENCH_PRESS"),
    "schrägbankdrücken mit kurzhanteln": ("BENCH_PRESS", "INCLINE_DUMBBELL_BENCH_PRESS"),
    "dips": ("TRICEPS_EXTENSION", "BODY_WEIGHT_DIP"),
    "dip": ("TRICEPS_EXTENSION", "BODY_WEIGHT_DIP"),
    "chest dip": ("TRICEPS_EXTENSION", "BODY_WEIGHT_DIP"),
    "liegestütze": ("PUSH_UP", "PUSH_UP"),
    "push up": ("PUSH_UP", "PUSH_UP"),
    "push ups": ("PUSH_UP", "PUSH_UP"),
    "fliegende": ("FLYE", "INCLINE_DUMBBELL_FLYE"),
    "butterfly": ("FLYE", "INCLINE_DUMBBELL_FLYE"),
    "cable crossover": ("FLYE", "CABLE_CROSSOVER"),
    "kabelzug brust": ("FLYE", "CABLE_CROSSOVER"),

    # Back
    "kreuzheben": ("DEADLIFT", "BARBELL_DEADLIFT"),
    "deadlift": ("DEADLIFT", "BARBELL_DEADLIFT"),
    "rumänisches kreuzheben": ("DEADLIFT", "ROMANIAN_DEADLIFT"),
    "romanian deadlift": ("DEADLIFT", "ROMANIAN_DEADLIFT"),
    "rdl": ("DEADLIFT", "ROMANIAN_DEADLIFT"),
    "sumo kreuzheben": ("DEADLIFT", "SUMO_DEADLIFT"),
    "klimmzüge": ("PULL_UP", "PULL_UP"),
    "klimmzug": ("PULL_UP", "PULL_UP"),
    "pull up": ("PULL_UP", "PULL_UP"),
    "pull ups": ("PULL_UP", "PULL_UP"),
    "chin ups": ("PULL_UP", "CHIN_UP"),
    "chin up": ("PULL_UP", "CHIN_UP"),
    "latzug": ("PULL_UP", "LAT_PULLDOWN"),
    "latzug zur brust": ("PULL_UP", "LAT_PULLDOWN"),
    "latziehen": ("PULL_UP", "LAT_PULLDOWN"),
    "lat pulldown": ("PULL_UP", "LAT_PULLDOWN"),
    "kabel latzug": ("PULL_UP", "LAT_PULLDOWN"),
    "rudern": ("ROW", "BARBELL_ROW"),
    "langhantelrudern": ("ROW", "BARBELL_ROW"),
    "langhantel rudern": ("ROW", "BARBELL_ROW"),
    "barbell row": ("ROW", "BARBELL_ROW"),
    "kabelrudern": ("ROW", "SEATED_CABLE_ROW"),
    "cable row": ("ROW", "SEATED_CABLE_ROW"),
    "ruderzug": ("ROW", "SEATED_CABLE_ROW"),
    "kurzhantel rudern": ("ROW", "DUMBBELL_ROW"),
    "kurzhantel-rudern": ("ROW", "DUMBBELL_ROW"),
    "dumbbell row": ("ROW", "DUMBBELL_ROW"),
    "t-bar rudern": ("ROW", "T_BAR_ROW"),
    "face pulls": ("ROW", "FACE_PULL"),
    "face pull": ("ROW", "FACE_PULL"),
    "facepulls": ("ROW", "FACE_PULL"),

    # Shoulders
    "schulterdrücken": ("SHOULDER_PRESS", "OVERHEAD_BARBELL_PRESS"),
    "langhantel schulterdrücken": ("SHOULDER_PRESS", "OVERHEAD_BARBELL_PRESS"),
    "langhantel-drücken über kopf": ("SHOULDER_PRESS", "OVERHEAD_BARBELL_PRESS"),
    "overhead press": ("SHOULDER_PRESS", "OVERHEAD_BARBELL_PRESS"),
    "ohp": ("SHOULDER_PRESS", "OVERHEAD_BARBELL_PRESS"),
    "military press": ("SHOULDER_PRESS", "OVERHEAD_BARBELL_PRESS"),
    "kurzhantel schulterdrücken": ("SHOULDER_PRESS", "SEATED_DUMBBELL_SHOULDER_PRESS"),
    "schulterdrücken mit kurzhanteln": ("SHOULDER_PRESS", "SEATED_DUMBBELL_SHOULDER_PRESS"),
    "dumbbell shoulder press": ("SHOULDER_PRESS", "SEATED_DUMBBELL_SHOULDER_PRESS"),
    "arnold press": ("SHOULDER_PRESS", "ARNOLD_PRESS"),
    "seitheben": ("LATERAL_RAISE", "DUMBBELL_LATERAL_RAISE"),
    "lateral raise": ("LATERAL_RAISE", "DUMBBELL_LATERAL_RAISE"),
    "seitheben kurzhantel": ("LATERAL_RAISE", "DUMBBELL_LATERAL_RAISE"),
    "kabel seitheben": ("LATERAL_RAISE", "CABLE_LATERAL_RAISE"),
    "frontheben": ("LATERAL_RAISE", "FRONT_RAISE"),
    "front raise": ("LATERAL_RAISE", "FRONT_RAISE"),
    "reverse butterfly": ("FLYE", "INCLINE_REVERSE_FLYE"),
    "hintere schulter": ("FLYE", "INCLINE_REVERSE_FLYE"),

    # Legs
    "kniebeugen": ("SQUAT", "BARBELL_BACK_SQUAT"),
    "kniebeuge": ("SQUAT", "BARBELL_BACK_SQUAT"),
    "kniebeuge hinten mit langhantel": ("SQUAT", "BARBELL_BACK_SQUAT"),
    "squat": ("SQUAT", "BARBELL_BACK_SQUAT"),
    "back squat": ("SQUAT", "BARBELL_BACK_SQUAT"),
    "frontkniebeugen": ("SQUAT", "BARBELL_FRONT_SQUAT"),
    "front squat": ("SQUAT", "BARBELL_FRONT_SQUAT"),
    "goblet squat": ("SQUAT", "GOBLET_SQUAT"),
    "beinpresse": ("SQUAT", "LEG_PRESS"),
    "leg press": ("SQUAT", "LEG_PRESS"),
    "beinstrecker": ("LEG_CURL", "LEG_EXTENSION"),
    "leg extension": ("LEG_CURL", "LEG_EXTENSION"),
    "beinbeuger": ("LEG_CURL", "SEATED_LEG_CURL"),
    "leg curl": ("LEG_CURL", "SEATED_LEG_CURL"),
    "hamstring curl": ("LEG_CURL", "SEATED_LEG_CURL"),
    "wadenheben": ("CALF_RAISE", "STANDING_CALF_RAISE"),
    "calf raise": ("CALF_RAISE", "STANDING_CALF_RAISE"),
    "calf raises": ("CALF_RAISE", "STANDING_CALF_RAISE"),
    "ausfallschritte": ("LUNGE", "DUMBBELL_LUNGE"),
    "lunges": ("LUNGE", "DUMBBELL_LUNGE"),
    "lunge": ("LUNGE", "DUMBBELL_LUNGE"),
    "bulgarian split squat": ("LUNGE", "BULGARIAN_SPLIT_SQUAT"),
    "bulgarische kniebeuge": ("LUNGE", "BULGARIAN_SPLIT_SQUAT"),
    "hip thrust": ("HIP_RAISE", "BARBELL_HIP_THRUST_ON_FLOOR"),
    "hip thrusts": ("HIP_RAISE", "BARBELL_HIP_THRUST_ON_FLOOR"),

    # Arms
    "bizeps curls": ("CURL", "BARBELL_CURL"),
    "bizepscurls": ("CURL", "BARBELL_CURL"),
    "bicep curl": ("CURL", "BARBELL_CURL"),
    "bicep curls": ("CURL", "BARBELL_CURL"),
    "kurzhantel curls": ("CURL", "DUMBBELL_CURL"),
    "hammer curls": ("CURL", "HAMMER_CURL"),
    "hammercurls": ("CURL", "HAMMER_CURL"),
    "konzentrationscurls": ("CURL", "CONCENTRATION_CURL"),
    "trizepsdrücken": ("TRICEPS_EXTENSION", "CABLE_PUSHDOWN"),
    "tricep pushdown": ("TRICEPS_EXTENSION", "CABLE_PUSHDOWN"),
    "french press": ("TRICEPS_EXTENSION", "LYING_TRICEPS_EXTENSION"),
    "skull crusher": ("TRICEPS_EXTENSION", "LYING_TRICEPS_EXTENSION"),
    "trizeps dip": ("TRICEPS_EXTENSION", "TRICEPS_DIP"),

    # Mobility, Yoga, Pilates & Stretching (Specific Garmin Categories & Poses)
    "world's greatest stretch": ("HIP_STABILITY", "LYING_ABDUCTION_STRETCH"),
    "90/90": ("HIP_STABILITY", "LYING_ABDUCTION_STRETCH"),
    "90/90 hüftmobilisation": ("HIP_STABILITY", "LYING_ABDUCTION_STRETCH"),
    "cat-cow": ("CORE", "CAT_COW"),
    "cat cow": ("CORE", "CAT_COW"),
    "cat-cow wirbelsäulen-mobilisation": ("CORE", "CAT_COW"),
    "couch stretch": ("HIP_STABILITY", "LYING_ABDUCTION_STRETCH"),
    "couch stretch (hüftbeuger)": ("HIP_STABILITY", "LYING_ABDUCTION_STRETCH"),
    "deep squat hold": ("SQUAT", "SQUAT"),
    "deep squat": ("SQUAT", "SQUAT"),
    "thoracic spine rotation": ("CORE", "CAT_COW"),
    "sonnengruß": ("POSE", "MOUNTAIN"),
    "sonnengruß a": ("POSE", "MOUNTAIN"),
    "herabschauender hund": ("POSE", "DOWNWARD_FACING_DOG"),
    "herabschauender hund (adho mukha svanasana)": ("POSE", "DOWNWARD_FACING_DOG"),
    "krieger 1": ("POSE", "WARRIOR_ONE"),
    "krieger 2": ("POSE", "WARRIOR_TWO"),
    "krieger ii": ("POSE", "WARRIOR_TWO"),
    "krieger ii (virabhadrasana ii)": ("POSE", "WARRIOR_TWO"),
    "taube": ("POSE", "ONE_LEGGED_PIGEON"),
    "taube (eka pada rajakapotasana)": ("POSE", "ONE_LEGGED_PIGEON"),
    "kobra": ("POSE", "UP_DOG"),
    "kobra & kindeshaltung": ("POSE", "UP_DOG"),
    "kobra & kindeshaltung (bhujangasana)": ("POSE", "UP_DOG"),
    "the hundred": ("CORE", "THE_HUNDRED"),
    "single leg stretch": ("CORE", "SINGLE_LEG_STRETCH_WITH_WEIGHTS"),
    "criss-cross": ("CORE", "CRISS_CROSS"),
    "swan dive": ("CORE", "SWAN"),
    "faszienrolle": ("WARM_UP", "WARM_UP"),
    "foam rolling": ("WARM_UP", "WARM_UP"),
    "mobility": ("HIP_STABILITY", "LYING_ABDUCTION_STRETCH"),
    "stretching": ("HIP_STABILITY", "LYING_ABDUCTION_STRETCH"),
    "dehnen": ("HIP_STABILITY", "LYING_ABDUCTION_STRETCH"),
    "unterarmstütz": ("PLANK", "PLANK"),
    "unterarmstütz (plank)": ("PLANK", "PLANK"),
    "unterarmstützen": ("PLANK", "PLANK"),
    "plank": ("PLANK", "PLANK"),
    "planks": ("PLANK", "PLANK"),
    "side plank": ("PLANK", "SIDE_PLANK"),
    "seitstütz": ("PLANK", "SIDE_PLANK"),
    "pallof press": ("CORE", "CABLE_CORE_PRESS"),
    "pallof press am kabelzug": ("CORE", "CABLE_CORE_PRESS"),
    "pallof press am kabelzug / band": ("CORE", "CABLE_CORE_PRESS"),
    "pallof": ("CORE", "CABLE_CORE_PRESS"),
    "cable core press": ("CORE", "CABLE_CORE_PRESS"),
    "crunches": ("CRUNCH", "CRUNCH"),
    "crunch": ("CRUNCH", "CRUNCH"),
    "sit ups": ("SIT_UP", "SIT_UP"),
    "sit up": ("SIT_UP", "SIT_UP"),
    "beinheben": ("LEG_RAISE", "HANGING_LEG_RAISE"),
    "hanging leg raise": ("LEG_RAISE", "HANGING_LEG_RAISE"),
    "russian twist": ("CORE", "CYCLING_RUSSIAN_TWIST"),
    "ab wheel": ("CORE", "PLANK"),
    "bauchpresse": ("CRUNCH", "CRUNCH"),

    # Warmup / Mobility / Stretching
    "faszienrolle": ("WARM_UP", "WARM_UP"),
    "foam rolling": ("WARM_UP", "WARM_UP"),
    "dehnen": ("WARM_UP", "WARM_UP"),
    "stretching": ("WARM_UP", "WARM_UP"),
    "wadendehnen": ("WARM_UP", "WARM_UP"),
    "hüftbeugerdehnung": ("WARM_UP", "WARM_UP"),
    "brustdehnung": ("WARM_UP", "WARM_UP"),
}


_GARMIN_DB_CACHE = None

def get_garmin_exercises_db():
    global _GARMIN_DB_CACHE
    if _GARMIN_DB_CACHE is not None:
        return _GARMIN_DB_CACHE
    db_path = Path(__file__).resolve().parent.parent / "data" / "garmin_exercises_db.json"
    if db_path.exists():
        try:
            with open(db_path, "r", encoding="utf-8") as f:
                _GARMIN_DB_CACHE = json.load(f)
                return _GARMIN_DB_CACHE
        except Exception as e:
            logger.warning(f"Could not load garmin_exercises_db.json: {e}")
    return {}


def find_garmin_exercise(name: str):
    """
    Findet die offizielle Garmin (Category, ExerciseName) Zuordnung.
    Kombiniert eine priorisierte Schnell-Zuordnung mit der offiziellen
    Garmin-Übungsdatenbank (1.700+ Übungen inkl. DE/EN-Übersetzungen).
    """
    if not name:
        return "BENCH_PRESS", "BARBELL_BENCH_PRESS"

    clean = name.lower().strip()

    # 1. Exact or Substring Match in manual map
    sorted_keys = sorted(GARMIN_EXERCISE_MAP.keys(), key=lambda k: -len(k))
    for key in sorted_keys:
        if key == clean or key in clean or clean in key:
            return GARMIN_EXERCISE_MAP[key]

    # 2. Database lookup (1.746 offizielle Garmin-Übungen aus connect.garmin.com)
    db = get_garmin_exercises_db()
    if db:
        lookup = db.get("lookup", {})
        if clean in lookup:
            return lookup[clean]["category"], lookup[clean]["exercise"]

        exercises = db.get("exercises", [])
        # Exakter Name (DE/EN)
        for ex in exercises:
            if clean == ex.get("name_de", "").lower() or clean == ex.get("name_en", "").lower():
                return ex["category"], ex["exercise"]

        # Teil-String Treffer
        for ex in exercises:
            name_de = ex.get("name_de", "").lower()
            name_en = ex.get("name_en", "").lower()
            if (len(clean) >= 4 and (clean in name_de or clean in name_en)) or (len(name_de) >= 4 and name_de in clean):
                return ex["category"], ex["exercise"]

        # Wort-Level Match
        words = [w for w in re.split(r"[\s\-/,()]+", clean) if len(w) >= 3 and w not in ["mit", "und", "der", "die", "das", "ein", "eine", "fuer", "für", "auf", "dem", "den"]]
        for ex in exercises:
            name_de = ex.get("name_de", "").lower()
            name_en = ex.get("name_en", "").lower()
            if any(w in name_de or w in name_en for w in words):
                return ex["category"], ex["exercise"]

    # 3. Keyword fallback categories
    if any(w in clean for w in ["lat", "klimm", "pull", "zug"]):
        return "PULL_UP", "LAT_PULLDOWN"
    if any(w in clean for w in ["schulter", "shoulder", "overhead", "milit"]):
        return "SHOULDER_PRESS", "SEATED_DUMBBELL_SHOULDER_PRESS"
    if any(w in clean for w in ["seitheb", "lateral"]):
        return "LATERAL_RAISE", "DUMBBELL_LATERAL_RAISE"
    if any(w in clean for w in ["plank", "stütz", "pallof", "core", "bauch", "twist"]):
        return "PLANK", "PLANK"
    if any(w in clean for w in ["ruder", "row"]):
        return "ROW", "DUMBBELL_ROW"
    if any(w in clean for w in ["bank", "bench", "brust", "chest", "drück"]):
        return "BENCH_PRESS", "BARBELL_BENCH_PRESS"
    if any(w in clean for w in ["squat", "kniebeug", "beinpress"]):
        return "SQUAT", "BARBELL_BACK_SQUAT"
    if any(w in clean for w in ["deadlift", "kreuzheb", "rdl", "beug"]):
        return "DEADLIFT", "ROMANIAN_DEADLIFT"
    if any(w in clean for w in ["lunge", "ausfall", "split"]):
        return "LUNGE", "DUMBBELL_LUNGE"
    if any(w in clean for w in ["curl", "bizep"]):
        return "CURL", "DUMBBELL_CURL"
    if any(w in clean for w in ["trizep", "dip", "pushdown"]):
        return "TRICEPS_EXTENSION", "CABLE_PUSHDOWN"
    if any(w in clean for w in ["wade", "calf"]):
        return "CALF_RAISE", "STANDING_CALF_RAISE"
    if any(w in clean for w in ["fasz", "foam", "dehn", "stretch", "mobil"]):
        return "WARM_UP", "WARM_UP"

    return "BENCH_PRESS", "BARBELL_BENCH_PRESS"


def parse_strength_description_to_exercises(description, workout_name=""):
    """
    Parst Freitext-Trainingsbeschreibungen oder vom Nutzer gepostete Workouts
    in strukturierte Garmin-Übungssätze mit Wiederholungen, Sätzen und Pausen.
    """
    if not description:
        return []

    lines = [l.strip() for l in description.split("\n") if l.strip()]
    extracted = []

    for line in lines:
        # Filter headers or pure notes
        if re.match(r"^(warm-?up|aufwärmen|cool-?down|hinweis|ziel|pause|ernährung)\b", line, re.IGNORECASE):
            continue

        # Pattern: [Übung X:] <Name> [Sätze x Wdh] [Pause]
        # e.g. "3. Schulterdrücken mit Kurzhanteln 3 Sätze 10-12 Wdh"
        # e.g. "Übung 4: Latzug zur Brust (Lat Pulldown) 3 Sätze 8-10 Wdh Pause 1:30"
        match_sets = re.search(r"(\d+)\s*(?:Sätze|sets|x|\*)\s*(?:(?:à|je)?\s*(\d+(?:-\d+)?)\s*(?:Wdh|reps|Wiederholungen|s|Sek|Min)?)?", line, re.IGNORECASE)
        match_pause = re.search(r"Pause\s*(?:nach\s+jedem\s+Satz)?:?\s*(\d+(?::\d+)?)\s*(?:Min|s|Sek)?", line, re.IGNORECASE)

        num_sets = 3
        reps = 10
        rest_s = 90

        if match_sets:
            try:
                num_sets = int(match_sets.group(1))
            except Exception:
                num_sets = 3
            if match_sets.group(2):
                rep_str = match_sets.group(2)
                if "-" in rep_str:
                    parts = rep_str.split("-")
                    reps = round((float(parts[0]) + float(parts[1])) / 2)
                else:
                    reps = int(rep_str)

        if match_pause:
            p_str = match_pause.group(1)
            if ":" in p_str:
                m_part, s_part = p_str.split(":")
                rest_s = int(m_part) * 60 + int(s_part)
            else:
                try:
                    rest_val = float(p_str)
                    rest_s = int(rest_val * 60) if rest_val <= 5 else int(rest_val)
                except Exception:
                    rest_s = 90

        # Clean exercise name
        raw_name = line
        # Strip leading numbers / bullets
        raw_name = re.sub(r"^(?:übung\s*\d+\s*:?|\d+[\.\)]\s*|[-*•]\s*)", "", raw_name, flags=re.IGNORECASE)
        # Strip sets/reps/pause part
        raw_name = re.sub(r"\d+\s*(?:Sätze|sets|x|\*).*", "", raw_name, flags=re.IGNORECASE)
        raw_name = re.sub(r"Pause.*", "", raw_name, flags=re.IGNORECASE)
        raw_name = raw_name.strip(" :-,")

        if len(raw_name) >= 3 and not re.match(r"^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|tag\s*\d+)", raw_name, re.IGNORECASE):
            extracted.append({
                "name": raw_name,
                "sets": [{"targetReps": reps, "targetWeight": 0, "restSeconds": rest_s}] * num_sets,
            })

    return extracted


# ─── Intelligent Multi-Target Engine ─────────────────────────────────────────
# Wählt pro Schritt das optimale primäre/sekundäre Intensitäts-Ziel statt
# statischer Mappings oder Textnotizen. Spiegelt src/lib/workout/targetEngine.ts.

WORKOUT_TARGET_NO_TARGET = {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1}
WORKOUT_TARGET_POWER = {"workoutTargetTypeId": 2, "workoutTargetTypeKey": "power.zone", "displayOrder": 2}
WORKOUT_TARGET_CADENCE = {"workoutTargetTypeId": 3, "workoutTargetTypeKey": "cadence.zone", "displayOrder": 3}
WORKOUT_TARGET_HR = {"workoutTargetTypeId": 4, "workoutTargetTypeKey": "heart.rate.zone", "displayOrder": 4}
WORKOUT_TARGET_SPEED = {"workoutTargetTypeId": 5, "workoutTargetTypeKey": "speed.zone", "displayOrder": 5}
WORKOUT_TARGET_PACE = {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone", "displayOrder": 6}

HIGH_INTENSITY_CATEGORIES = {"threshold", "vo2max", "sweetspot", "overUnder", "sprint", "neuromuscular"}

DEFAULT_FTP_PCT = {
    "threshold": (0.91, 1.05),
    "sweetspot": (0.88, 0.94),
    "vo2max": (1.06, 1.20),
    "overUnder": (0.88, 1.08),
}

CATEGORY_FALLBACK_POWER_ZONE = {
    "threshold": 4,
    "sweetspot": 4,
    "vo2max": 5,
    "overUnder": 4,
    "sprint": 6,
    "neuromuscular": 6,
}

LONG_BLOCK_MIN_SECONDS = 480

CLASSIFICATION_PATTERNS = [
    ("overUnder", re.compile(r"(?:over[-\s/]?unders?\b|über-\/unterfahr|ueber-\/unterfahr|über\s*/\s*unter)", re.IGNORECASE)),
    ("vo2max", re.compile(r"(?:vo2\s*max|vo2max|\bvo2\b|zone\s*5\b|\bz5\b|maximalbereich)", re.IGNORECASE)),
    ("sweetspot", re.compile(r"(?:sweet\s*-?\s*spot|sweetspot)", re.IGNORECASE)),
    ("threshold", re.compile(r"(?:schwellen?|threshold|schwelle|ftp[-\s]?boost|zone\s*4\b|\bz4\b|kraftintervall\w*|kraftausdauer|\bsfr\b)", re.IGNORECASE)),
    ("sprint", re.compile(r"(?:sprints?\b|spurts?\b|all[-\s]?out|attacken?)", re.IGNORECASE)),
    ("neuromuscular", re.compile(r"(?:neuromuskulär\w*|neuromuscular|spin[-\s]?ups?|kadenz\s+drills?)", re.IGNORECASE)),
    ("endurance", re.compile(r"(?:grundlage|grundlagen?aushalte|ausdauer|endurance|base\s+ride|basislauf|dauerlauf|long\s+run|lange\s+ausfahrt|zone\s*2\b|\bz2\b|fettstoffwechsel)", re.IGNORECASE)),
    ("activeRecovery", re.compile(r"(?:aktive\s+(?:erholung|regeneration)|regeneration|recovery\s+ride|locker(?:es?|n)?\s+(?:kurbeln|fahren|spin)|einrollen|ausrollen|active\s+recovery)", re.IGNORECASE)),
]

LOW_CADENCE_PATTERN = re.compile(
    r"(?:sfr|kraftintervall\w*|kraftausdauer|torque|schwerek?\s+gang\w*|niedrig\w*\s+kadenz|low\s+cadence|großes?\s+blatt)",
    re.IGNORECASE,
)
HIGH_CADENCE_PATTERN = re.compile(
    r"(?:hohe?s?\s+kadenz|hoch\w*\s+kadenz|high\s+cadence|spin[-\s]?ups?|kadenz\s+drills?|neuromuskulär\w*|neuromuscular|überfrequenz)",
    re.IGNORECASE,
)
HR_GUIDANCE_PATTERN = re.compile(r"(?:hf|hr|puls|herzfrequenz|heart\s*rate|bpm)\s*[<>≤≥≈:]?\s*\d+|\d+\s*bpm", re.IGNORECASE)

FTP_PCT_PATTERN = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*(\d+(?:[.,]\d+)?))?\s*%\s*(?:von\s+|der\s+|of\s+)*(?:ftp|hf|max|vo2)",
    re.IGNORECASE,
)
CADENCE_RANGE_PATTERN = re.compile(
    r"(?:kadenz|trittfrequenz|cadence)\s*[:=]?\s*(\d{2,3})\s*(?:[-–]\s*(\d{2,3}))?"
    r"|\b(\d{2,3})\s*(?:[-–]\s*(\d{2,3}))?\s*(?:rpm|umdrehungen)",
    re.IGNORECASE,
)


def classify_intensity(text):
    t = text or ""
    for category, pattern in CLASSIFICATION_PATTERNS:
        if pattern.search(t):
            return category
    return None


def _extract_ftp_pct_range(text):
    match = FTP_PCT_PATTERN.search(text or "")
    if not match:
        return None
    low = float(match.group(1).replace(",", ".")) / 100.0
    high = float(match.group(2).replace(",", ".")) / 100.0 if match.group(2) else low
    if low <= 0:
        return None
    return (min(low, high), max(low, high))


def _extract_cadence_range(text):
    match = CADENCE_RANGE_PATTERN.search(text or "")
    if not match:
        return None
    lo_str = match.group(1) or match.group(3)
    hi_str = match.group(2) or match.group(4)
    lo = int(lo_str)
    hi = int(hi_str) if hi_str else lo + 2
    if lo < 20:
        return None
    return (lo, max(lo, hi))


def karvonen_zone_bpm(resting_hr, max_hr, low_pct, high_pct):
    hrr = max_hr - resting_hr
    return (round(resting_hr + hrr * low_pct), round(resting_hr + hrr * high_pct))


def analyze_description(description):
    desc = description or ""
    return {
        "intensity": classify_intensity(desc),
        "ftpPct": _extract_ftp_pct_range(desc),
        "cadence": _extract_cadence_range(desc),
        "highCadenceDrill": bool(HIGH_CADENCE_PATTERN.search(desc)),
        "lowCadenceTorque": bool(LOW_CADENCE_PATTERN.search(desc)),
        "hasHrGuidance": bool(HR_GUIDANCE_PATTERN.search(desc)),
    }


def resolve_step_targets(ctx, phase, duration_seconds=None, ftp=None,
                         resting_hr=None, max_hr=None, ride_focus=None, sport="cycling"):
    """Kern-Matrix: gibt (primary_target, secondary_target) zurück.
    Erzeugt immer benutzerdefinierte, präzise Zielkorridore (BPM für Laufen, Watt für Rad)."""
    resting_hr = resting_hr if isinstance(resting_hr, (int, float)) and resting_hr > 0 else 45
    max_hr = max_hr if isinstance(max_hr, (int, float)) and max_hr and max_hr > resting_hr else 188
    is_running = sport in ["running", "run"]
    is_swimming = sport in ["swimming", "swim"]

    intensity = ctx.get("intensity")
    is_structural_phase = phase in ("warmup", "cooldown", "recovery")
    is_high_intensity = (
        intensity in HIGH_INTENSITY_CATEGORIES and not is_structural_phase
    )

    primary = None
    if is_swimming:
        # Garmin Swimming Workouts: Server erfordert no.target für Schwimm-Intervalle
        primary = {
            "kind": "noTarget"
        }
    elif is_running:
        # Präzise benutzerdefinierte Herzfrequenz-Korridore nach Karvonen (HRR)
        if phase in ("warmup", "cooldown"):
            lo_bpm, hi_bpm = karvonen_zone_bpm(resting_hr, max_hr, 0.50, 0.65)
        elif phase == "recovery":
            lo_bpm, hi_bpm = karvonen_zone_bpm(resting_hr, max_hr, 0.55, 0.68)
        elif is_high_intensity:
            if intensity in ("vo2max", "sprint", "neuromuscular"):
                lo_bpm, hi_bpm = karvonen_zone_bpm(resting_hr, max_hr, 0.88, 0.96)
            elif intensity == "threshold":
                lo_bpm, hi_bpm = karvonen_zone_bpm(resting_hr, max_hr, 0.80, 0.88)
            elif intensity == "sweetspot":
                lo_bpm, hi_bpm = karvonen_zone_bpm(resting_hr, max_hr, 0.74, 0.82)
            else:
                lo_bpm, hi_bpm = karvonen_zone_bpm(resting_hr, max_hr, 0.78, 0.88)
        else:
            # GA1 / Zone 2 Grundlagenausdauer
            lo_bpm, hi_bpm = karvonen_zone_bpm(resting_hr, max_hr, 0.60, 0.72)

        primary = {
            "kind": "heartRateRange",
            "minBpm": int(lo_bpm),
            "maxBpm": int(hi_bpm),
        }
    else:
        # Präzise benutzerdefinierte Watt-Bereiche aus FTP (nur für Radfahren)
        effective_ftp = ftp if isinstance(ftp, (int, float)) and ftp > 0 else 250
        if phase in ("warmup", "cooldown"):
            primary = {
                "kind": "customPowerRange",
                "minWatts": int(round(effective_ftp * 0.50)),
                "maxWatts": int(round(effective_ftp * 0.65)),
            }
        elif phase == "recovery":
            primary = {
                "kind": "customPowerRange",
                "minWatts": int(round(effective_ftp * 0.55)),
                "maxWatts": int(round(effective_ftp * 0.68)),
            }
        elif is_high_intensity:
            pct = ctx.get("ftpPct") or DEFAULT_FTP_PCT.get(intensity, (0.91, 1.05))
            primary = {
                "kind": "customPowerRange",
                "minWatts": int(round(effective_ftp * pct[0])),
                "maxWatts": int(round(effective_ftp * pct[1])),
            }
        else:
            # GA1 / Zone 2
            primary = {
                "kind": "customPowerRange",
                "minWatts": int(round(effective_ftp * 0.65)),
                "maxWatts": int(round(effective_ftp * 0.75)),
            }

    secondary = None
    cadence = ctx.get("cadence")
    if phase == "interval":
        if cadence:
            secondary = {"kind": "cadenceRange", "minRpm": cadence[0], "maxRpm": cadence[1]}
        elif ctx.get("lowCadenceTorque"):
            secondary = {"kind": "cadenceRange", "minRpm": 55, "maxRpm": 65}
        elif ctx.get("highCadenceDrill") or intensity == "neuromuscular":
            secondary = {"kind": "cadenceRange", "minRpm": 100, "maxRpm": 110}
        elif (
            intensity in ("threshold", "sweetspot")
            and (duration_seconds or 0) >= LONG_BLOCK_MIN_SECONDS
            and primary
            and primary.get("kind") == "customPowerRange"
            and "minWatts" in primary
        ):
            lo_bpm, hi_bpm = karvonen_zone_bpm(resting_hr, max_hr, 0.80, 0.90)
            secondary = {"kind": "heartRateRange", "minBpm": lo_bpm, "maxBpm": hi_bpm}

    return primary, secondary


def target_to_garmin_fields(target, secondary=False):
    """Mappt ein internes Ziel-Dict auf Garmin ExecutableStepDTO-Felder."""
    key_type = "secondaryTargetType" if secondary else "targetType"
    key_one = "secondaryTargetValueOne" if secondary else "targetValueOne"
    key_two = "secondaryTargetValueTwo" if secondary else "targetValueTwo"
    key_zone = "secondaryTargetZone" if secondary else "zone"

    def no_target():
        out = {key_type: dict(WORKOUT_TARGET_NO_TARGET)}
        out[key_one] = None
        out[key_two] = None
        out[key_zone] = None
        if not secondary:
            out["targetValueUnit"] = None
        return out

    if not target or target.get("kind", "noTarget") == "noTarget":
        return no_target()

    kind = target.get("kind")
    if kind == "customPowerRange":
        out = {
            key_type: dict(WORKOUT_TARGET_POWER),
            key_one: target.get("minWatts"),
            key_two: target.get("maxWatts"),
            key_zone: target.get("zone"),
        }
        if not secondary:
            out["targetValueUnit"] = "watts" if "minWatts" in target else None
        return out
    if kind == "powerZone":
        z = target.get("zone")
        return {
            key_type: dict(WORKOUT_TARGET_POWER),
            key_one: float(z) if z is not None else None,
            key_two: None,
            key_zone: z,
            "zoneNumber": z,
            **({} if secondary else {"targetValueUnit": None}),
        }
    if kind == "heartRateRange":
        out = {
            key_type: dict(WORKOUT_TARGET_HR),
            key_one: target.get("minBpm"),
            key_two: target.get("maxBpm"),
            key_zone: None,
        }
        if not secondary:
            out["targetValueUnit"] = None
        return out
    if kind == "heartRateZone":
        z = target.get("zone")
        return {
            key_type: dict(WORKOUT_TARGET_HR),
            key_one: float(z) if z is not None else None,
            key_two: None,
            key_zone: z,
            "zoneNumber": z,
            **({} if secondary else {"targetValueUnit": None}),
        }
    if kind == "cadenceRange":
        out = {
            key_type: dict(WORKOUT_TARGET_CADENCE),
            key_one: target.get("minRpm"),
            key_two: target.get("maxRpm"),
            key_zone: None,
        }
        if not secondary:
            out["targetValueUnit"] = "rpm"
        return out
    return no_target()


def apply_targets(step, primary, secondary):
    step.update(target_to_garmin_fields(primary))
    step.update(target_to_garmin_fields(secondary, secondary=True))
    return step


METRIC_CLEANUP_PATTERNS = [
    re.compile(r"\d+(?:[.,]\d+)?\s*(?:[-–]\s*\d+(?:[.,]\d+)?)?\s*%\s*(?:von\s*)?(?:der\s*)?(?:ftp|hf|max\.?\s*hf|hfmax|max|vo2\w*)", re.IGNORECASE),
    re.compile(r"\d+\s*(?:[-–]\s*\d+\s*)?(?:watt)\b", re.IGNORECASE),
    re.compile(r"\d+\s*(?:[-–]\s*\d+\s*)?w(?=\s|[.,;:!?)\]]|$)", re.IGNORECASE),
    re.compile(r"\d+\s*(?:[-–]\s*\d+\s*)?(?:rpm|bpm|umdrehungen)\b", re.IGNORECASE),
    re.compile(r"(?:hf|hr|puls|herzfrequenz|heart\s*rate)\s*[<>≤≥≈:]?\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*bpm?)?", re.IGNORECASE),
    re.compile(r"(?:kadenz|trittfrequenz|cadence)\s*[:=]?\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*rpm)?", re.IGNORECASE),
    re.compile(r"\(?\s*(?:zone|gz|pulszone|leistungsklasse)\s*[1-7]\s*\)?", re.IGNORECASE),
]


def clean_description(text):
    cleaned = " {} ".format(text or "")
    for pattern in METRIC_CLEANUP_PATTERNS:
        cleaned = pattern.sub(" ", cleaned)
    cleaned = re.sub(r"\(\s*\)", " ", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+([.,;:!?])", r"\1", cleaned)
    cleaned = re.sub(r"[-\s\u2013]+\.", ".", cleaned)
    cleaned = re.sub(r"^[\s\-:;,]+", "", cleaned).strip()
    return cleaned


STEP_TYPE_IDS = {"warmup": (1, "warmup"), "cooldown": (2, "cooldown"), "interval": (3, "interval"), "recovery": (4, "recovery")}


def serialize_structured_step(item, order):
    """Serialisiert einen strukturierten Schritt (z.B. aus dem TS-Ziel-Engine)
    in ein natives Garmin ExecutableStepDTO inkl. primärer/sekundärer Ziele."""
    phase = item.get("phase") if item.get("phase") in STEP_TYPE_IDS else "interval"
    type_id, type_key = STEP_TYPE_IDS[phase]

    duration_secs = item.get("durationSeconds")
    distance_m = item.get("distanceMeters")
    if distance_m:
        end_condition = {"conditionTypeId": 3, "conditionTypeKey": "distance"}
        end_value = int(distance_m)
    else:
        end_condition = {"conditionTypeId": 2, "conditionTypeKey": "time"}
        end_value = int(duration_secs) if duration_secs else 300

    label = (item.get("label") or "").strip()
    notes = clean_description(item.get("notes") or "")
    description = "{} – {}".format(label, notes) if label and notes else (label or notes)

    step = {
        "type": "ExecutableStepDTO",
        "stepOrder": order,
        "stepType": {"stepTypeId": type_id, "stepTypeKey": type_key},
        "endCondition": end_condition,
        "endConditionValue": end_value,
        "description": description[:200],
    }
    return apply_targets(step, item.get("primaryTarget"), item.get("secondaryTarget"))


def parse_endurance_description_to_steps(description, name, total_duration_mins=45,
                                         ftp=None, resting_hr=None, max_hr=None, sport="cycling"):
    """
    Parses German/English training plan descriptions into structured Garmin workout steps:
    - Warm-up (Aufwärmen)
    - Interval Repeats (e.g. 4x 8 Min @ 95-105% FTP with 4 Min recovery)
    - Cool-down (Abwärmen)
    Jeder Schritt erhält intelligente primäre/sekundäre Ziele (Leistungsbereich in
    absoluten Watt aus FTP, HF-/Kadenz-Guardrails) statt reiner Textnotizen.
    """
    import re as _re
    desc = (description or "").strip()
    steps = []
    step_order = 1
    ctx = analyze_description(desc)
    is_running = sport in ["running", "run"]
    is_swimming = sport in ["swimming", "swim"]

    # ── Interval detection ────────────────────────────────────────────────────
    match_int = _re.search(
        r'(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|km|sek(?:unden)?|meter|m|s)?',
        desc,
        _re.IGNORECASE,
    )

    # ── Rest / recovery detection ─────────────────────────────────────────────
    def _to_seconds(val_str, unit_str):
        val = float(val_str.replace(",", "."))
        u = (unit_str or "").lower()
        if u.startswith("s"):
            return int(round(val))
        return int(round(val * 60))

    match_rest = (
        _re.search(
            r'(?:mit|nach|\+|/|,|\bund\b)\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?\s*'
            r'(?:gehpause|pause|erholung|trab|locker|rec|rest|gehen)',
            desc,
            _re.IGNORECASE,
        )
        or _re.search(
            r'(?:gehpause|pause|erholung|trab|rec|rest|gehen)\s*[::]?\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?',
            desc,
            _re.IGNORECASE,
        )
        or _re.search(
            r'(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?\s*(?:gehpause|pause|erholung|trabpause)',
            desc,
            _re.IGNORECASE,
        )
    )
    rest_secs = _to_seconds(match_rest.group(1), match_rest.group(2)) if match_rest else 120

    # ── Warm-up / Cool-down detection ─────────────────────────────────────────
    match_warmup = _re.search(
        r'(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?\s*(?:warm-?up|einlaufen|einrollen|einschwimmen|aufwärmen)',
        desc,
        _re.IGNORECASE,
    ) or _re.search(
        r'(?:warm-?up|einlaufen|einrollen|einschwimmen|aufwärmen)\s*[::]?\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?',
        desc,
        _re.IGNORECASE,
    )

    match_cooldown = _re.search(
        r'(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?\s*(?:cool-?down|auslaufen|ausrollen|ausschwimmen|abwärmen|ausgehen)',
        desc,
        _re.IGNORECASE,
    ) or _re.search(
        r'(?:cool-?down|auslaufen|ausrollen|ausschwimmen|abwärmen|ausgehen)\s*[::]?\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?',
        desc,
        _re.IGNORECASE,
    )

    if match_warmup:
        warmup_s = _to_seconds(match_warmup.group(1), match_warmup.group(2))
    else:
        warmup_s = min(600, max(300, int((total_duration_mins or 45) * 60 * 0.15)))

    if match_cooldown:
        cooldown_s = _to_seconds(match_cooldown.group(1), match_cooldown.group(2))
    else:
        cooldown_s = min(600, max(300, int((total_duration_mins or 45) * 60 * 0.15)))

    # Strukturale Easy-Steps erben KEINE Intervall-%-Vorgabe → PowerZone Z1/Z2
    easy_ctx = dict(ctx, ftpPct=None)

    def _easy_step(phase, type_id, type_key, duration, note_text):
        nonlocal step_order
        step = {
            "type": "ExecutableStepDTO",
            "stepOrder": step_order,
            "stepType": {"stepTypeId": type_id, "stepTypeKey": type_key},
            "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
            "endConditionValue": duration,
            "description": note_text,
        }
        primary, secondary = resolve_step_targets(
            easy_ctx, phase, duration, ftp=ftp, resting_hr=resting_hr, max_hr=max_hr, sport=sport
        )
        apply_targets(step, primary, secondary)
        steps.append(step)
        step_order += 1

    warmup_label = "Einschwimmen (locker)" if is_swimming else "Aufwärmen / Einlaufen (locker)" if is_running else "Aufwärmen / Einrollen (locker)"
    cooldown_label = "Ausschwimmen (locker)" if is_swimming else "Abwärmen / Auslaufen (locker)" if is_running else "Abwärmen / Ausrollen (locker)"

    if match_int:
        repeats = int(match_int.group(1))
        val = float(match_int.group(2).replace(",", "."))
        raw_unit = (match_int.group(3) or "").lower().strip()
        if not raw_unit or raw_unit in ("'", "′"):
            raw_unit = "min"
        elif raw_unit.startswith("sek"):
            raw_unit = "s"
        elif raw_unit.startswith("m") and not raw_unit.startswith("mi"):
            raw_unit = "m"
        unit = raw_unit

        # 1. Warm-up
        _easy_step("warmup", 1, "warmup", warmup_s, warmup_label)

        # 2. Wiederholungs-Gruppe (RepeatGroupDTO) mit Intervall + Pause
        interval_secs = int(val) if unit == "s" else int(val * 60) if unit == "min" else None
        if unit in ["m", "km"]:
            dist_m = int(val * 1000) if unit == "km" else int(val)
            int_step = {
                "type": "ExecutableStepDTO",
                "stepOrder": step_order + 1,
                "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
                "endCondition": {"conditionTypeId": 3, "conditionTypeKey": "distance"},
                "endConditionValue": dist_m,
                "description": clean_description(f"Intervall: {int(val)} {unit}"),
            }
            dur_for_rule = interval_secs
        else:
            dur_s = int(val) if unit == "s" else int(val * 60)
            label = f"{int(val)} s" if unit == "s" else f"{int(val)} Min"
            int_step = {
                "type": "ExecutableStepDTO",
                "stepOrder": step_order + 1,
                "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
                "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
                "endConditionValue": dur_s,
                "description": f"Intervall: {label}",
            }
            dur_for_rule = dur_s

        primary, secondary = resolve_step_targets(
            ctx, "interval", dur_for_rule,
            ftp=ftp, resting_hr=resting_hr, max_hr=max_hr, sport=sport
        )
        apply_targets(int_step, primary, secondary)

        repeat_steps = [int_step]
        if rest_secs > 0:
            rec_label = "Gehpause" if "gehen" in desc.lower() or "gehpause" in desc.lower() else "Erholung (locker)"
            rec_step = {
                "type": "ExecutableStepDTO",
                "stepOrder": step_order + 2,
                "stepType": {"stepTypeId": 4, "stepTypeKey": "recovery"},
                "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
                "endConditionValue": rest_secs,
                "description": f"{int(round(rest_secs/60))} Min {rec_label}" if rest_secs >= 60 else f"{rest_secs}s {rec_label}",
            }
            rec_primary, rec_secondary = resolve_step_targets(
                easy_ctx, "recovery", rest_secs, ftp=ftp, resting_hr=resting_hr, max_hr=max_hr, sport=sport
            )
            apply_targets(rec_step, rec_primary, rec_secondary)
            repeat_steps.append(rec_step)

        if repeats > 1:
            repeat_group = {
                "type": "RepeatGroupDTO",
                "stepOrder": step_order,
                "stepType": {"stepTypeId": 6, "stepTypeKey": "repeat", "displayOrder": 6},
                "numberOfIterations": repeats,
                "workoutSteps": repeat_steps,
                "smartRepeat": False,
            }
            steps.append(repeat_group)
            step_order += len(repeat_steps) + 1
        else:
            for s in repeat_steps:
                steps.append(s)
                step_order += 1

        # 3. Cool-down
        _easy_step("cooldown", 2, "cooldown", cooldown_s, cooldown_label)

    else:
        # Generic duration
        dur_match = _re.search(r'(\d+)(?:\s*[-–]\s*(\d+))?\s*min', desc, _re.IGNORECASE)
        total_mins = total_duration_mins or 45
        if dur_match:
            if dur_match.group(2):
                total_mins = int((int(dur_match.group(1)) + int(dur_match.group(2))) / 2)
            else:
                total_mins = int(dur_match.group(1))

        warmup_m = min(10, max(5, int(total_mins * 0.15)))
        cooldown_m = min(10, max(5, int(total_mins * 0.15)))
        main_m = max(10, total_mins - warmup_m - cooldown_m)

        _easy_step("warmup", 1, "warmup", warmup_m * 60, warmup_label)

        ride_focus = "aerobicBase" if ctx.get("hasHrGuidance") or is_running or is_swimming else "strictPower"

        step = {
            "type": "ExecutableStepDTO",
            "stepOrder": step_order,
            "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
            "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
            "endConditionValue": main_m * 60,
            "description": clean_description(desc) or name,
        }
        main_primary, main_secondary = resolve_step_targets(
            ctx, "interval", main_m * 60,
            ftp=ftp, resting_hr=resting_hr, max_hr=max_hr,
            ride_focus=ride_focus, sport=sport,
        )
        apply_targets(step, main_primary, main_secondary)
        steps.append(step)
        step_order += 1

        _easy_step("cooldown", 2, "cooldown", cooldown_m * 60, cooldown_label)

    return steps


def build_garmin_workout_payload(workout_data):
    """
    Converts internal GymTemplate / EnduranceTemplate into native Garmin Workout JSON format.
    """
    name = workout_data.get("name") or workout_data.get("title") or "Hybrid Athlete Workout"
    sport = workout_data.get("type") or workout_data.get("sport") or "gym"
    
    is_strength = sport in ["gym", "strength", "strength_training", "warmup", "stretching", "mobility", "yoga", "pilates"]
    is_running = sport in ["running", "run"]
    is_cycling = sport in ["cycling", "bike", "ride"]
    is_swimming = sport in ["swimming", "swim"]
    is_yoga = sport in ["yoga"]
    is_pilates = sport in ["pilates"]
    is_cardio = sport in ["cardio"]
    is_hiit = sport in ["hiit"]
    is_strength = sport in ["gym", "strength", "strength_training", "krafttraining", "bodybuilding", "hypertrophy"]
    is_custom_flow = sport in ["custom", "benutzerdefiniert", "other", "warmup", "mobility", "stretching", "flexibility"]
    is_bodyweight_flow = is_custom_flow or is_yoga or is_pilates or is_cardio or is_hiit

    if is_running:
        sport_type_id = 1
        sport_type_key = "running"
        sport_display_order = 1
    elif is_cycling:
        sport_type_id = 2
        sport_type_key = "cycling"
        sport_display_order = 2
    elif is_swimming:
        sport_type_id = 4
        sport_type_key = "swimming"
        sport_display_order = 3
    elif is_yoga:
        sport_type_id = 7
        sport_type_key = "yoga"
        sport_display_order = 8
    elif is_pilates:
        sport_type_id = 8
        sport_type_key = "pilates"
        sport_display_order = 9
    elif is_cardio:
        sport_type_id = 6
        sport_type_key = "cardio"
        sport_display_order = 6
    elif is_hiit:
        sport_type_id = 9
        sport_type_key = "hiit"
        sport_display_order = 7
    elif is_strength:
        sport_type_id = 5
        sport_type_key = "strength_training"
        sport_display_order = 4
    else:
        sport_type_id = 3
        sport_type_key = "other"
        sport_display_order = 13

    steps = []
    step_order = 1

    if is_bodyweight_flow:
        exercises = workout_data.get("exercises", [])
        if not exercises:
            desc_text = workout_data.get("description") or workout_data.get("details") or ""
            exercises = parse_strength_description_to_exercises(desc_text, name)

        if not exercises:
            norm_name = (name or "").lower()
            if is_yoga or any(w in norm_name for w in ["yoga", "asan", "vinyasa", "flow", "hatha"]):
                exercises = [
                    {"name": "Sonnengruß A", "sets": [{"targetDuration": 60, "restSeconds": 30}] * 3},
                    {"name": "Herabschauender Hund", "sets": [{"targetDuration": 45, "restSeconds": 30}] * 3},
                    {"name": "Krieger II", "sets": [{"targetDuration": 45, "restSeconds": 30}] * 3},
                    {"name": "Taube", "sets": [{"targetDuration": 60, "restSeconds": 30}] * 3},
                    {"name": "Kobra & Kindeshaltung", "sets": [{"targetDuration": 60, "restSeconds": 45}] * 3},
                ]
            elif is_pilates or any(w in norm_name for w in ["pilates", "hundred", "roll up"]):
                exercises = [
                    {"name": "The Hundred", "sets": [{"targetDuration": 60, "restSeconds": 30}] * 3},
                    {"name": "Single Leg Stretch", "sets": [{"targetDuration": 45, "restSeconds": 30}] * 3},
                    {"name": "Criss-Cross", "sets": [{"targetDuration": 45, "restSeconds": 30}] * 3},
                    {"name": "Swan Dive", "sets": [{"targetDuration": 45, "restSeconds": 30}] * 3},
                ]
            else:
                exercises = [
                    {"name": "Beinschwünge vor / zurück", "sets": [{"targetReps": 15, "restSeconds": 15}]},
                    {"name": "Beinschwünge zur Seite", "sets": [{"targetReps": 10, "restSeconds": 15}]},
                    {"name": "Walking Lunges mit Twist", "sets": [{"targetReps": 8, "restSeconds": 20}]},
                    {"name": "Ankel Bounces", "sets": [{"targetDuration": 30, "restSeconds": 15}]},
                    {"name": "High Knees (moderat)", "sets": [{"targetDuration": 20, "restSeconds": 15}]},
                ]

        for ex in exercises:
            ex_name = ex.get("name") or "Übung"
            sets_data = ex.get("sets", [{}])
            num_sets = max(1, len(sets_data))
            first_set = sets_data[0] if sets_data else {}
            reps = int(first_set.get("targetReps") or first_set.get("reps") or 10)
            duration_s = first_set.get("targetDuration") or first_set.get("duration")
            rest_s = int(first_set.get("restSeconds") or 15)

            is_timed = duration_s is not None and duration_s > 0
            if is_timed:
                step_desc = f"{ex_name} ({int(duration_s)}s)"
                main_step = {
                    "type": "ExecutableStepDTO",
                    "stepOrder": step_order + 1 if num_sets > 1 else step_order,
                    "stepType": {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3},
                    "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time", "displayOrder": 2, "displayable": True},
                    "endConditionValue": float(duration_s),
                    "description": step_desc,
                    "category": None,
                    "exerciseName": None,
                    "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
                }
            else:
                step_desc = f"{ex_name} ({reps} Wdh)"
                main_step = {
                    "type": "ExecutableStepDTO",
                    "stepOrder": step_order + 1 if num_sets > 1 else step_order,
                    "stepType": {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3},
                    "endCondition": {"conditionTypeId": 1, "conditionTypeKey": "lap.button", "displayOrder": 1, "displayable": True},
                    "description": step_desc,
                    "category": None,
                    "exerciseName": None,
                    "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
                }

            substeps = [main_step]
            if rest_s > 0:
                rest_step = {
                    "type": "ExecutableStepDTO",
                    "stepOrder": step_order + 2 if num_sets > 1 else step_order + 1,
                    "stepType": {"stepTypeId": 4, "stepTypeKey": "recovery", "displayOrder": 4},
                    "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time", "displayOrder": 2, "displayable": True},
                    "endConditionValue": float(rest_s),
                    "description": f"Pause ({rest_s}s)",
                    "category": None,
                    "exerciseName": None,
                    "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
                }
                substeps.append(rest_step)

            if num_sets > 1:
                rg = {
                    "type": "RepeatGroupDTO",
                    "stepOrder": step_order,
                    "stepType": {"stepTypeId": 6, "stepTypeKey": "repeat", "displayOrder": 6},
                    "numberOfIterations": num_sets,
                    "workoutSteps": substeps,
                    "smartRepeat": False,
                }
                steps.append(rg)
                step_order += len(substeps) + 1
            else:
                for st in substeps:
                    steps.append(st)
                    step_order += 1

    elif is_strength:
        exercises = workout_data.get("exercises", [])
        if not exercises:
            # 1. Try smart parsing from description / details text
            desc_text = workout_data.get("description") or workout_data.get("details") or ""
            exercises = parse_strength_description_to_exercises(desc_text, name)

        if not exercises:
            # 2. Dynamic rotational fallback based on workout name
            norm_name = (name or "").lower()
            if any(w in norm_name for w in ["push", "drück", "brust"]):
                exercises = [
                    {"name": "Bankdrücken", "sets": [{"targetReps": 8, "targetWeight": 80, "restSeconds": 120}] * 4},
                    {"name": "Schrägbankdrücken (Kurzhantel)", "sets": [{"targetReps": 10, "targetWeight": 28, "restSeconds": 90}] * 3},
                    {"name": "Schulterdrücken (Overhead Press)", "sets": [{"targetReps": 8, "targetWeight": 50, "restSeconds": 90}] * 3},
                    {"name": "Dips", "sets": [{"targetReps": 10, "targetWeight": 0, "restSeconds": 90}] * 3},
                    {"name": "Trizepsdrücken am Kabelzug", "sets": [{"targetReps": 12, "targetWeight": 30, "restSeconds": 60}] * 3},
                    {"name": "Seitheben", "sets": [{"targetReps": 15, "targetWeight": 10, "restSeconds": 60}] * 3},
                ]
            elif any(w in norm_name for w in ["pull", "zug", "rücken"]):
                exercises = [
                    {"name": "Klimmzüge", "sets": [{"targetReps": 8, "targetWeight": 0, "restSeconds": 120}] * 4},
                    {"name": "Langhantelrudern", "sets": [{"targetReps": 8, "targetWeight": 70, "restSeconds": 90}] * 4},
                    {"name": "Latzug zur Brust", "sets": [{"targetReps": 10, "targetWeight": 65, "restSeconds": 90}] * 3},
                    {"name": "Facepulls", "sets": [{"targetReps": 15, "targetWeight": 25, "restSeconds": 60}] * 3},
                    {"name": "Hammer Curls", "sets": [{"targetReps": 12, "targetWeight": 14, "restSeconds": 60}] * 3},
                ]
            elif any(w in norm_name for w in ["bein", "leg", "squat", "beine"]):
                exercises = [
                    {"name": "Kniebeugen (Barbell Squat)", "sets": [{"targetReps": 6, "targetWeight": 100, "restSeconds": 150}] * 4},
                    {"name": "Rumänisches Kreuzheben (RDL)", "sets": [{"targetReps": 8, "targetWeight": 90, "restSeconds": 120}] * 3},
                    {"name": "Bulgarian Split Squats", "sets": [{"targetReps": 10, "targetWeight": 20, "restSeconds": 90}] * 3},
                    {"name": "Beinstrecker", "sets": [{"targetReps": 12, "targetWeight": 50, "restSeconds": 60}] * 3},
                    {"name": "Beinbeuger liegend", "sets": [{"targetReps": 12, "targetWeight": 45, "restSeconds": 60}] * 3},
                    {"name": "Wadenheben stehend", "sets": [{"targetReps": 15, "targetWeight": 60, "restSeconds": 60}] * 3},
                ]
            elif any(w in norm_name for w in ["core", "bauch"]):
                exercises = [
                    {"name": "Hanging Leg Raises", "sets": [{"targetReps": 12, "targetWeight": 0, "restSeconds": 60}] * 4},
                    {"name": "Pallof Press am Kabelzug", "sets": [{"targetReps": 12, "targetWeight": 20, "restSeconds": 60}] * 3},
                    {"name": "Ab Wheel Rollouts", "sets": [{"targetReps": 10, "targetWeight": 0, "restSeconds": 60}] * 3},
                    {"name": "Unterarmstütz (Plank)", "sets": [{"targetDuration": 60, "targetReps": 1, "targetWeight": 0, "restSeconds": 45}] * 3},
                ]
            else:
                exercises = [
                    {"name": "Kniebeugen", "sets": [{"targetReps": 8, "targetWeight": 80, "restSeconds": 120}] * 3},
                    {"name": "Bankdrücken", "sets": [{"targetReps": 8, "targetWeight": 70, "restSeconds": 120}] * 3},
                    {"name": "Klimmzüge", "sets": [{"targetReps": 8, "targetWeight": 0, "restSeconds": 90}] * 3},
                    {"name": "Schulterdrücken", "sets": [{"targetReps": 10, "targetWeight": 40, "restSeconds": 90}] * 3},
                    {"name": "Rumänisches Kreuzheben", "sets": [{"targetReps": 10, "targetWeight": 70, "restSeconds": 90}] * 3},
                    {"name": "Unterarmstütz (Plank)", "sets": [{"targetDuration": 60, "targetReps": 1, "targetWeight": 0, "restSeconds": 45}] * 3},
                ]

        try:
            from garminconnect.workout import (
                create_strength_set,
                create_strength_rest_step,
                create_repeat_group,
                ExecutableStep,
                StepType,
                ConditionType,
                TargetType,
                WEIGHT_UNIT_KILOGRAM,
            )
            for ex in exercises:
                ex_name = ex.get("name") or "Übung"
                sets_data = ex.get("sets", [])
                num_sets = max(1, len(sets_data))
                first_set = sets_data[0] if sets_data else {}
                reps = int(first_set.get("targetReps") or first_set.get("reps") or 10)
                duration_s = first_set.get("targetDuration") or first_set.get("duration")
                weight = float(first_set.get("targetWeight") or first_set.get("weight") or 0.0)
                rest_s = int(first_set.get("restSeconds") or 90)

                cat, garmin_ex = find_garmin_exercise(ex_name)

                # Check if this is a timed exercise (Plank, Stütz, Dehnen, Wall Sit)
                is_timed = (
                    (duration_s is not None and duration_s > 0)
                    or cat == "PLANK"
                    or "plank" in ex_name.lower()
                    or "unterarmstütz" in ex_name.lower()
                    or "hold" in ex_name.lower()
                    or "dehn" in ex_name.lower()
                    or "stretch" in ex_name.lower()
                    or "fasz" in ex_name.lower()
                )

                if is_timed:
                    dur_val = float(duration_s if duration_s and duration_s > 0 else (reps if reps > 15 else 60))
                    extra = {"category": cat, "exerciseName": garmin_ex}
                    if weight > 0:
                        extra["weightValue"] = float(weight) * 1000.0
                        extra["weightUnit"] = dict(WEIGHT_UNIT_KILOGRAM)
                    exercise = ExecutableStep(
                        stepOrder=step_order + 1,
                        stepType={"stepTypeId": StepType.INTERVAL, "stepTypeKey": "interval", "displayOrder": 3},
                        endCondition={"conditionTypeId": ConditionType.TIME, "conditionTypeKey": "time", "displayOrder": 2, "displayable": True},
                        endConditionValue=dur_val,
                        targetType={"workoutTargetTypeId": TargetType.NO_TARGET, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
                        description=ex_name,
                        **extra,
                    )
                    rest = create_strength_rest_step(rest_s, step_order + 2)
                    rg = create_repeat_group(num_sets, [exercise, rest], step_order)
                else:
                    rg = create_strength_set(
                        category=cat,
                        step_order=step_order,
                        sets=num_sets,
                        reps=reps,
                        rest_seconds=rest_s,
                        exercise_name=garmin_ex,
                        weight_kg=weight if weight > 0 else None,
                    )
                    if hasattr(rg, "workoutSteps") and len(rg.workoutSteps) > 0:
                        setattr(rg.workoutSteps[0], "description", ex_name)

                if hasattr(rg, "model_dump"):
                    steps.append(rg.model_dump(by_alias=True))
                elif hasattr(rg, "dict"):
                    steps.append(rg.dict(by_alias=True))
                else:
                    steps.append(rg)
                step_order += 3
        except Exception as str_err:
            logger.warning(f"Error creating typed strength set: {str_err}")

    else:
        # Endurance (Running / Cycling / Swimming) structured workout
        ftp = workout_data.get("ftp")
        resting_hr = workout_data.get("restingHr")
        max_hr = workout_data.get("maxHr")

        # 1) Strukturierte Schritte aus der TS-Ziel-Engine (primär/sekundär aufgelöst)
        structured_steps = workout_data.get("steps")
        has_structured_steps = isinstance(structured_steps, list) and any(
            isinstance(s, dict) for s in structured_steps
        )

        intervals = workout_data.get("intervals", [])
        if has_structured_steps:
            for item in structured_steps:
                if not isinstance(item, dict):
                    continue
                steps.append(serialize_structured_step(item, step_order))
                step_order += 1
        elif intervals:
            for item in intervals:
                dur_secs = item.get("durationSeconds") or 300
                stype = item.get("type", "interval")
                step_key = "warmup" if stype == "warmup" else "cooldown" if stype == "cooldown" else "recovery" if stype == "recovery" else "interval"
                step_id = 1 if step_key == "warmup" else 2 if step_key == "cooldown" else 4 if step_key == "recovery" else 3

                raw_desc = item.get("description", "")
                ctx = analyze_description(raw_desc)
                primary, secondary = resolve_step_targets(
                    ctx, step_key, dur_secs,
                    ftp=ftp, resting_hr=resting_hr, max_hr=max_hr, sport=sport_type_key,
                )
                step = {
                    "type": "ExecutableStepDTO",
                    "stepOrder": step_order,
                    "stepType": {"stepTypeId": step_id, "stepTypeKey": step_key},
                    "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
                    "endConditionValue": int(dur_secs),
                    "description": clean_description(raw_desc),
                }
                apply_targets(step, primary, secondary)
                steps.append(step)
                step_order += 1
        else:
            # Smart NLP parse from description/title – mit FTP-basierten Zielen
            desc = workout_data.get("description") or workout_data.get("details") or ""
            dur_mins = workout_data.get("durationMinutes") or 45
            parsed_steps = parse_endurance_description_to_steps(
                desc, name, dur_mins,
                ftp=ftp, resting_hr=resting_hr, max_hr=max_hr,
                sport=sport_type_key,
            )
            steps.extend(parsed_steps)

    est_duration = 0
    for step in steps:
        if isinstance(step, dict):
            cond = step.get("endCondition") or {}
            if cond.get("conditionTypeKey") == "time":
                est_duration += int(step.get("endConditionValue") or 0)
            elif "workoutSteps" in step:
                reps = int(step.get("numberOfIterations") or 1)
                inner_dur = 0
                for substep in step.get("workoutSteps", []):
                    subcond = substep.get("endCondition") or {}
                    if subcond.get("conditionTypeKey") == "time":
                        inner_dur += int(substep.get("endConditionValue") or 0)
                    else:
                        inner_dur += 30
                est_duration += reps * inner_dur

    desc_text = workout_data.get("description") or workout_data.get("details")
    if not desc_text:
        if is_running:
            desc_text = "Fokus: Aerobe Grundlagenausdauer (GA1), Fettstoffwechsel-Ökonomisierung und mitochondriale Dichte bei kontrollierter Herzfrequenz."
        elif is_cycling:
            desc_text = "Fokus: Grundlagenausdauer (GA1 / Zone 2), gleichmäßige Trittökonomie und kardiovaskuläre Basis."
        elif is_swimming:
            desc_text = "Fokus: Kraul-Wasserlage, Ökonomisierung des Armzugs und aerobe Ausdauer (GA1 / CSS)."
        elif is_strength:
            desc_text = "Fokus: Gezielte Muskelhypertrophie, Kraftaufbau und Rumpfstabilität mit kontrollierter Übungsausführung."
        elif sport in ["mobility", "stretching", "yoga", "pilates"]:
            desc_text = "Fokus: Gelenkbeweglichkeit, Haltungskontrolle, aktive Faszienentlastung und Regeneration."
    if is_swimming:
        for s in steps:
            if isinstance(s, dict):
                s.setdefault("strokeType", {"strokeTypeId": 0, "strokeTypeKey": None, "displayOrder": 0})
                s.setdefault("equipmentType", {"equipmentTypeId": 0, "equipmentTypeKey": None, "displayOrder": 0})

    return {
        "sportType": {
            "sportTypeId": sport_type_id,
            "sportTypeKey": sport_type_key,
            "displayOrder": sport_display_order,
        },
        "workoutName": name,
        "description": str(desc_text)[:500],
        "estimatedDurationInSecs": int(est_duration),
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": {
                    "sportTypeId": sport_type_id,
                    "sportTypeKey": sport_type_key,
                    "displayOrder": sport_display_order,
                },
                "workoutSteps": steps,
            }
        ],
    }


def do_schedule_workout(workout_data, target_date=None, email=None, password=None):
    """
    Uploads native workout and schedules it directly on the Garmin Connect calendar.
    """
    if not target_date:
        target_date = date.today().isoformat()

    garmin, err = get_garmin_client(email, password)
    if not garmin:
        return {"success": False, "error": err or "Authentifizierung fehlgeschlagen"}

    try:
        payload = build_garmin_workout_payload(workout_data)
        
        # 1. Upload Workout to Garmin Connect
        created = garmin.upload_workout(payload)
        workout_id = created.get("workoutId") or (created.get("workout", {}).get("workoutId") if isinstance(created.get("workout"), dict) else None)
        
        if not workout_id and isinstance(created, dict):
            workout_id = created.get("id")

        if not workout_id:
            return {
                "success": False,
                "error": f"Workout hochgeladen, aber keine workoutId erhalten: {json.dumps(created)}",
            }

        # 2. Schedule Workout onto Garmin Calendar using official library method
        try:
            garmin.schedule_workout(workout_id, target_date)
        except Exception as schedule_err:
            logger.warning(f"Fallback scheduling: {schedule_err}")
            if hasattr(garmin, "client") and hasattr(garmin.client, "garth"):
                garmin.client.garth.post("workout-service", f"schedule/{workout_id}", json={"date": target_date})
            else:
                raise schedule_err

        return {
            "success": True,
            "workoutId": workout_id,
            "workoutName": payload.get("workoutName"),
            "date": target_date,
            "message": f"Workout '{payload.get('workoutName')}' erfolgreich für {target_date} im Garmin-Kalender geplant!",
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Fehler beim Planen des Garmin Workouts: {str(e)}",
        }


def do_list_workouts(email=None, password=None):
    garmin, err = get_garmin_client(email, password)
    if not garmin:
        return {"success": False, "error": err or "Authentifizierung fehlgeschlagen"}
    try:
        workouts = garmin.get_workouts()
        return {"success": True, "workouts": workouts}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _normalize_scheduled_item(it):
    """Ein Kalender-Eintrag aus get_scheduled_workouts robust auf ein flaches
    Objekt mappen – Feldnamen variieren je nach API-Version."""
    if not isinstance(it, dict):
        return None
    w = it.get("workout") if isinstance(it.get("workout"), dict) else {}
    sport = w.get("sportType")
    sport_key = sport.get("sportTypeKey") if isinstance(sport, dict) else None
    date_raw = str(it.get("date") or it.get("scheduleTime") or "")
    return {
        "scheduledWorkoutId": it.get("scheduledWorkoutId") or it.get("id"),
        "workoutId": it.get("workoutId") or w.get("workoutId"),
        "name": w.get("workoutName") or it.get("workoutName") or "",
        "date": date_raw.split("T")[0],
        "sportType": sport_key,
    }


def do_list_scheduled_workouts(email=None, password=None, year=None, month=None, months=2):
    """Liefert die Workouts, die im Garmin-KALENDER geplant sind (mit Datum).
    Deckt standardmäßig den aktuellen und den Folgemonat ab."""
    garmin, err = get_garmin_client(email, password)
    if not garmin:
        return {"success": False, "error": err or "Authentifizierung fehlgeschlagen"}
    try:
        today = date.today()
        try:
            start_y = int(year) if year else today.year
            start_m = int(month) if month else today.month
        except (TypeError, ValueError):
            start_y, start_m = today.year, today.month
        n_months = max(1, min(6, int(months) if months else 2))

        items = []
        for i in range(n_months):
            total = start_m - 1 + i
            y = start_y + total // 12
            m = total % 12 + 1
            try:
                data = garmin.get_scheduled_workouts(y, m)
            except Exception as exc:
                logger.warning("get_scheduled_workouts(%d, %d) fehlgeschlagen: %s", y, m, exc)
                continue
            raw = []
            if isinstance(data, dict):
                raw = data.get("workoutScheduleItems") or data.get("items") or []
            elif isinstance(data, list):
                raw = data
            for it in raw:
                normalized = _normalize_scheduled_item(it)
                if normalized and normalized["scheduledWorkoutId"]:
                    items.append(normalized)

        seen = set()
        unique = []
        for it in items:
            key = str(it["scheduledWorkoutId"])
            if key in seen:
                continue
            seen.add(key)
            unique.append(it)

        unique.sort(key=lambda x: x["date"])
        return {"success": True, "workouts": unique}
    except Exception as e:
        return {"success": False, "error": str(e)}


def do_unschedule_workout(scheduled_workout_id, email=None, password=None):
    """Nimmt einen geplanten Termin aus dem Garmin-Kalender
    (das Workout selbst bleibt in der Bibliothek erhalten)."""
    garmin, err = get_garmin_client(email, password)
    if not garmin:
        return {"success": False, "error": err or "Authentifizierung fehlgeschlagen"}
    try:
        garmin.unschedule_workout(scheduled_workout_id)
        return {
            "success": True,
            "scheduledWorkoutId": scheduled_workout_id,
            "message": f"Termin {scheduled_workout_id} wurde aus dem Garmin-Kalender entfernt.",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def do_delete_workout(workout_id, email=None, password=None):
    garmin, err = get_garmin_client(email, password)
    if not garmin:
        return {"success": False, "error": err or "Authentifizierung fehlgeschlagen"}
    try:
        garmin.delete_workout(workout_id)
        return {"success": True, "workoutId": workout_id, "message": f"Workout {workout_id} erfolgreich gelöscht"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Garmin Connect Sync & Native Calendar Engine")
    parser.add_argument("action", choices=["login", "sync", "status", "activity_details", "download_fit", "schedule_workout", "list_workouts", "list_scheduled_workouts", "unschedule_workout", "delete_workout"], help="Action to perform")
    parser.add_argument("--email", help="Garmin Connect Email")
    # Passwort bewusst NICHT als CLI-Argument (Prozessliste/Shell-History) –
    # ausschließlich per Umgebungsvariable GARMIN_PASSWORD.
    parser.add_argument("--mfa", help="Garmin 2FA/MFA Code")
    parser.add_argument("--date", help="Date in YYYY-MM-DD format")
    parser.add_argument("--activity-id", help="Garmin Activity ID (numeric)")
    parser.add_argument("--workout-json", help="Workout data JSON string, path to JSON file, or '-' to read JSON from stdin")
    parser.add_argument("--workout-id", help="Workout ID to delete")
    parser.add_argument("--schedule-id", help="Scheduled Workout ID (Kalender-Termin) zum Entfernen")
    parser.add_argument("--year", help="Start year for list_scheduled_workouts (default: current)")
    parser.add_argument("--month", help="Start month 1-12 for list_scheduled_workouts (default: current)")
    parser.add_argument("--months", help="How many months to fetch, 1-6 (default: 2)")

    args = parser.parse_args()

    # Credentials optional per Umgebungsvariable (sicherer als argv – nicht in
    # der Prozessliste sichtbar). Die App-Routen setzen diese Variablen.
    if not args.email:
        args.email = os.environ.get("GARMIN_EMAIL")
    args.password = getattr(args, "password", None) or os.environ.get("GARMIN_PASSWORD")
    if not args.mfa:
        args.mfa = os.environ.get("GARMIN_MFA")

    if args.action == "login":
        if not args.email or not args.password:
            print(json.dumps({"success": False, "error": "Email und Passwort erforderlich"}))
            sys.exit(1)
        res = do_login(args.email, args.password, args.mfa)
        print(json.dumps(res))

    elif args.action == "status":
        token_file = os.path.join(TOKEN_DIR, "garmin_tokens.json")
        is_connected = os.path.exists(token_file) or os.path.exists(os.path.join(TOKEN_DIR, "oauth1_token.json"))
        print(json.dumps({"connected": is_connected}))

    elif args.action == "sync":
        res = do_sync(args.date, args.email, args.password)
        print(json.dumps(res))

    elif args.action == "activity_details":
        if not args.activity_id or not args.activity_id.isdigit():
            print(json.dumps({"success": False, "error": "--activity-id (numerisch) erforderlich"}))
            sys.exit(1)
        res = do_activity_details(args.activity_id, args.email, args.password)
        print(json.dumps(res))

    elif args.action == "download_fit":
        if not args.activity_id or not args.activity_id.isdigit():
            print(json.dumps({"success": False, "error": "--activity-id (numerisch) erforderlich"}))
            sys.exit(1)
        res = do_download_fit(args.activity_id, args.email, args.password)
        print(json.dumps(res))

    elif args.action == "list_workouts":
        res = do_list_workouts(args.email, args.password)
        print(json.dumps(res))

    elif args.action == "list_scheduled_workouts":
        res = do_list_scheduled_workouts(
            args.email, args.password,
            year=args.year, month=args.month, months=args.months,
        )
        print(json.dumps(res))

    elif args.action == "unschedule_workout":
        if not args.schedule_id:
            print(json.dumps({"success": False, "error": "--schedule-id Parameter fehlt"}))
            sys.exit(1)
        if not args.schedule_id.isdigit():
            print(json.dumps({"success": False, "error": "--schedule-id muss numerisch sein"}))
            sys.exit(1)
        res = do_unschedule_workout(args.schedule_id, args.email, args.password)
        print(json.dumps(res))

    elif args.action == "delete_workout":
        if not args.workout_id:
            print(json.dumps({"success": False, "error": "--workout-id Parameter fehlt"}))
            sys.exit(1)
        res = do_delete_workout(args.workout_id, args.email, args.password)
        print(json.dumps(res))

    elif args.action == "schedule_workout":
        if not args.workout_json:
            print(json.dumps({"success": False, "error": "--workout-json Parameter fehlt"}))
            sys.exit(1)

        # '-' → JSON von stdin lesen (umgeht Windows-argv-Limit ~32k Zeichen)
        raw_json = args.workout_json
        if raw_json == "-":
            raw_json = sys.stdin.read()

        if os.path.exists(raw_json):
            with open(raw_json, "r", encoding="utf-8") as f:
                workout_data = json.load(f)
        else:
            try:
                workout_data = json.loads(raw_json)
            except json.JSONDecodeError as err:
                print(json.dumps({"success": False, "error": f"Ungültiges JSON: {str(err)}"}))
                sys.exit(1)

        res = do_schedule_workout(workout_data, args.date, args.email, args.password)
        print(json.dumps(res))


if __name__ == "__main__":
    main()

