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
    "kurzhantel bankdrücken": ("BENCH_PRESS", "DUMBBELL_BENCH_PRESS"),
    "dumbbell bench press": ("BENCH_PRESS", "DUMBBELL_BENCH_PRESS"),
    "schrägbankdrücken": ("BENCH_PRESS", "INCLINE_BARBELL_BENCH_PRESS"),
    "incline bench press": ("BENCH_PRESS", "INCLINE_BARBELL_BENCH_PRESS"),
    "dips": ("TRICEPS_EXTENSION", "BODY_WEIGHT_DIP"),
    "dip": ("TRICEPS_EXTENSION", "BODY_WEIGHT_DIP"),
    "chest dip": ("TRICEPS_EXTENSION", "BODY_WEIGHT_DIP"),
    "liegestütze": ("PUSH_UP", "PUSH_UP"),
    "push up": ("PUSH_UP", "PUSH_UP"),
    "push ups": ("PUSH_UP", "PUSH_UP"),
    "fliegende": ("FLYE", "INCLINE_DUMBBELL_FLYE"),
    "butterfly": ("FLYE", "INCLINE_DUMBBELL_FLYE"),
    "cable crossover": ("FLYE", "CABLE_CROSSOVER"),

    # Back
    "kreuzheben": ("DEADLIFT", "BARBELL_DEADLIFT"),
    "deadlift": ("DEADLIFT", "BARBELL_DEADLIFT"),
    "rumänisches kreuzheben": ("DEADLIFT", "ROMANIAN_DEADLIFT"),
    "romanian deadlift": ("DEADLIFT", "ROMANIAN_DEADLIFT"),
    "sumo kreuzheben": ("DEADLIFT", "SUMO_DEADLIFT"),
    "klimmzüge": ("PULL_UP", "PULL_UP"),
    "pull up": ("PULL_UP", "PULL_UP"),
    "pull ups": ("PULL_UP", "PULL_UP"),
    "chin ups": ("PULL_UP", "CHIN_UP"),
    "latziehen": ("PULL_UP", "LAT_PULLDOWN"),
    "lat pulldown": ("PULL_UP", "LAT_PULLDOWN"),
    "rudern": ("ROW", "BARBELL_ROW"),
    "langhantelrudern": ("ROW", "BARBELL_ROW"),
    "barbell row": ("ROW", "BARBELL_ROW"),
    "kabelrudern": ("ROW", "SEATED_CABLE_ROW"),
    "cable row": ("ROW", "SEATED_CABLE_ROW"),
    "kurzhantel rudern": ("ROW", "DUMBBELL_ROW"),
    "dumbbell row": ("ROW", "DUMBBELL_ROW"),
    "t-bar rudern": ("ROW", "T_BAR_ROW"),
    "face pulls": ("ROW", "FACE_PULL"),
    "face pull": ("ROW", "FACE_PULL"),

    # Shoulders
    "schulterdrücken": ("SHOULDER_PRESS", "OVERHEAD_BARBELL_PRESS"),
    "overhead press": ("SHOULDER_PRESS", "OVERHEAD_BARBELL_PRESS"),
    "military press": ("SHOULDER_PRESS", "OVERHEAD_BARBELL_PRESS"),
    "kurzhantel schulterdrücken": ("SHOULDER_PRESS", "SEATED_DUMBBELL_SHOULDER_PRESS"),
    "arnold press": ("SHOULDER_PRESS", "ARNOLD_PRESS"),
    "seitheben": ("LATERAL_RAISE", "DUMBBELL_LATERAL_RAISE"),
    "lateral raise": ("LATERAL_RAISE", "DUMBBELL_LATERAL_RAISE"),
    "kabel seitheben": ("LATERAL_RAISE", "CABLE_LATERAL_RAISE"),
    "frontheben": ("LATERAL_RAISE", "FRONT_RAISE"),
    "front raise": ("LATERAL_RAISE", "FRONT_RAISE"),
    "reverse butterfly": ("FLYE", "INCLINE_REVERSE_FLYE"),

    # Legs
    "kniebeugen": ("SQUAT", "BARBELL_BACK_SQUAT"),
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
    "wadenheben": ("CALF_RAISE", "STANDING_CALF_RAISE"),
    "calf raise": ("CALF_RAISE", "STANDING_CALF_RAISE"),
    "ausfallschritte": ("LUNGE", "DUMBBELL_LUNGE"),
    "lunges": ("LUNGE", "DUMBBELL_LUNGE"),
    "bulgarian split squat": ("LUNGE", "BULGARIAN_SPLIT_SQUAT"),
    "hip thrust": ("HIP_RAISE", "BARBELL_HIP_THRUST_ON_FLOOR"),
    "hip thrusts": ("HIP_RAISE", "BARBELL_HIP_THRUST_ON_FLOOR"),

    # Arms
    "bizeps curls": ("CURL", "BARBELL_CURL"),
    "bicep curl": ("CURL", "BARBELL_CURL"),
    "bicep curls": ("CURL", "BARBELL_CURL"),
    "hammer curls": ("CURL", "HAMMER_CURL"),
    "konzentrationscurls": ("CURL", "CONCENTRATION_CURL"),
    "trizepsdrücken": ("TRICEPS_EXTENSION", "CABLE_PUSHDOWN"),
    "tricep pushdown": ("TRICEPS_EXTENSION", "CABLE_PUSHDOWN"),
    "french press": ("TRICEPS_EXTENSION", "LYING_TRICEPS_EXTENSION"),
    "skull crusher": ("TRICEPS_EXTENSION", "LYING_TRICEPS_EXTENSION"),
    "trizeps dip": ("TRICEPS_EXTENSION", "TRICEPS_DIP"),

    # Core / Warmup
    "plank": ("PLANK", "PLANK"),
    "side plank": ("PLANK", "SIDE_PLANK"),
    "crunches": ("CRUNCH", "CRUNCH"),
    "sit ups": ("SIT_UP", "SIT_UP"),
    "beinheben": ("LEG_RAISE", "HANGING_LEG_RAISE"),
    "hanging leg raise": ("LEG_RAISE", "HANGING_LEG_RAISE"),
    "russian twist": ("CORE", "CYCLING_RUSSIAN_TWIST"),
}


