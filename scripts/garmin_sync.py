#!/usr/bin/env python3
"""
Garmin Connect Sync Engine
Powered by cyberjunky/python-garminconnect (https://github.com/cyberjunky/python-garminconnect)
Provides genuine, automated sync for Garmin Forerunner 265, Edge 840 & health metrics.
"""

import sys
import os
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


def parse_endurance_description_to_steps(description, name, total_duration_mins=45):
    """
    Parses German/English training plan descriptions into structured Garmin workout steps:
    - Warm-up (Aufwärmen)
    - Interval Repeats (e.g. 4x 8 Min @ 95-105% FTP with 4 Min recovery)
    - Cool-down (Abwärmen)
    """
    import re
    desc = (description or "").strip()
    steps = []
    step_order = 1

    # ── Interval detection ────────────────────────────────────────────────────
    # Supported formats:
    #   "4x8 Min" / "4 x 8 Minuten" / "4×8min" / "6 X 2 MIN"
    #   "4x 1000m" / "5×1km" / "8x400 Meter"
    #   "4x5'" / "10x30s" / "6x90 Sek"
    match_int = re.search(
        r'(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|km|sek(?:unden)?|meter|m|s)?',
        desc,
        re.IGNORECASE,
    )

    # ── Rest / recovery detection (strict – avoids false positives) ───────────
    # Valid patterns:  "... mit 3 Min Pause" | "... + 90s Pause" | "Pause: 2 min"
    #                  "3 Min Trab" | "4 min erholung" | "2' recovery"
    # INVALID (must NOT match): "@ 95-105% FTP" | "mit steigender Intensität"
    def _to_seconds(val_str, unit_str):
        val = float(val_str.replace(",", "."))
        u = (unit_str or "").lower()
        if u.startswith("s"):
            return int(round(val))
        return int(round(val * 60))

    rest_secs = 240  # default 4 min
    match_rest = (
        # Pattern A: keyword AFTER value → "mit 4 Min Pause", "+ 90s Trab"
        re.search(
            r'(?:mit|nach|\+|/)\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?\s*'
            r'(?:pause|erholung|trab|locker|rec|rest)',
            desc,
            re.IGNORECASE,
        )
        # Pattern B: keyword BEFORE value → "Pause: 3 min", "Erholung 90s"
        or re.search(
            r'(?:pause|erholung|trab|rec|rest)\s*[::]?\s*(\d+(?:[.,]\d+)?)\s*(\'|′|min(?:uten)?|s|sek(?:unden)?)?',
            desc,
            re.IGNORECASE,
        )
    )
    if match_rest:
        rest_secs = _to_seconds(match_rest.group(1), match_rest.group(2))

    if match_int:
        repeats = int(match_int.group(1))
        val = float(match_int.group(2).replace(",", "."))
        raw_unit = (match_int.group(3) or "").lower().strip()
        if not raw_unit:
            # Heuristik: Ohne Einheit → Minuten (klassisch "4x8" = 8 Minuten)
            raw_unit = "min"
        elif raw_unit in ("'", "′"):
            raw_unit = "min"
        elif raw_unit.startswith("sek"):
            raw_unit = "s"
        elif raw_unit.startswith("m") and not raw_unit.startswith("mi"):
            # "m" oder "meter" → Meter-Distanz
            raw_unit = "m"
        unit = raw_unit

        # Warm-up / Cool-down an Gesamtdauer skalieren
        total_secs = int((total_duration_mins or 45) * 60)
        est_workout = 600 + repeats * ((val * 60 if unit in ("min",) else val if unit == "s" else 0) + rest_secs)
        warmup_s = 600
        cooldown_s = 600
        if total_secs > est_workout:
            extra = total_secs - est_workout
            warmup_s += int(extra * 0.5)
            cooldown_s += int(extra * 0.5)

        # 1. Warm-up
        steps.append({
            "type": "ExecutableStepDTO",
            "stepOrder": step_order,
            "stepType": {"stepTypeId": 1, "stepTypeKey": "warmup"},
            "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
            "endConditionValue": warmup_s,
            "description": "Aufwärmen / Einrollen (locker)",
        })
        step_order += 1

        # FTP-/Leistungs-Vorgabe aus Beschreibung extrahieren (nur Info-Text)
        target_note = ""
        ftp_match = re.search(r'(\d+(?:\s*[–-]\s*\d+)?\s*%\s*(?:ftp|hf|max))', desc, re.IGNORECASE)
        if ftp_match:
            target_note = f" ({ftp_match.group(1)})"

        # 2. Intervalle
        for i in range(1, repeats + 1):
            if unit in ["m", "km"]:
                dist_m = int(val * 1000) if unit == "km" else int(val)
                steps.append({
                    "type": "ExecutableStepDTO",
                    "stepOrder": step_order,
                    "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
                    "endCondition": {"conditionTypeId": 3, "conditionTypeKey": "distance"},
                    "endConditionValue": dist_m,
                    "description": f"Intervall {i}/{repeats}: {int(val)} {unit}{target_note}",
                })
            else:
                dur_s = int(val) if unit == "s" else int(val * 60)
                label = f"{int(val)} s" if unit == "s" else f"{int(val)} Min"
                steps.append({
                    "type": "ExecutableStepDTO",
                    "stepOrder": step_order,
                    "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
                    "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
                    "endConditionValue": dur_s,
                    "description": f"Intervall {i}/{repeats}: {label}{target_note}",
                })
            step_order += 1

            if rest_secs > 0:
                steps.append({
                    "type": "ExecutableStepDTO",
                    "stepOrder": step_order,
                    "stepType": {"stepTypeId": 4, "stepTypeKey": "recovery"},
                    "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
                    "endConditionValue": rest_secs,
                    "description": f"Erholung {i}/{repeats} (locker)",
                })
                step_order += 1

        # 3. Cool-down
        steps.append({
            "type": "ExecutableStepDTO",
            "stepOrder": step_order,
            "stepType": {"stepTypeId": 2, "stepTypeKey": "cooldown"},
            "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
            "endConditionValue": cooldown_s,
            "description": "Abwärmen / Ausrollen (locker)",
        })

    else:
        # Generic duration
        dur_match = re.search(r'(\d+)(?:\s*[-–]\s*(\d+))?\s*min', desc, re.IGNORECASE)
        total_mins = total_duration_mins or 45
        if dur_match:
            if dur_match.group(2):
                total_mins = int((int(dur_match.group(1)) + int(dur_match.group(2))) / 2)
            else:
                total_mins = int(dur_match.group(1))

        warmup_m = min(10, max(5, int(total_mins * 0.15)))
        cooldown_m = min(10, max(5, int(total_mins * 0.15)))
        main_m = max(10, total_mins - warmup_m - cooldown_m)

        steps.append({
            "type": "ExecutableStepDTO",
            "stepOrder": 1,
            "stepType": {"stepTypeId": 1, "stepTypeKey": "warmup"},
            "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
            "endConditionValue": warmup_m * 60,
            "description": "Einrollen / Aufwärmen",
        })
        steps.append({
            "type": "ExecutableStepDTO",
            "stepOrder": 2,
            "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
            "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
            "endConditionValue": main_m * 60,
            "description": desc or name,
        })
        steps.append({
            "type": "ExecutableStepDTO",
            "stepOrder": 3,
            "stepType": {"stepTypeId": 2, "stepTypeKey": "cooldown"},
            "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
            "endConditionValue": cooldown_m * 60,
            "description": "Ausrollen / Abwärmen",
        })

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
        intervals = workout_data.get("intervals", [])
        if intervals:
            for item in intervals:
                dur_secs = item.get("durationSeconds") or 300
                stype = item.get("type", "interval")
                step_key = "warmup" if stype == "warmup" else "cooldown" if stype == "cooldown" else "recovery" if stype == "recovery" else "interval"
                step_id = 1 if step_key == "warmup" else 2 if step_key == "cooldown" else 4 if step_key == "recovery" else 3

                steps.append({
                    "type": "ExecutableStepDTO",
                    "stepOrder": step_order,
                    "stepType": {"stepTypeId": step_id, "stepTypeKey": step_key},
                    "endCondition": {"conditionTypeId": 2, "conditionTypeKey": "time"},
                    "endConditionValue": int(dur_secs),
                    "description": item.get("description", ""),
                })
                step_order += 1
        else:
            # Smart NLP parse from description/title
            desc = workout_data.get("description") or workout_data.get("details") or ""
            dur_mins = workout_data.get("durationMinutes") or 45
            parsed_steps = parse_endurance_description_to_steps(desc, name, dur_mins)
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
    parser.add_argument("action", choices=["login", "sync", "status", "activity_details", "schedule_workout", "list_workouts", "delete_workout"], help="Action to perform")
    parser.add_argument("--email", help="Garmin Connect Email")
    # Passwort bewusst NICHT als CLI-Argument (Prozessliste/Shell-History) –
    # ausschließlich per Umgebungsvariable GARMIN_PASSWORD.
    parser.add_argument("--mfa", help="Garmin 2FA/MFA Code")
    parser.add_argument("--date", help="Date in YYYY-MM-DD format")
    parser.add_argument("--activity-id", help="Garmin Activity ID (numeric)")
    parser.add_argument("--workout-json", help="Workout data JSON string, path to JSON file, or '-' to read JSON from stdin")
    parser.add_argument("--workout-id", help="Workout ID to delete")

    args = parser.parse_args()

    # Credentials optional per Umgebungsvariable (sicherer als argv – nicht in
    # der Prozessliste sichtbar). Die App-Routen setzen diese Variablen.
    if not args.email:
        args.email = os.environ.get("GARMIN_EMAIL")
    if not args.password:
        args.password = os.environ.get("GARMIN_PASSWORD")
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

    elif args.action == "list_workouts":
        res = do_list_workouts(args.email, args.password)
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

