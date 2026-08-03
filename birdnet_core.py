#!/usr/bin/env python3
import http.server
import socketserver
import os
import json
import subprocess
import glob
import sqlite3
import csv
import io
import urllib.request
from urllib.parse import urlparse, parse_qs
import re
import tempfile
import time

PORT = 9999
CONFIG_PATH = os.path.expanduser('~/BirdNET-Pi/birdnet.conf')

def get_config():
    config = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, val = line.strip().split('=', 1)
                    config[key] = val.strip(' "\'\n')
    
    # Load APPRISE_SERVICES if exists
    apprise_path = os.path.expanduser('~/BirdNET-Pi/apprise.txt')
    if os.path.exists(apprise_path):
        with open(apprise_path, 'r', encoding='utf-8') as f:
            config['APPRISE_SERVICES'] = f.read()
    else:
        config['APPRISE_SERVICES'] = ''

    # Load APPRISE_NOTIFICATION_BODY if exists
    body_path = os.path.expanduser('~/BirdNET-Pi/body.txt')
    if os.path.exists(body_path):
        with open(body_path, 'r', encoding='utf-8') as f:
            config['APPRISE_NOTIFICATION_BODY'] = f.read()
    else:
        config['APPRISE_NOTIFICATION_BODY'] = ''
        
    return config

def update_config(updates):
    if not os.path.exists(CONFIG_PATH):
        return False, "Config file not found"

    # Define which keys should not have their values quoted
    unquoted_keys = {
        'LATITUDE', 'LONGITUDE', 'BIRDWEATHER_ID', 'APPRISE_NOTIFY_EACH_DETECTION',
        'APPRISE_NOTIFY_NEW_SPECIES', 'APPRISE_NOTIFY_NEW_SPECIES_EACH_DAY', 'APPRISE_WEEKLY_REPORT',
        'APPRISE_MINIMUM_SECONDS_BETWEEN_NOTIFICATIONS_PER_SPECIES', 'SF_THRESH', 'DATA_MODEL_VERSION',
        'PRIVACY_THRESHOLD', 'PURGE_THRESHOLD', 'MAX_FILES_SPECIES', 'CHANNELS', 'RECORDING_LENGTH',
        'EXTRACTION_LENGTH', 'HIGHPASS_FREQ', 'SILENCE_UPDATE_INDICATOR', 'AUTOMATIC_UPDATE',
        'RAW_SPECTROGRAM', 'RARE_SPECIES_THRESHOLD', 'OVERLAP', 'CONFIDENCE', 'SENSITIVITY',
        'FREQSHIFT_HI', 'FREQSHIFT_LO', 'FREQSHIFT_PITCH', 'FREQSHIFT_RECONNECT_DELAY'
    }

    try:
        # Separate Apprise services & notification body from standard config updates
        apprise_services = updates.pop('APPRISE_SERVICES', None)
        apprise_body = updates.pop('APPRISE_NOTIFICATION_BODY', None)

        if apprise_services is not None:
            apprise_path = os.path.expanduser('~/BirdNET-Pi/apprise.txt')
            with open(apprise_path, 'w', encoding='utf-8') as f:
                f.write(apprise_services)

        if apprise_body is not None:
            body_path = os.path.expanduser('~/BirdNET-Pi/body.txt')
            with open(body_path, 'w', encoding='utf-8') as f:
                f.write(apprise_body)

        if updates:
            with open(CONFIG_PATH, 'r') as f:
                content = f.read()

            for key, value in updates.items():
                # Sanitize value to prevent injection issues, although we control the keys
                value_str = str(value)
                
                # Decide on quoting
                formatted_value = value_str if key in unquoted_keys else f'"{value_str}"'
                
                # Pattern to find the key, optionally commented out
                pattern = re.compile(f"^(#\\s*)?{key}=.*", re.MULTILINE)
                
                if pattern.search(content):
                    # Key exists, so we replace it, making sure to uncomment it
                    content = pattern.sub(f"{key}={formatted_value}", content)
                else:
                    # Key doesn't exist, append it to the end
                    content += f"\n{key}={formatted_value}"
            
            with open(CONFIG_PATH, 'w') as f:
                f.write(content)
            
        return True, "Configuration updated successfully."
        
    except Exception as e:
        return False, str(e)

