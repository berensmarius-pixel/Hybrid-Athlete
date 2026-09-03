"""
Garmin Sync Cloud Microservice for Hybrid Athlete
Provides hosted REST and CLI-bridge endpoints for Garmin Connect operations.
Designed for 24/7 deployment on Render (or Docker / Railway / Fly.io).
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Resolve paths
SERVICE_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVICE_DIR.parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"

# Add scripts directory to sys.path if available
if SCRIPTS_DIR.exists() and str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

# Find garmin_sync.py
LOCAL_SCRIPT = SERVICE_DIR / "garmin_sync.py"
ROOT_SCRIPT = SCRIPTS_DIR / "garmin_sync.py"
SCRIPT_PATH = str(LOCAL_SCRIPT if LOCAL_SCRIPT.exists() else ROOT_SCRIPT)

app = FastAPI(
    title="Hybrid Athlete - Garmin Sync Service",
    version="1.0.0",
    description="Dedicated Python microservice for Garmin Connect sync & workout scheduling."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional Bearer Token Authentication
SERVICE_SECRET = os.environ.get("GARMIN_SERVICE_SECRET") or os.environ.get("HA_API_SECRET")

def verify_token(authorization: Optional[str] = Header(None)) -> bool:
    if not SERVICE_SECRET:
        return True
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required"
        )
    prefix = "bearer "
    token = authorization[len(prefix):] if authorization.lower().startswith(prefix) else authorization
    if token.strip() != SERVICE_SECRET.strip():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid authorization secret"
        )
    return True


def run_garmin_cli(args: List[str], stdin_data: Optional[str] = None, extra_env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Spawns python garmin_sync.py with arguments and parses JSON response."""
    python_bin = sys.executable
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    if extra_env:
        env.update(extra_env)

    # Token dir on serverless / render
    if "GARMIN_TOKEN_DIR" not in env:
        token_dir = Path("/tmp/garmin_tokens") if sys.platform != "win32" else Path(os.environ.get("LOCALAPPDATA", ".")) / "hybrid-athlete" / "garmin_tokens"
        token_dir.mkdir(parents=True, exist_ok=True)
        env["GARMIN_TOKEN_DIR"] = str(token_dir)

    cmd = [python_bin, SCRIPT_PATH] + args
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE if stdin_data is not None else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            env=env
        )
        stdout, stderr = proc.communicate(input=stdin_data, timeout=50)
        
        trimmed = stdout.strip()
        if not trimmed:
            raise HTTPException(
                status_code=500,
                detail=f"Garmin-Skript lieferte leere Ausgabe. Fehler: {stderr.strip()[:300]}"
            )
        try:
            return json.loads(trimmed)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=500,
                detail=f"Garmin-Skript lieferte ungültiges JSON: {trimmed[:300]} (stderr: {stderr.strip()[:200]})"
            )
    except subprocess.TimeoutExpired:
        proc.kill()
        raise HTTPException(status_code=504, detail="Garmin CLI Ausführung hat Zeitlimit überschritten (Timeout)")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Ausführungsfehler: {str(e)}")


# ─── Endpoints ────────────────────────────────────────────────────────────────

class CliRequest(BaseModel):
    args: List[str]
    stdin: Optional[str] = None
    env: Optional[Dict[str, str]] = None


@app.get("/")
@app.get("/health")
def health_check():
    """Liveness probe for Render / Cloud Orchestrators."""
    return {
        "status": "ok",
        "service": "hybrid-athlete-garmin-sync",
        "script_found": os.path.exists(SCRIPT_PATH),
        "python_version": sys.version.split()[0]
    }


@app.post("/cli", dependencies=[Depends(verify_token)])
def execute_cli(req: CliRequest):
    """Universal CLI bridge for Next.js app running on Vercel or any remote host."""
    return run_garmin_cli(req.args, stdin_data=req.stdin, extra_env=req.env)


@app.get("/status", dependencies=[Depends(verify_token)])
def get_status():
    """Checks Garmin Connect session / token status."""
    return run_garmin_cli(["status"])


class LoginRequest(BaseModel):
    email: str
    password: str
    mfa: Optional[str] = None

@app.post("/login", dependencies=[Depends(verify_token)])
def login(data: LoginRequest):
    """Performs Garmin Connect authentication with optional MFA."""
    args = ["login", "--email", data.email]
    if data.mfa:
        args.extend(["--mfa", data.mfa])
    return run_garmin_cli(args, stdin_data=data.password)


@app.get("/sync", dependencies=[Depends(verify_token)])
def sync_data(date: Optional[str] = None):
    """Synchronizes daily health metrics & activities for specified date (YYYY-MM-DD)."""
    args = ["sync"]
    if date:
        args.extend(["--date", date])
    return run_garmin_cli(args)


@app.get("/workouts", dependencies=[Depends(verify_token)])
def list_workouts():
    """Lists Garmin Connect library workouts."""
    return run_garmin_cli(["list_workouts"])


@app.get("/scheduled", dependencies=[Depends(verify_token)])
def list_scheduled(year: Optional[int] = None, month: Optional[int] = None, months: int = 2):
    """Lists scheduled calendar workouts."""
    args = ["list_scheduled_workouts", "--months", str(months)]
    if year:
        args.extend(["--year", str(year)])
    if month:
        args.extend(["--month", str(month)])
    return run_garmin_cli(args)


class ScheduleRequest(BaseModel):
    workout: Dict[str, Any]
    date: str

@app.post("/schedule", dependencies=[Depends(verify_token)])
def schedule_workout(data: ScheduleRequest):
    """Schedules a workout into Garmin Connect calendar."""
    args = ["schedule_workout", "--date", data.date, "--workout-json", "-"]
    return run_garmin_cli(args, stdin_data=json.dumps(data.workout))


@app.delete("/workouts/{workout_id}", dependencies=[Depends(verify_token)])
def delete_workout(workout_id: str):
    """Deletes a custom workout from Garmin Connect."""
    return run_garmin_cli(["delete_workout", "--workout-id", workout_id])


@app.delete("/schedule/{schedule_id}", dependencies=[Depends(verify_token)])
def unschedule_workout(schedule_id: str):
    """Removes a scheduled calendar workout."""
    return run_garmin_cli(["unschedule_workout", "--schedule-id", schedule_id])


@app.get("/activity/{activity_id}", dependencies=[Depends(verify_token)])
def activity_details(activity_id: str):
    """Fetches high-resolution activity details."""
    return run_garmin_cli(["activity_details", "--activity-id", activity_id])
