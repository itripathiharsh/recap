"""Worker heartbeat reporter for Meeting Recorder.

Collects system metrics (CPU, RAM, disk, uptime) and sends periodic heartbeats
to Supabase `system_events` and the FastAPI local daemon.
"""

from datetime import datetime, timezone
import logging
import os
from pathlib import Path
import shutil
import time
from typing import Any

from src.supabase_client import db_record_system_event

logger = logging.getLogger("heartbeat")

START_TIME = time.time()
APP_VERSION = "1.0.0"


def collect_system_metrics(data_dir: Path | str = "data") -> dict[str, Any]:
    """Collect current host CPU, RAM, disk, and uptime metrics."""
    # 1. CPU
    cpu_percent = 0.0
    try:
        import psutil
        cpu_percent = float(psutil.cpu_percent(interval=0.1))
    except Exception:
        try:
            load1, _, _ = os.getloadavg()
            cpu_percent = round(load1 * 25.0, 1)  # Rough estimate on 4-core
        except Exception:
            cpu_percent = 0.0

    # 2. RAM
    ram_percent = 0.0
    try:
        import psutil
        ram_percent = float(psutil.virtual_memory().percent)
    except Exception:
        try:
            with open("/proc/meminfo", "r") as f:
                lines = f.readlines()
            mem = {}
            for line in lines:
                parts = line.split(":")
                if len(parts) == 2:
                    mem[parts[0].strip()] = int(parts[1].strip().split()[0])
            total = mem.get("MemTotal", 1)
            avail = mem.get("MemAvailable", mem.get("MemFree", 0))
            ram_percent = round(((total - avail) / total) * 100.0, 1)
        except Exception:
            ram_percent = 0.0

    # 3. Disk
    disk_data = {}
    try:
        check_path = Path(data_dir)
        check_path.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(check_path)
        disk_data = {
            "total_gb": round(usage.total / (1024**3), 2),
            "used_gb": round(usage.used / (1024**3), 2),
            "free_gb": round(usage.free / (1024**3), 2),
            "percent": round((usage.used / usage.total) * 100.0, 1),
        }
    except Exception as exc:
        disk_data = {"error": str(exc), "percent": 0.0}

    # 4. Uptime
    uptime_seconds = round(time.time() - START_TIME, 1)

    return {
        "cpu_percent": cpu_percent,
        "ram_percent": ram_percent,
        "disk": disk_data,
        "uptime_seconds": uptime_seconds,
        "version": APP_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def send_heartbeat(
    status: str = "online",
    current_meeting_id: str | None = None,
    current_state: str = "idle",
    api_url: str | None = None,
) -> dict[str, Any]:
    """Send heartbeat payload to Supabase and optionally local FastAPI."""
    metrics = collect_system_metrics()
    payload = {
        "status": status,
        "current_meeting": current_meeting_id,
        "current_state": current_state,
        "metrics": metrics,
        "timestamp": metrics["timestamp"],
    }

    # 1. Log to Supabase system_events
    try:
        db_record_system_event(
            level="info",
            event_type="heartbeat",
            message=f"Worker heartbeat: {status} ({current_state})",
            meeting_id=current_meeting_id,
            metadata=payload,
        )
    except Exception as exc:
        logger.warning("Could not send heartbeat to Supabase: %s", exc)

    # 2. Optionally ping local FastAPI /api/worker/heartbeat
    target_api = api_url or os.getenv("FASTAPI_URL", "http://127.0.0.1:8000")
    try:
        import httpx
        with httpx.Client(timeout=2.0) as client:
            client.post(
                f"{target_api}/api/worker/heartbeat",
                json={
                    "worker_id": "oracle-worker-1",
                    "status": status,
                    "current_meeting_id": current_meeting_id,
                    "metrics": metrics,
                },
            )
    except Exception:
        # Expected if FastAPI is not running on the same host or port
        pass

    return payload
