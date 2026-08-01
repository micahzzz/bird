import os
import shutil
import subprocess
from fastapi import APIRouter, HTTPException, Body, Query
from fastapi.responses import FileResponse

router = APIRouter(tags=["System & Config"])

CONF_FILE = os.path.expanduser("~/BirdNET-Pi/birdnet.conf")
CONFIG_PATH = CONF_FILE  # Restored for compatibility with streaming.py
SPECIES_DIR = os.path.expanduser("~/BirdNET-Pi/")
STORAGE_DIR = os.path.expanduser("~/BirdSongs/")

def parse_config(path: str) -> dict:
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

def get_cpu_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            return round(float(f.read().strip()) / 1000.0, 1)
    except Exception:
        return 0.0

def get_memory_usage():
    try:
        mem = {}
        with open("/proc/meminfo", "r") as f:
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    mem[parts[0].strip()] = int(parts[1].split()[0])
        total = mem.get("MemTotal", 1)
        available = mem.get("MemAvailable", total)
        used_pct = ((total - available) / total) * 100.0
        return round(used_pct, 1)
    except Exception:
        return 0.0

def get_disk_usage():
    try:
        usage = shutil.disk_usage("/")
        return round((usage.used / usage.total) * 100.0, 1)
    except Exception:
        return 0.0

def get_uptime_str():
    try:
        with open("/proc/uptime", "r") as f:
            uptime_seconds = float(f.readline().split()[0])
        days = int(uptime_seconds // 86400)
        hours = int((uptime_seconds % 86400) // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        parts = []
        if days > 0: parts.append(f"{days} day{'s' if days != 1 else ''}")
        if hours > 0: parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
        parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
        return ", ".join(parts)
    except Exception:
        return "Unknown"

@router.get("/system")
async def get_system_telemetry():
    return {
        "temp": get_cpu_temp(),
        "memory": get_memory_usage(),
        "disk": get_disk_usage(),
        "uptime": get_uptime_str()
    }

@router.get("/config")
async def get_config():
    config = {}
    if os.path.exists(CONF_FILE):
        with open(CONF_FILE, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    config[key.strip()] = val.strip(' "')
    return config

@router.post("/config/update")
async def update_config(payload: dict = Body(...)):
    if not os.path.exists(CONF_FILE):
        raise HTTPException(status_code=404, detail="birdnet.conf not found")
    lines = []
    with open(CONF_FILE, "r") as f:
        lines = f.readlines()
    updated_keys = set()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in line:
            key, _ = line.split("=", 1)
            key = key.strip()
            if key in payload:
                new_lines.append(f'{key}="{payload[key]}"\n')
                updated_keys.add(key)
                continue
        new_lines.append(line)
    for k, v in payload.items():
        if k not in updated_keys:
            new_lines.append(f'{k}="{v}"\n')
    with open(CONF_FILE, "w") as f:
        f.writelines(new_lines)
    return {"status": "success", "message": "Configuration updated successfully"}

@router.get("/log")
async def get_system_log():
    try:
        output = subprocess.check_output(
            ["journalctl", "-u", "birdnet_analysis.service", "-n", "100", "--no-pager"],
            text=True
        )
        return output
    except Exception as e:
        return f"Error retrieving logs: {str(e)}"

@router.get("/services/status")
async def get_services_status():
    services = ["birdnet_analysis.service", "birdnet_recording.service", "caddy.service"]
    status_dict = {}
    for s in services:
        try:
            active = subprocess.check_output(["systemctl", "is-active", s], text=True).strip()
            enabled = subprocess.check_output(["systemctl", "is-enabled", s], text=True).strip()
            status_dict[s] = {"active": active, "enabled": enabled}
        except subprocess.CalledProcessError as e:
            active = e.output.strip() if e.output else "inactive"
            status_dict[s] = {"active": active, "enabled": "disabled"}
        except Exception:
            status_dict[s] = {"active": "inactive", "enabled": "disabled"}
    return status_dict

@router.post("/service_control")
async def control_service(payload: dict = Body(...)):
    action = payload.get("action")
    service = payload.get("service")
    allowed_actions = ["start", "stop", "restart", "enable", "disable"]
    allowed_services = ["birdnet_analysis.service", "birdnet_recording.service", "caddy.service"]
    if action in allowed_actions and service in allowed_services:
        try:
            subprocess.run(["sudo", "systemctl", action, service], check=True)
            return {"status": "success", "message": f"{action} executed on {service}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=400, detail="Invalid action or service")

@router.get("/species_list")
async def get_species_list(list: str = "confirmed"):
    filename_map = {
        "confirmed": "confirmed_species.txt",
        "whitelisted": "whitelisted_species.txt",
        "excluded": "excluded_species.txt"
    }
    target = filename_map.get(list.lower())
    if not target:
        raise HTTPException(status_code=400, detail="Invalid species list type")
    filepath = os.path.join(SPECIES_DIR, target)
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            return {"list": list, "content": f.read()}
    return {"list": list, "content": ""}

@router.post("/species_list/update")
async def update_species_list(payload: dict = Body(...)):
    list_name = payload.get("list_name", "").lower()
    content = payload.get("content", "")
    filename_map = {
        "confirmed": "confirmed_species.txt",
        "whitelisted": "whitelisted_species.txt",
        "excluded": "excluded_species.txt"
    }
    target = filename_map.get(list_name)
    if not target:
        raise HTTPException(status_code=400, detail="Invalid species list type")
    filepath = os.path.join(SPECIES_DIR, target)
    with open(filepath, "w") as f:
        f.write(content)
    return {"status": "success", "message": f"{list_name} species list saved successfully"}

# --- NATIVE FILE MANAGER ENDPOINTS ---
@router.get("/files/list")
async def list_files(path: str = ""):
    target_path = os.path.abspath(os.path.join(STORAGE_DIR, path))
    if not target_path.startswith(os.path.abspath(STORAGE_DIR)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Directory not found")

    items = []
    for item in sorted(os.listdir(target_path)):
        full_p = os.path.join(target_path, item)
        rel_p = os.path.relpath(full_p, STORAGE_DIR)
        is_dir = os.path.isdir(full_p)
        size = os.path.getsize(full_p) if not is_dir else 0
        mtime = os.path.getmtime(full_p)
        items.append({
            "name": item,
            "rel_path": rel_p,
            "is_dir": is_dir,
            "size": size,
            "mtime": mtime
        })
    return {"current_path": path, "items": items}

@router.get("/files/download")
async def download_file(path: str = Query(...)):
    target_path = os.path.abspath(os.path.join(STORAGE_DIR, path))
    if not target_path.startswith(os.path.abspath(STORAGE_DIR)) or not os.path.isfile(target_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target_path, filename=os.path.basename(target_path))

@router.delete("/files/delete")
async def delete_file(path: str = Query(...)):
    target_path = os.path.abspath(os.path.join(STORAGE_DIR, path))
    if not target_path.startswith(os.path.abspath(STORAGE_DIR)):
        raise HTTPException(status_code=403, detail="Access denied")
    if os.path.isdir(target_path):
        shutil.rmtree(target_path)
    elif os.path.isfile(target_path):
        os.remove(target_path)
    else:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "success"}