def find_garmin_exercise(name):
    norm = name.strip().lower()
    for key, (cat, ex_name) in GARMIN_EXERCISE_MAP.items():
        if key in norm or norm in key:
            return cat, ex_name
    return "BENCH_PRESS", "BENCH_PRESS"


# ─── Intelligent Multi-Target Engine ─────────────────────────────────────────
# Wählt pro Schritt das optimale primäre/sekundäre Intensitäts-Ziel statt
# statischer Mappings oder Textnotizen. Spiegelt src/lib/workout/targetEngine.ts.

WORKOUT_TARGET_NO_TARGET = {"workoutTargetTypeId": 0, "workoutTargetTypeKey": "no.target"}
WORKOUT_TARGET_POWER = {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "power.zone"}
WORKOUT_TARGET_HR = {"workoutTargetTypeId": 2, "workoutTargetTypeKey": "heart.rate.zone"}
WORKOUT_TARGET_CADENCE = {"workoutTargetTypeId": 4, "workoutTargetTypeKey": "cadence.zone"}

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
                         resting_hr=None, max_hr=None, ride_focus=None):
    """Kern-Matrix: gibt (primary_target, secondary_target) zurück.
    Wire-Format identisch zu TS StepTarget ({kind, minWatts…}) oder None."""
    resting_hr = resting_hr if isinstance(resting_hr, (int, float)) and resting_hr > 0 else 42
    max_hr = max_hr if isinstance(max_hr, (int, float)) and max_hr and max_hr > resting_hr else 190
    ftp = ftp if isinstance(ftp, (int, float)) and ftp > 0 else None

    intensity = ctx.get("intensity")
    is_structural_phase = phase in ("warmup", "cooldown", "recovery")
    is_easy_phase = is_structural_phase or intensity in (
        "activeRecovery", "recovery", "warmup", "cooldown"
    )
    is_high_intensity = (
        intensity in HIGH_INTENSITY_CATEGORIES and not is_structural_phase
    )

    primary = None
    if is_high_intensity:
        pct = ctx.get("ftpPct")
        if pct and ftp:
            primary = {
                "kind": "customPowerRange",
                "minWatts": int(round(ftp * pct[0])),
                "maxWatts": int(round(ftp * pct[1])),
            }
        elif intensity in DEFAULT_FTP_PCT and ftp:
            lo, hi = DEFAULT_FTP_PCT[intensity]
            primary = {
                "kind": "customPowerRange",
                "minWatts": int(round(ftp * lo)),
                "maxWatts": int(round(ftp * hi)),
                "zone": CATEGORY_FALLBACK_POWER_ZONE[intensity],
            }
        else:
            zone = CATEGORY_FALLBACK_POWER_ZONE.get(intensity)
            primary = {"kind": "customPowerRange", "zone": zone} if zone else {"kind": "noTarget"}
    elif is_easy_phase:
        pct = ctx.get("ftpPct")
        if pct and ftp:
            primary = {
                "kind": "customPowerRange",
                "minWatts": int(round(ftp * pct[0])),
                "maxWatts": int(round(ftp * pct[1])),
            }
        else:
            primary = {"kind": "powerZone", "zone": 2 if intensity == "activeRecovery" else 1}
    else:
        if ride_focus == "aerobicBase" or (ride_focus is None and ctx.get("hasHrGuidance")):
            primary = {"kind": "heartRateZone", "zone": 2}
        else:
            primary = {"kind": "powerZone", "zone": 2}

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
        return {key_type: dict(WORKOUT_TARGET_POWER), key_one: None, key_two: None,
                key_zone: target.get("zone"), **({} if secondary else {"targetValueUnit": None})}
    if kind == "heartRateRange":
        out = {
            key_type: dict(WORKOUT_TARGET_HR),
            key_one: target.get("minBpm"),
            key_two: target.get("maxBpm"),
            key_zone: None,
        }
        if not secondary:
            out["targetValueUnit"] = "bpm"
        return out
    if kind == "heartRateZone":
        return {key_type: dict(WORKOUT_TARGET_HR), key_one: None, key_two: None,
                key_zone: target.get("zone"), **({} if secondary else {"targetValueUnit": None})}
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
                                         ftp=None, resting_hr=None, max_hr=None):
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

    # ── Interval detection ────────────────────────────────────────────────────
    # Supported formats:
    #   "4x8 Min" / "4 x 8 Minuten" / "4×8min" / "6 X 2 MIN"
    #   "4x 1000m" / "5×1km" / "8x400 Meter"
    #   "4x5'" / "10x30s" / "6x90 Sek"
    match_int = _re.search(
        r'(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|km|sek(?:unden)?|meter|m|s)?',
        desc,
        _re.IGNORECASE,
    )

    # ── Rest / recovery detection (strict – avoids false positives) ───────────
    def _to_seconds(val_str, unit_str):
        val = float(val_str.replace(",", "."))
        u = (unit_str or "").lower()
        if u.startswith("s"):
            return int(round(val))
        return int(round(val * 60))

    rest_secs = 240  # default 4 min
    match_rest = (
        _re.search(
            r'(?:mit|nach|\+|/)\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?\s*'
            r'(?:pause|erholung|trab|locker|rec|rest)',
            desc,
            _re.IGNORECASE,
        )
        or _re.search(
            r'(?:pause|erholung|trab|rec|rest)\s*[::]?\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?',
            desc,
            _re.IGNORECASE,
        )
    )
    if match_rest:
        rest_secs = _to_seconds(match_rest.group(1), match_rest.group(2))

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
            easy_ctx, phase, duration, ftp=ftp, resting_hr=resting_hr, max_hr=max_hr
        )
        apply_targets(step, primary, secondary)
        steps.append(step)
        step_order += 1

    if match_int:
        repeats = int(match_int.group(1))
        val = float(match_int.group(2).replace(",", "."))
        raw_unit = (match_int.group(3) or "").lower().strip()
        if not raw_unit:
            raw_unit = "min"
        elif raw_unit in ("'", "′"):
            raw_unit = "min"
        elif raw_unit.startswith("sek"):
            raw_unit = "s"
        elif raw_unit.startswith("m") and not raw_unit.startswith("mi"):
            raw_unit = "m"
        unit = raw_unit

        total_secs = int((total_duration_mins or 45) * 60)
        est_workout = 600 + repeats * ((val * 60 if unit in ("min",) else val if unit == "s" else 0) + rest_secs)
        warmup_s = 600
        cooldown_s = 600
        if total_secs > est_workout:
            extra = total_secs - est_workout
            warmup_s += int(extra * 0.5)
            cooldown_s += int(extra * 0.5)

        # 1. Warm-up
        _easy_step("warmup", 1, "warmup", warmup_s, "Aufwärmen / Einrollen (locker)")

        # 2. Intervalle mit intelligenten Zielen
        interval_secs = int(val) if unit == "s" else int(val * 60) if unit == "min" else None
        for i in range(1, repeats + 1):
            if unit in ["m", "km"]:
                dist_m = int(val * 1000) if unit == "km" else int(val)
                step = {
                    "type": "ExecutableStepDTO",
                    "stepOrder": step_order,
                    "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
                    "endCondition": {"conditionTypeId": 3, "conditionTypeKey": "distance"},
                    "endConditionValue": dist_m,
                    "description": clean_description(f"Intervall {i}/{repeats}"),
                }
                dur_for_rule = interval_secs
            else:
                dur_s = int(val) if unit == "s" else int(val * 60)
                label = f"{int(val)} s" if unit == "s" else f"{int(val)} Min"
                step = {
                    "type": "ExecutableStepDTO",
                    "stepOrder": step_order,
                    "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
                    "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
                    "endConditionValue": dur_s,
                    "description": f"Intervall {i}/{repeats}: {label}",
                }
                dur_for_rule = dur_s

            primary, secondary = resolve_step_targets(
                ctx, "interval", dur_for_rule,
                ftp=ftp, resting_hr=resting_hr, max_hr=max_hr,
            )
            apply_targets(step, primary, secondary)
            steps.append(step)
            step_order += 1

            if rest_secs > 0:
                _easy_step("recovery", 4, "recovery", rest_secs, f"Erholung {i}/{repeats} (locker)")

        # 3. Cool-down
        _easy_step("cooldown", 2, "cooldown", cooldown_s, "Abwärmen / Ausrollen (locker)")

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

        _easy_step("warmup", 1, "warmup", warmup_m * 60, "Einrollen / Aufwärmen")

        # Hauptteil: Klassifikation entscheidet (Endurance → PowerZone/HeartRateZone
        # je nach Fokus, Active Recovery → Z2 bzw. %-Range, High-Intensity → Watt-Range)
        ride_focus = "aerobicBase" if ctx.get("hasHrGuidance") else "strictPower"

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
            ride_focus=ride_focus,
        )
        apply_targets(step, main_primary, main_secondary)
        steps.append(step)
        step_order += 1

        _easy_step("cooldown", 2, "cooldown", cooldown_m * 60, "Ausrollen / Abwärmen")

    return steps


