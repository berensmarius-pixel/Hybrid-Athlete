"""
Garmin Exercise Database Builder
Lädt die offiziellen Garmin Connect Übungsdaten (Exercises, Mobility, Yoga, Pilates)
sowie die offiziellen deutschen und englischen Übersetzungen herunter und
generiert eine vollständige, durchsuchbare Mapping-Datenbank.
"""

import urllib.request
import json
import os
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_FILE = BASE_DIR / "data" / "garmin_exercises_db.json"

DATA_SOURCES = {
    "strength": "https://connect.garmin.com/web-data/exercises/Exercises.json",
    "mobility": "https://connect.garmin.com/web-data/exercises/Mobility.json",
    "yoga": "https://connect.garmin.com/web-data/exercises/Yoga.json",
    "pilates": "https://connect.garmin.com/web-data/exercises/Pilates.json",
}

TRANSLATIONS_EN = "https://connect.garmin.com/web-translations/exercise_types/exercise_types.properties"
TRANSLATIONS_DE = "https://connect.garmin.com/web-translations/exercise_types/exercise_types_de.properties"


def fetch_url(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="ignore")


def parse_properties(text: str) -> dict:
    result = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            result[k.strip()] = v.strip()
    return result


def build_database():
    print("1. Lade Übersetzungen herunter...")
    en_props = parse_properties(fetch_url(TRANSLATIONS_EN))
    de_props = parse_properties(fetch_url(TRANSLATIONS_DE))
    print(f"   EN: {len(en_props)} Einträge, DE: {len(de_props)} Einträge.")

    exercises_list = []
    seen_keys = set()

    for workout_type, url in DATA_SOURCES.items():
        print(f"2. Lade {workout_type.capitalize()} Übungen von {url}...")
        raw_json = fetch_url(url)
        data = json.loads(raw_json)
        categories = data.get("categories", {})

        for cat_name, cat_data in categories.items():
            exercises = cat_data.get("exercises", {})
            for ex_name, ex_data in exercises.items():
                prop_key = f"{cat_name}_{ex_name}"
                if prop_key in seen_keys:
                    continue
                seen_keys.add(prop_key)

                name_de = de_props.get(prop_key) or de_props.get(ex_name) or ex_name.replace("_", " ").title()
                name_en = en_props.get(prop_key) or en_props.get(ex_name) or ex_name.replace("_", " ").title()

                cat_de = de_props.get(cat_name) or cat_name.replace("_", " ").title()
                cat_en = en_props.get(cat_name) or cat_name.replace("_", " ").title()

                primary_muscles = ex_data.get("primaryMuscles", [])
                secondary_muscles = ex_data.get("secondaryMuscles", [])

                exercises_list.append({
                    "category": cat_name,
                    "exercise": ex_name,
                    "workoutType": workout_type,
                    "name_de": name_de,
                    "name_en": name_en,
                    "category_de": cat_de,
                    "category_en": cat_en,
                    "primaryMuscles": primary_muscles,
                    "secondaryMuscles": secondary_muscles,
                })

    # Erstelle Mapping-Indizes für schnelles Nachschlagen (exakt und normalisiert)
    lookup_index = {}
    for entry in exercises_list:
        cat = entry["category"]
        ex = entry["exercise"]
        
        # Verschiedene Suchschlüssel registrieren
        keys = [
            entry["name_de"].lower(),
            entry["name_en"].lower(),
            f"{cat}_{ex}".lower(),
            ex.lower().replace("_", " "),
            ex.lower(),
        ]
        for k in keys:
            if k and k not in lookup_index:
                lookup_index[k] = {"category": cat, "exercise": ex}

    db_output = {
        "version": "1.0.0",
        "totalExercises": len(exercises_list),
        "exercises": exercises_list,
        "lookup": lookup_index,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(db_output, f, ensure_ascii=False, indent=2)

    print(f" Fertig! {len(exercises_list)} Übungen erfolgreich in {OUTPUT_FILE} gespeichert.")


if __name__ == "__main__":
    build_database()
