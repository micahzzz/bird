# routers/system.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
import subprocess
import os
from typing import Dict

router = APIRouter()

# --- Path Handling ---
# Using os.path.expanduser to correctly resolve '~' to the home directory
# of the user running the script.
CONFIG_PATH = os.path.expanduser('~/BirdNET-Pi/birdnet.conf')


def run_command(command: str) -> str:
    """A helper function to run shell commands and return the output."""
    try:
        # Using subprocess.check_output is slightly more modern and raises an error on non-zero exit codes.
        return subprocess.check_output(command, shell=True, text=True, stderr=subprocess.PIPE).strip()
    except subprocess.CalledProcessError as e:
        print(f"Command '{command}' failed with error: {e.stderr}")
        return ""
    except Exception as e:
        print(f"An unexpected error occurred while running command '{command}': {e}")
        return ""

def parse_config(path: str) -> Dict[str, str]:
    """Parses a simple key-value .conf file."""
    config = {}
    if not os.path.exists(path):
        return {}
    with open(path, 'r') as f:
        for line in f:
            if '=' in line and not line.strip().startswith('#'):
                key, val = line.strip().split('=', 1)
                config[key.strip()] = val.strip(' "\'')
    return config


@router.get("/system", summary="Get Live System Statistics")
async def get_system_stats():
    """
    Returns live system statistics like CPU temperature, memory/disk usage, and uptime.
    This logic has been migrated from the original birdnet_core.py.
    """
    try:
        temp_raw = run_command("cat /sys/class/thermal/thermal_zone0/temp")
        temp_c = round(int(temp_raw) / 1000.0, 1) if temp_raw.isdigit() else 0.0

        mem_raw = run_command("free -m | awk 'NR==2 {printf \"%.1f\", $3*100/$2}'")
        memory = float(mem_raw) if mem_raw and mem_raw.replace('.', '', 1).isdigit() else 0.0

        disk_raw = run_command("df -h / | awk 'NR==2 {print $5}'").replace('%', '')
        disk = int(disk_raw) if disk_raw.isdigit() else 0

        uptime = run_command("uptime -p").replace('up ', '')

        return {
            "temp": temp_c,
            "memory": memory,
            "disk": disk,
            "uptime": uptime
        }
    except Exception as e:
        # If anything unexpected goes wrong, return a 500 error.
        raise HTTPException(status_code=500, detail=f"Failed to retrieve system stats: {str(e)}")


@router.get("/config", summary="Get birdnet.conf Settings")
async def get_config():
    """
    Reads and returns the key-value pairs from the birdnet.conf file.
    """
    config = parse_config(CONFIG_PATH)
    if not config:
        raise HTTPException(status_code=404, detail=f"Config file not found or is empty at {CONFIG_PATH}")
    return config


@router.get("/log", response_class=PlainTextResponse, summary="Get System Service Log")
async def get_system_log():
    """
    Fetches the last 100 lines of the `birdnet_analysis.service` log.
    """
    log_output = run_command("journalctl -u birdnet_analysis.service -n 100 --no-pager")
    return log_output