def build_garmin_workout_payload(workout_data):
    """
    Converts internal GymTemplate / EnduranceTemplate into native Garmin Workout JSON format.
    """
    name = workout_data.get("name") or workout_data.get("title") or "Hybrid Athlete Workout"
    sport = workout_data.get("type") or workout_data.get("sport") or "gym"
    
    is_strength = sport in ["gym", "strength", "strength_training", "warmup", "stretching", "mobility"]
    is_running = sport in ["running", "run"]
    is_cycling = sport in ["cycling", "bike", "ride"]

    if is_running:
        sport_type_id = 1
        sport_type_key = "running"
    elif is_cycling:
        sport_type_id = 2
        sport_type_key = "cycling"
    else:
        sport_type_id = 5
        sport_type_key = "strength_training"

    steps = []
    step_order = 1

    if is_strength:
        exercises = workout_data.get("exercises", [])
        if not exercises:
            # Fallback exercises from description or general full body
            exercises = [
                {"name": "Bankdrücken", "sets": [{"targetReps": 8, "targetWeight": 0, "restSeconds": 90}] * 3},
                {"name": "Klimmzüge", "sets": [{"targetReps": 8, "targetWeight": 0, "restSeconds": 90}] * 3},
                {"name": "Schulterdrücken", "sets": [{"targetReps": 10, "targetWeight": 0, "restSeconds": 90}] * 3},
                {"name": "Kniebeugen", "sets": [{"targetReps": 8, "targetWeight": 0, "restSeconds": 120}] * 3},
            ]

        try:
            from garminconnect.workout import create_strength_set
            for ex in exercises:
                ex_name = ex.get("name", "Übung")
                cat, garmin_ex = find_garmin_exercise(ex_name)
                sets = ex.get("sets", [])
                
                num_sets = len(sets) if sets else 3
                first_set = sets[0] if sets else {}
                reps = int(first_set.get("targetReps") or first_set.get("reps") or 8)
                weight = float(first_set.get("targetWeight") or first_set.get("weight") or 0)
                rest_s = float(first_set.get("restSeconds") or 90)

                rg = create_strength_set(
                    category=cat,
                    step_order=step_order,
                    sets=num_sets,
                    reps=reps,
                    rest_seconds=rest_s,
                    exercise_name=garmin_ex,
                    weight_kg=weight if weight > 0 else None,
                )
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
        # Endurance (Running / Cycling) structured workout
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
                    ftp=ftp, resting_hr=resting_hr, max_hr=max_hr,
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
            )
            steps.extend(parsed_steps)

    return {
        "sportType": {
            "sportTypeId": sport_type_id,
            "sportTypeKey": sport_type_key,
        },
        "workoutName": name,
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": {
                    "sportTypeId": sport_type_id,
                    "sportTypeKey": sport_type_key,
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

