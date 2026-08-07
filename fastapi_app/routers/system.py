import os
import re
import shutil
import subprocess
import tempfile
from fastapi import APIRouter, HTTPException, Body, Query
from fastapi.responses import FileResponse

router = APIRouter(tags=["System & Config"])


def run_command(command, timeout=2):
    try:
        return subprocess.check_output(command, text=True, timeout=timeout).strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.CalledProcessError):
        return None


CONF_FILE = os.path.expanduser("~/BirdNET-Pi/birdnet.conf")
APPRISE_FILE = os.path.expanduser("~/BirdNET-Pi/apprise.txt")
BODY_FILE = os.path.expanduser("~/BirdNET-Pi/body.txt")
SPECIES_DIR = os.path.expanduser("~/BirdNET-Pi/")
STORAGE_DIR = os.path.expanduser("~/BirdSongs/")

def get_config_full():
    """Parses birdnet.conf and related notification files."""
    config = {}
    if os.path.exists(CONF_FILE):
        with open(CONF_FILE, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, val = line.strip().split('=', 1)
                    config[key.strip()] = val.strip(' "\'')
    
    if os.path.exists(APPRISE_FILE):
        with open(APPRISE_FILE, 'r', encoding='utf-8') as f:
            config['APPRISE_SERVICES'] = f.read()
    else:
        config['APPRISE_SERVICES'] = ''

    if os.path.exists(BODY_FILE):
        with open(BODY_FILE, 'r', encoding='utf-8') as f:
            config['APPRISE_NOTIFICATION_BODY'] = f.read()
    else:
        config['APPRISE_NOTIFICATION_BODY'] = ''
        
    return config

def update_config_full(updates: dict):
    """
    Safely updates birdnet.conf using regex to preserve comments and structure.
    Also handles writing to apprise.txt and body.txt.
    """
    unquoted_keys = {
        'LATITUDE', 'LONGITUDE', 'BIRDWEATHER_ID', 'APPRISE_NOTIFY_EACH_DETECTION',
        'APPRISE_NOTIFY_NEW_SPECIES', 'APPRISE_NOTIFY_NEW_SPECIES_EACH_DAY', 'APPRISE_WEEKLY_REPORT',
        'APPRISE_MINIMUM_SECONDS_BETWEEN_NOTIFICATIONS_PER_SPECIES', 'SF_THRESH', 'DATA_MODEL_VERSION',
        'PRIVACY_THRESHOLD', 'PURGE_THRESHOLD', 'MAX_FILES_SPECIES', 'CHANNELS', 'RECORDING_LENGTH',
        'EXTRACTION_LENGTH', 'HIGHPASS_FREQ', 'SILENCE_UPDATE_INDICATOR', 'AUTOMATIC_UPDATE',
        'RAW_SPECTROGRAM', 'RARE_SPECIES_THRESHOLD', 'OVERLAP', 'CONFIDENCE', 'SENSITIVITY'
    }

    try:
        # Separate Apprise services & notification body from standard config updates
        apprise_services = updates.pop('APPRISE_SERVICES', None)
        apprise_body = updates.pop('APPRISE_NOTIFICATION_BODY', None)

        if apprise_services is not None:
            with open(APPRISE_FILE, 'w', encoding='utf-8') as f:
                f.write(apprise_services)

        if apprise_body is not None:
            with open(BODY_FILE, 'w', encoding='utf-8') as f:
                f.write(apprise_body)

        if updates:
            if not os.path.exists(CONF_FILE):
                # If the file doesn't exist, create it with the new content
                with open(CONF_FILE, 'w') as f:
                    for key, value in updates.items():
                        formatted_value = str(value) if key in unquoted_keys else f'"{value}"'
                        f.write(f"{key}={formatted_value}\n")
            else:
                with open(CONF_FILE, 'r') as f:
                    content = f.read()

                for key, value in updates.items():
                    value_str = str(value)
                    formatted_value = value_str if key in unquoted_keys else f'"{value_str}"'
                    
                    # Regex to find the key, optionally commented out, at the start of a line
                    pattern = re.compile(f"^(#\\s*)?{re.escape(key)}=.*", re.MULTILINE)
                    
                    if pattern.search(content):
                        # Key exists, so we replace it, ensuring it's uncommented
                        content = pattern.sub(f"{key}={formatted_value}", content)
                    else:
                        # Key doesn't exist, append it to the end
                        content += f"\n{key}={formatted_value}"
                
                with open(CONF_FILE, 'w') as f:
                    f.write(content)
            
        return True, "Configuration updated successfully."
        
    except Exception as e:
        return False, str(e)


def parse_temp_output(output: str) -> float:
    try:
        if not output:
            return 0.0
        if output.startswith("temp="):
            output = output.split("=", 1)[1]
        output = output.replace("'C", "").replace("°C", "").strip()
        return round(float(output), 1)
    except Exception:
        return 0.0


def get_cpu_temp():
    try:
        output = run_command(["vcgencmd", "measure_temp"], timeout=2)
        temp = parse_temp_output(output)
        if temp > 0.0:
            return temp
    except Exception:
        pass

    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            return round(float(f.read().strip()) / 1000.0, 1)
    except Exception:
        return 0.0


def get_memory_usage():
    try:
        output = run_command(["free", "-m"], timeout=2)
        if output:
            lines = output.splitlines()
            for line in lines:
                if line.lower().startswith("mem:") or line.lower().startswith("memtotal"):
                    parts = re.split(r"\s+", line.strip())
                    if len(parts) >= 3:
                        total = float(parts[1])
                        used = float(parts[2])
                        if total > 0:
                            return round((used / total) * 100.0, 1)
    except Exception:
        pass

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
        output = run_command(["uptime", "-p"], timeout=2)
        if output:
            return output.strip()
    except Exception:
        pass

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
        return "Active"

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
    """
    Returns the entire system configuration, including birdnet.conf
    and notification settings from apprise.txt and body.txt.
    """
    return get_config_full()

@router.post("/config/update")
async def update_config(payload: dict = Body(...)):
    """
    Receives a JSON object with configuration key-value pairs and
    safely updates the birdnet.conf file and related notification files.
    """
    # Define all keys the UI is allowed to edit to prevent malicious additions
    editable_keys = {
        'LATITUDE', 'LONGITUDE', 'CONFIDENCE', 'SENSITIVITY', 'OVERLAP', 
        'PRIVACY_THRESHOLD', 'FULL_DISK', 'PURGE_THRESHOLD', 'MAX_FILES_SPECIES',
        'REC_CARD', 'CHANNELS', 'RECORDING_LENGTH', 'EXTRACTION_LENGTH', 'HIGHPASS_FREQ', 'AUDIOFMT',
        'MODEL', 'DATA_MODEL_VERSION', 'SF_THRESH', 'RARE_SPECIES_THRESHOLD', 
        'SILENCE_UPDATE_INDICATOR', 'AUTOMATIC_UPDATE', 'RAW_SPECTROGRAM',
        'APPRISE_SERVICES', 'APPRISE_NOTIFICATION_TITLE', 'APPRISE_NOTIFICATION_BODY', 
        'APPRISE_NOTIFY_EACH_DETECTION', 'APPRISE_NOTIFY_NEW_SPECIES', 
        'APPRISE_NOTIFY_NEW_SPECIES_EACH_DAY', 'APPRISE_WEEKLY_REPORT',
        'APPRISE_MINIMUM_SECONDS_BETWEEN_NOTIFICATIONS_PER_SPECIES', 
        'APPRISE_ONLY_NOTIFY_SPECIES_NAMES', 'APPRISE_ONLY_NOTIFY_SPECIES_NAMES_2', 
        'SITE_NAME', 'BIRDWEATHER_ID', 'DATABASE_LANG', 'TIMEZONE'
    }
    
    filtered_payload = {k: v for k, v in payload.items() if k in editable_keys}

    if not filtered_payload:
        raise HTTPException(status_code=400, detail="No valid or editable settings provided.")

    success, message = update_config_full(filtered_payload)
    
    if success:
        return {"status": "success", "message": message}
    else:
        raise HTTPException(status_code=500, detail=message)

@router.post("/config/test_notification")
async def test_notification(payload: dict = Body(...)):
    apprise_services = payload.get('apprise_services', '')
    title = payload.get('title', 'BirdNET-Pi Test')
    body = payload.get('body', 'This is a test notification from BirdNET-Pi.')

    if not apprise_services:
        raise HTTPException(status_code=400, detail="Apprise services URL(s) are required.")

    # Replace placeholders
    title = title.replace('$comname', 'Test Species').replace('$sciname', 'Species testus').replace('$confidence', '99.9%')
    body = body.replace('$comname', 'Test Species').replace('$sciname', 'Species testus').replace('$confidence', '99.9%')

    home_dir = os.path.expanduser('~')
    t_conf_fd, t_conf_path = tempfile.mkstemp()
    t_body_fd, t_body_path = tempfile.mkstemp()

    try:
        with os.fdopen(t_conf_fd, 'w', encoding='utf-8') as f:
            f.write(apprise_services)
        with os.fdopen(t_body_fd, 'w', encoding='utf-8') as f:
            f.write(body)

        python_bin = os.path.join(home_dir, 'BirdNET-Pi', 'birdnet', 'bin', 'python3')
        if not os.path.exists(python_bin):
            python_bin = 'python3'

        script_path = os.path.join(home_dir, 'BirdNET-Pi', 'scripts', 'send_test_notification.py')
        if not os.path.exists(script_path):
            # Fallback path
            script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'legacy_php', 'scripts', 'send_test_notification.py')
            if not os.path.exists(script_path):
                raise HTTPException(status_code=404, detail="send_test_notification.py script not found.")

        cmd = [python_bin, script_path, '--body', t_body_path, '--config', t_conf_path, '--title', title]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)

        if result.returncode == 0:
            return {"success": True, "message": "Test notification sent successfully."}
        else:
            raise HTTPException(status_code=500, detail=f"Script failed: {result.stdout}\n{result.stderr}")

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Script timed out after 15 seconds.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(t_conf_path):
            os.remove(t_conf_path)
        if os.path.exists(t_body_path):
            os.remove(t_body_path)

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
    services = [
        'livestream.service', 'icecast2.service', 'web_terminal.service', 
        'birdnet_log.service', 'birdnet_analysis.service', 'birdnet_stats.service', 
        'birdnet_recording.service', 'chart_viewer.service', 'spectrogram_viewer.service'
    ]
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
    allowed_services = [
        'livestream.service', 'icecast2.service', 'web_terminal.service', 
        'birdnet_log.service', 'birdnet_analysis.service', 'birdnet_stats.service', 
        'birdnet_recording.service', 'chart_viewer.service', 'spectrogram_viewer.service'
    ]
    
    if action == "restart_all" or action == "stop_all":
        home_dir = os.path.expanduser('~')
        script = 'restart_services.sh' if action == 'restart_all' else 'stop_core_services.sh'
        script_path = os.path.join(home_dir, 'BirdNET-Pi', 'scripts', script)
        try:
            subprocess.run(['sudo', script_path], check=True)
            return {"status": "success", "message": f"Global {action} completed successfully."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    if action in allowed_actions and service in allowed_services:
        try:
            subprocess.run(["sudo", "systemctl", action, service], check=True)
            return {"status": "success", "message": f"{action} executed on {service}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    raise HTTPException(status_code=400, detail="Invalid action or service")

@router.post("/system_control")
async def control_system(payload: dict = Body(...)):
    action = payload.get("action")
    if action == "reboot":
        command = ["sudo", "/sbin/reboot"]
    elif action == "shutdown":
        command = ["sudo", "/sbin/shutdown", "now"]
    else:
        raise HTTPException(status_code=400, detail="Invalid system action")

    try:
        subprocess.Popen(command)
        return {"status": "success", "message": f"System is now performing: {action}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
