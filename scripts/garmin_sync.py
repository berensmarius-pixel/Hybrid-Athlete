#!/usr/bin/env python3
"""
Garmin Connect Sync Engine
Powered by cyberjunky/python-garminconnect (https://github.com/cyberjunky/python-garminconnect)
Provides genuine, automated sync for Garmin Forerunner 265, Edge 840 & health metrics.
"""

import sys
import os
import json
import argparse
from datetime import datetime, date

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

TOKEN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".garmin_tokens")


def get_garmin_client(email=None, password=None, mfa_code=None):
    os.makedirs(TOKEN_DIR, exist_ok=True)
    garmin = Garmin(email=email, password=password, is_cn=False)
    
    # 1. Try login with existing saved tokens first
    token_file = os.path.join(TOKEN_DIR, "garmin_tokens.json")
    if os.path.exists(token_file) and not email:
        try:
            garmin.login(tokenstore=TOKEN_DIR)
            return garmin, None
        except Exception:
            pass

    if not email or not password:
        return None, "Keine Anmeldedaten und keine gespeicherten Tokens gefunden."

    # 2. Login with credentials
    try:
        garmin.login(tokenstore=TOKEN_DIR)
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


def main():
    parser = argparse.ArgumentParser(description="Garmin Connect Sync CLI via cyberjunky/python-garminconnect")
    parser.add_argument("action", choices=["login", "sync", "status"], help="Action to perform")
    parser.add_argument("--email", help="Garmin Connect Email")
    parser.add_argument("--password", help="Garmin Connect Password")
    parser.add_argument("--mfa", help="Garmin 2FA/MFA Code")
    parser.add_argument("--date", help="Date in YYYY-MM-DD format")

    args = parser.parse_args()

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


if __name__ == "__main__":
    main()