species_history_cache = {}

def build_species_history_cache(db_path):
    print("Building species history cache...")
    if not db_path:
        print("Database not found, cannot build cache.")
        return
    
    global species_history_cache
    new_cache = {}
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                Com_Name,
                MIN(Date) as first_seen,
                MAX(Date) as last_seen,
                COUNT(*) as total_count
            FROM
                detections
            GROUP BY
                Com_Name;
        """)
        for row in cursor.fetchall():
            new_cache[row[0]] = {"first_seen": row[1], "last_seen": row[2], "count": row[3]}
        conn.close()
        species_history_cache = new_cache
        print(f"Successfully built cache for {len(species_history_cache)} species.")
    except Exception as e:
        print(f"Error building species history cache: {e}")

def get_insight(species_name, detection_date):
    from datetime import datetime, timedelta

    insight = {"status": "Normal", "detail": ""}
    
    # Check for New Species
    if species_name not in species_history_cache:
        insight["status"] = "New"
        insight["detail"] = "This is the first time this species has been detected!"
        # Add to cache immediately to avoid duplicate 'New' flags for recent detections
        species_history_cache[species_name] = {"first_seen": detection_date, "last_seen": detection_date, "count": 1}
        return insight

    history = species_history_cache[species_name]
    
    # Check for Rare Species
    try:
        last_seen_date = datetime.strptime(history['last_seen'], '%Y-%m-%d')
        current_date = datetime.strptime(detection_date, '%Y-%m-%d')
        
        # Check if the last sighting was from *before* today
        if current_date > last_seen_date:
            days_since_seen = (current_date - last_seen_date).days
            if days_since_seen >= 30:
                insight["status"] = "Rare"
                insight["detail"] = f"Not seen for {days_since_seen} days."
    except (ValueError, TypeError):
        pass # Ignore malformed dates

    return insight

def setup_database(db_path):
    if not db_path:
        print("Database not found, skipping setup.")
        return
    print("Setting up database and ensuring indexes...")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Create indexes for faster queries
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_detections_date ON detections(Date);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_detections_com_name ON detections(Com_Name);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_detections_date_com_name ON detections(Date, Com_Name);")
        
        conn.commit()
        conn.close()
        print("Database indexes are in place.")
    except Exception as e:
        print(f"Error setting up database indexes: {e}")


class SidecarHandler(http.server.SimpleHTTPRequestHandler):
    # Set the server's root directory to be the script's directory
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.realpath(__file__)), **kwargs)

    def get_db_path(self):
        # Use robust paths based on the user's home directory
        home = os.path.expanduser('~')
        paths = [
            os.path.join(home, 'BirdNET-Pi', 'birds.db'),
            os.path.join(home, 'BirdNET-Pi', 'scripts', 'birds.db'),
        ]
        for path in paths:
            if os.path.exists(path):
                return path
        print("CRITICAL: Database not found at any known location.")
        return None

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            home_dir = os.path.expanduser('~')

            if self.path == '/api/compile':
                target_species = payload.get('species')
                min_conf = float(payload.get('min_conf', 0.7))
                limit = min(int(payload.get('limit', 25)), 30)
                start_date = payload.get('start_date')
                end_date = payload.get('end_date')
                
                if not target_species:
                    self.send_error(400, "Species required")
                    return
                
                base_dir = os.path.join(home_dir, 'BirdSongs')
                mix_dir = os.path.join(base_dir, 'mixes')
                os.makedirs(mix_dir, exist_ok=True)
                
                valid_files = []
                
                for root, _, files in os.walk(base_dir):
                    if "streamdata" in root.lower() or "mixes" in root.lower() or root == base_dir: 
                        continue
                    for file in files:
                        if file.endswith('.mp3') and "birdnet" in file.lower():
                            date_match = re.search(r"\d{4}-\d{2}-\d{2}", file)
                            if date_match:
                                f_date = date_match.group(0)
                                if start_date and f_date < start_date: continue
                                if end_date and f_date > end_date: continue

                            match = re.search(r"^(.*?)-(\d{2,3})-\d{4}-\d{2}-\d{2}", file)
                            if match:
                                species = match.group(1).replace("_", " ")
                                conf = float(match.group(2)) / 100.0
                                if species == target_species and conf >= min_conf:
                                    valid_files.append(os.path.join(root, file))
                
                valid_files = valid_files[:limit]
                
                if not valid_files:
                    self.send_response(404)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"error": "No files found matching criteria"}')
                    return
                
                out_filename = f"{target_species.replace(' ', '_')}_Mix_{int(time.time())}.mp3"
                out_filepath = os.path.join(mix_dir, out_filename)
                
                if len(valid_files) == 1:
                    cmd = ['ffmpeg', '-y', '-i', valid_files[0], '-c', 'copy', out_filepath]
                else:
                    inputs = []
                    for vf in valid_files:
                        inputs.extend(['-i', vf])
                    
                    filter_str = ""
                    for i in range(1, len(valid_files)):
                        if i == 1:
                            filter_str += f"[0:a][1:a]acrossfade=d=1.5:c1=tri:c2=tri[a{i}];"
                        else:
                            filter_str += f"[a{i-1}][{i}:a]acrossfade=d=1.5:c1=tri:c2=tri[a{i}];"
                    
                    filter_str = filter_str.rstrip(';')
                    cmd = ['ffmpeg', '-y'] + inputs + ['-filter_complex', filter_str, '-map', f"[a{len(valid_files)-1}]", out_filepath]

                subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                
                web_path = out_filepath.replace(base_dir, '')
                if web_path.startswith('/'): web_path = web_path[1:]
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "file": web_path, "count": len(valid_files)}).encode())
                
            elif self.path == '/api/config/update':
                editable_keys = [
                    'LATITUDE', 'LONGITUDE', 'CONFIDENCE', 'SENSITIVITY', 'OVERLAP', 
                    'PRIVACY_THRESHOLD', 'FULL_DISK', 'PURGE_THRESHOLD', 'MAX_FILES_SPECIES',
                    'REC_CARD', 'CHANNELS', 'RECORDING_LENGTH', 'EXTRACTION_LENGTH', 'HIGHPASS_FREQ', 'AUDIOFMT',
                    'MODEL', 'DATA_MODEL_VERSION', 'SF_THRESH', 'RARE_SPECIES_THRESHOLD', 
                    'SILENCE_UPDATE_INDICATOR', 'AUTOMATIC_UPDATE', 'RAW_SPECTROGRAM',
                    'APPRISE_SERVICES', 'APPRISE_NOTIFICATION_TITLE', 'APPRISE_NOTIFICATION_BODY', 'APPRISE_NOTIFY_EACH_DETECTION',
                    'APPRISE_NOTIFY_NEW_SPECIES', 'APPRISE_NOTIFY_NEW_SPECIES_EACH_DAY', 'APPRISE_WEEKLY_REPORT',
                    'APPRISE_MINIMUM_SECONDS_BETWEEN_NOTIFICATIONS_PER_SPECIES', 'APPRISE_ONLY_NOTIFY_SPECIES_NAMES',
                    'APPRISE_ONLY_NOTIFY_SPECIES_NAMES_2', 'SITE_NAME', 'BIRDWEATHER_ID', 'DATABASE_LANG', 
                    'TIMEZONE', 'CADDY_PWD', 'BIRDNETPI_URL'
                ]
                
                filtered_payload = {k: v for k, v in payload.items() if k in editable_keys}

                if not filtered_payload:
                    self.send_response(400)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "message": "No valid settings provided."}).encode())
                    return

                success, message = update_config(filtered_payload)
                self.send_response(200 if success else 500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": success, "message": message}).encode())

            elif self.path == '/api/config/test_notification':
                apprise_services = payload.get('apprise_services', '')
                title = payload.get('title', 'BirdNET-Pi Test')
                body = payload.get('body', 'This is a test notification from BirdNET-Pi.')
                
                # Create temporary files for body and config
                t_conf_fd, t_conf_path = tempfile.mkstemp()
                t_body_fd, t_body_path = tempfile.mkstemp()
                
                try:
                    with os.fdopen(t_conf_fd, 'w', encoding='utf-8') as f:
                        f.write(apprise_services)
                    with os.fdopen(t_body_fd, 'w', encoding='utf-8') as f:
                        f.write(body)
                    
                    python_bin = os.path.join(home_dir, 'BirdNET-Pi', 'birdnet', 'bin', 'python3')
                    script_path = os.path.join(home_dir, 'BirdNET-Pi', 'scripts', 'send_test_notification.py')
                    
                    cmd = [python_bin, script_path, '--body', t_body_path, '--config', t_conf_path, '--title', title]
                    # Run subprocess and capture output
                    res = subprocess.run(cmd, capture_output=True, text=True)
                    
                    success = res.returncode == 0
                    message = res.stdout + "\n" + res.stderr
                    
                    self.send_response(200 if success else 500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": success, "message": message}).encode('utf-8'))
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "message": str(e)}).encode('utf-8'))
                finally:
                    # Clean up temporary files
                    if os.path.exists(t_conf_path): os.remove(t_conf_path)
                    if os.path.exists(t_body_path): os.remove(t_body_path)

            elif self.path == '/api/species_list/update':
                list_name = payload.get('list_name')
                content = payload.get('content', '')
                
                allowed_lists = {'confirmed': 'confirmed_species_list.txt', 'excluded': 'exclude_species_list.txt', 'whitelisted': 'whitelist_species_list.txt'}
                if list_name not in allowed_lists:
                    self.send_error(400, "Invalid species list name")
                    return

                list_path = os.path.join(home_dir, 'BirdNET-Pi', allowed_lists[list_name])

                with open(list_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode())

            elif self.path == '/api/service_control':
                action = payload.get('action')
                service = payload.get('service')
                script_path = os.path.join(home_dir, 'BirdNET-Pi', 'scripts')
                
                allowed_actions = ['stop', 'restart', 'enable', 'disable']
                allowed_services = [
                    'livestream.service', 'icecast2.service', 'web_terminal.service', 
                    'birdnet_log.service', 'birdnet_analysis.service', 'birdnet_stats.service', 
                    'birdnet_recording.service', 'chart_viewer.service', 'spectrogram_viewer.service'
                ]

                if action in ['restart_all', 'stop_all']:
                    script = 'restart_services.sh' if action == 'restart_all' else 'stop_core_services.sh'
                    subprocess.run(['sudo', os.path.join(script_path, script)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "message": f"Global {action} initiated."}).encode())
                
                elif action in allowed_actions and service in allowed_services:
                    subprocess.run(['sudo', 'systemctl', action, service], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "message": f"Service {service} action {action} initiated."}).encode())
                
                else:
                    self.send_error(400, "Invalid service control action or service name")
            
            elif self.path == '/api/services/restart':
                service = payload.get('service')
                if service in ['birdnet_analysis.service', 'icecast2.service']:
                    subprocess.run(['sudo', 'systemctl', 'restart', service], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True}).encode())
                else:
                    self.send_error(400, "Invalid service")
            elif self.path == '/api/system_control':
                action = payload.get('action')
                actions = {'reboot': ['sudo', '/sbin/reboot'], 'shutdown': ['sudo', '/sbin/shutdown', 'now']}
                if action in actions:
                    subprocess.Popen(actions[action])
                    self.send_response(200)
                    self.end_headers()
                else:
                    self.send_error(400, "Invalid system action")
        except Exception as e:
            self.send_error(500, str(e))

    def do_GET(self):
        # API endpoints are handled first
        if self.path.startswith('/api/'):
            # All API logic goes here...
            if self.path.startswith('/api/collage-stats'):
                try:
                    from datetime import datetime, timedelta
                    db_path = self.get_db_path()
                    if not db_path:
                        self.send_error(404, "Database not found")
                        return

                    query_params = parse_qs(urlparse(self.path).query)
                    days_str = query_params.get('days', ['30'])[0]

                    conn = sqlite3.connect(db_path)
                    cursor = conn.cursor()
                    
                    where_clause = ""
                    params = []
                    if days_str and days_str != 'all':
                        if days_str == 'today':
                            where_clause = "WHERE Date = date('now')"
                        elif days_str.isdigit():
                            where_clause = "WHERE Date >= date('now', ?)"
                            params.append(f'-{days_str} days')

                    query = f"SELECT Sci_Name, Com_Name, COUNT(*) as n, MAX(Date || ' ' || Time) as last_seen FROM detections {where_clause} GROUP BY Sci_Name, Com_Name ORDER BY n DESC"
                    
                    cursor.execute(query, params)
                    
                    species_data = [{'sci': r[0], 'com': r[1], 'n': r[2], 'last_seen': r[3]} for r in cursor.fetchall()]
                    conn.close()
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'species': species_data}).encode('utf-8'))

                except Exception as e:
                    self.send_error(500, f"Collage stats error: {e}")
                return

            if self.path.startswith('/api/detections'):
                db_path = self.get_db_path()
                if not db_path:
                    self.send_error(404, "Database not found")
                    return
                try:
                    query_components = parse_qs(urlparse(self.path).query)
                    limit = int(query_components.get('limit', [50])[0])
                    offset = int(query_components.get('offset', [0])[0])
                    sp = query_components.get('sp', [None])[0]
                    d_start = query_components.get('dStart', [None])[0]
                    d_end = query_components.get('dEnd', [None])[0]
                    t_start = query_components.get('tStart', [None])[0]
                    t_end = query_components.get('tEnd', [None])[0]
                    min_conf = float(query_components.get('minConf', [0])[0])

                    conn = sqlite3.connect(db_path)
                    conn.row_factory = sqlite3.Row
                    cursor = conn.cursor()

                    where_clauses = []
                    params = []

                    if sp and sp != 'all': where_clauses.append("Com_Name = ?"); params.append(sp)
                    if d_start: where_clauses.append("Date >= ?"); params.append(d_start)
                    if d_end: where_clauses.append("Date <= ?"); params.append(d_end)
                    if t_start: where_clauses.append("Time >= ?"); params.append(t_start)
                    if t_end: where_clauses.append("Time <= ?"); params.append(t_end)
                    if min_conf > 0: where_clauses.append("Confidence >= ?"); params.append(min_conf)

                    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
                    
                    cursor.execute(f"SELECT COUNT(*) FROM detections {where_sql}", params)
                    total_count = cursor.fetchone()[0]
                    
                    cursor.execute(f"SELECT Date, Time, Sci_Name, Com_Name, Confidence FROM detections {where_sql} ORDER BY Date DESC, Time DESC LIMIT ? OFFSET ?", params + [limit, offset])
                    
                    detections_with_insights = [dict(row, insight=get_insight(dict(row)['Com_Name'], dict(row)['Date'])) for row in cursor.fetchall()]
                    conn.close()

                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"detections": detections_with_insights, "total_count": total_count}).encode('utf-8'))
                except Exception as e:
                    self.send_error(500, str(e))
                return

            if self.path.startswith('/api/stats'):
                db_path = self.get_db_path()
                if not db_path:
                    self.send_error(404, "Database not found")
                    return
                try:
                    from datetime import datetime, timedelta
                    query_components = parse_qs(urlparse(self.path).query)
                    days_str = query_components.get('days', [None])[0]

                    today_str = datetime.now().strftime('%Y-%m-%d')
                    
                    conn = sqlite3.connect(db_path)
                    cursor = conn.cursor()

                    where_clause = ""
                    params = []
                    if days_str and days_str != 'all':
                        if days_str == 'today':
                            where_clause = "WHERE Date = ?"
                            params.append(today_str)
                        elif days_str.isdigit():
                            start_date = datetime.now() - timedelta(days=int(days_str))
                            where_clause = "WHERE Date >= ?"
                            params.append(start_date.strftime('%Y-%m-%d'))

                    cursor.execute(f"SELECT COUNT(*) FROM detections {where_clause}", params)
                    total_detections = cursor.fetchone()[0]
                    
                    cursor.execute(f"SELECT COUNT(DISTINCT Com_Name) FROM detections {where_clause}", params)
                    total_species = cursor.fetchone()[0]

                    cursor.execute(f"SELECT Com_Name, COUNT(*) as count FROM detections {where_clause} GROUP BY Com_Name ORDER BY count DESC", params)
                    species_counts = [{"Com_Name": r[0], "count": r[1]} for r in cursor.fetchall()]

                    cursor.execute("SELECT COUNT(*) FROM detections WHERE Date = ?", (today_str,))
                    today_detections = cursor.fetchone()[0]
                    
                    cursor.execute("SELECT COUNT(DISTINCT Com_Name) FROM detections WHERE Date = ?", (today_str,))
                    today_species = cursor.fetchone()[0]

                    last_hour_str = datetime.now().strftime('%H')
                    cursor.execute("SELECT COUNT(*) FROM detections WHERE Date = ? AND SUBSTR(Time, 1, 2) = ?", (today_str, last_hour_str))
                    hour_detections = cursor.fetchone()[0]

                    conn.close()

                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "total_detections": total_detections, "total_species": total_species,
                        "species_counts": species_counts, "today_detections": today_detections,
                        "today_species": today_species, "hour_detections": hour_detections
                    }).encode('utf-8'))
                except Exception as e:
                    self.send_error(500, str(e))
                return

            if self.path == '/api/system':
                try:
                    temp = subprocess.getoutput("cat /sys/class/thermal/thermal_zone0/temp")
                    temp_c = round(int(temp) / 1000.0, 1) if temp.isdigit() else 0.0
                    mem = subprocess.getoutput("free -m | awk 'NR==2 {printf \"%.1f\", $3*100/$2}'")
                    disk = subprocess.getoutput("df -h / | awk 'NR==2 {print $5}'").replace('%', '')
                    uptime = subprocess.getoutput("uptime -p").replace('up ', '')
                    data = {"temp": temp_c, "memory": float(mem) if mem else 0, "disk": int(disk) if disk.isdigit() else 0, "uptime": uptime}
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(data).encode())
                except Exception as e:
                    self.send_error(500, str(e))
                return

            if self.path == '/api/services/status':
                try:
                    services = ['livestream.service', 'icecast2.service', 'web_terminal.service', 'birdnet_log.service', 'birdnet_analysis.service', 'birdnet_stats.service', 'birdnet_recording.service', 'chart_viewer.service', 'spectrogram_viewer.service']
                    status_data = {}
                    for s in services:
                        active_res = subprocess.run(['systemctl', 'is-active', s], capture_output=True, text=True)
                        enabled_res = subprocess.run(['systemctl', 'is-enabled', s], capture_output=True, text=True)
                        status_data[s] = {"active": active_res.stdout.strip(), "enabled": enabled_res.stdout.strip()}
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(status_data).encode())
                except Exception as e:
                    self.send_error(500, str(e))
                return
            
            if self.path == '/api/config':
                self.send_response(200); self.send_header('Content-type', 'application/json'); self.end_headers()
                self.wfile.write(json.dumps(get_config()).encode())
                return
            
            if self.path == '/api/log':
                try:
                    log_output = subprocess.getoutput("journalctl -u birdnet_analysis.service -n 100 --no-pager")
                    self.send_response(200); self.send_header('Content-type', 'text/plain'); self.end_headers()
                    self.wfile.write(log_output.encode())
                except Exception as e:
                    self.send_error(500, str(e))
                return

            if self.path == '/api/gallery':
                try:
                    recent, best_map = [], {}
                    base_dir = os.path.join(os.path.expanduser('~'), 'BirdSongs')
                    for root, _, files in os.walk(base_dir):
                        if any(x in root.lower() for x in ["streamdata", "mixes"]) or root == base_dir: continue
                        for file in files:
                            if "birdnet" in file.lower() and os.path.splitext(file)[1].lower() in {'.wav', '.mp3', '.flac', '.m4a'}:
                                try:
                                    filepath = os.path.join(root, file)
                                    stat, match = os.stat(filepath), re.search(r"^(.*?)-(\d{2,3})-\d{4}-\d{2}-\d{2}", file)
                                    species, conf = (match.group(1).replace("_", " "), float(match.group(2)) / 100.0) if match else ("Unknown", 0.5)
                                    web_path = os.path.relpath(filepath, base_dir)
                                    file_obj = {
                                        "filepath": web_path, "filename": file, "species": species, "confidence": conf,
                                        "size_kb": stat.st_size // 1024, "mtime": stat.st_mtime,
                                        "date_str": (re.search(r"\d{4}-\d{2}-\d{2}", file) or ['Unknown'])[0]
                                    }
                                    recent.append(file_obj)
                                    if species not in best_map or conf > best_map[species]["confidence"]: best_map[species] = file_obj
                                except Exception: pass
                    recent.sort(key=lambda x: x["mtime"], reverse=True)
                    self.send_response(200); self.send_header('Content-type', 'application/json'); self.end_headers()
                    self.wfile.write(json.dumps({"recent": recent[:200], "best": list(best_map.values())}).encode())
                except Exception as e:
                    self.send_error(500, str(e))
                return

            if self.path.startswith('/api/species_list'):
                try:
                    list_name = parse_qs(urlparse(self.path).query).get('list', [None])[0]
                    allowed_lists = {'confirmed': 'confirmed_species_list.txt', 'excluded': 'exclude_species_list.txt', 'whitelisted': 'whitelist_species_list.txt'}
                    if list_name not in allowed_lists:
                        self.send_error(400, "Invalid list name"); return
                    
                    list_path = os.path.join(os.path.expanduser('~'), 'BirdNET-Pi', allowed_lists[list_name])
                    content = ""
                    if os.path.exists(list_path):
                        with open(list_path, 'r', encoding='utf-8') as f: content = f.read()
                    
                    self.send_response(200); self.send_header('Content-type', 'application/json'); self.end_headers()
                    self.wfile.write(json.dumps({"list_name": list_name, "content": content}).encode())
                except Exception as e:
                    self.send_error(500, f"Error getting list: {e}")
                return

            if self.path == '/api/stream':
                try:
                    config = get_config()
                    password = config.get('BIRDNETPI_PASSWORD', '')
                    host = self.headers.get('Host', 'localhost').split(':')[0]
                    stream_url = f"http://birdnet:{password}@{host}:8000/stream" if password else f"http://{host}:8000/stream"
                    
                    with urllib.request.urlopen(urllib.request.Request(stream_url), timeout=3) as response:
                        self.send_response(200); self.send_header('Content-Type', 'audio/mpeg'); self.end_headers()
                        while True:
                            chunk = response.read(8192)
                            if not chunk: break
                            self.wfile.write(chunk)
                except Exception as e:
                    self.send_error(503, f"Stream proxy failed: {e}")
                return

        # Fallback for serving files from outside the project directory (e.g., audio, spectrograms)
        # This is for requests that are not to the API or to /static
        if any(self.path.endswith(ext) for ext in ['.mp3', '.wav', '.png', '.jpg', '.jpeg']):
                home_dir = os.path.expanduser('~')
                # Sanitize path to prevent directory traversal
                clean_path = os.path.normpath(urllib.parse.unquote(self.path).lstrip('/'))
                
                # Construct path inside BirdSongs directory
                target_path = os.path.join(home_dir, 'BirdSongs', clean_path)

                # Ensure the resolved path is actually within BirdSongs
                if not os.path.realpath(target_path).startswith(os.path.join(home_dir, 'BirdSongs')):
                    self.send_error(403, "Access denied")
                    return

                # Handle alternate spectrogram extensions
                if not os.path.exists(target_path) and target_path.endswith('.png'):
                    for alt_ext in ['.mp3.png', '.wav.png']:
                        alt_path = target_path[:-4] + alt_ext
                        if os.path.exists(alt_path):
                            target_path = alt_path
                            break
                
                if os.path.exists(target_path):
                    try:
                        with open(target_path, 'rb') as f:
                            self.send_response(200)
                            if target_path.endswith('.png'): self.send_header('Content-type', 'image/png')
                            elif any(target_path.endswith(e) for e in ['.jpg', '.jpeg']): self.send_header('Content-type', 'image/jpeg')
                            else: self.send_header('Content-type', 'audio/mpeg')
                            self.end_headers()
                            self.wfile.write(f.read())
                        return
                    except Exception as e:
                        self.send_error(500, f"Failed to serve media: {e}")
                        return

        # If not an API call or special media file, serve from the script's directory
        # This handles index.html and /static files
        if self.path == '/':
            self.path = 'index.html'
        
        try:
            return super().do_GET()
        except (BrokenPipeError, ConnectionResetError):
            # These are common when the client closes the connection and are not critical server errors.
            pass


class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    db_path_main = SidecarHandler.get_db_path(None)
    
    # Set up database with indexes
    setup_database(db_path_main)

    # Build the history cache on startup
    build_species_history_cache(db_path_main)

    with ThreadingServer(("", PORT), SidecarHandler) as httpd:
        print(f"BirdNET Core Server active at http://localhost:{PORT}")
        try: httpd.serve_forever()
        except KeyboardInterrupt: httpd.server_close()