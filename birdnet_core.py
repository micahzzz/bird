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
    return config

def update_config(updates):
    if not os.path.exists(CONFIG_PATH): return False
    
    with open(CONFIG_PATH, 'r') as f:
        lines = f.readlines()
        
    with open(CONFIG_PATH, 'w') as f:
        for line in lines:
            updated = False
            if '=' in line and not line.startswith('#'):
                key = line.split('=', 1)[0].strip()
                if key in updates:
                    f.write(f'{key}="{updates[key]}"\n')
                    updated = True
            if not updated:
                f.write(line)
    return True

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


class SidecarHandler(http.server.SimpleHTTPRequestHandler):
    
    def get_db_path(self):
        paths = [
            os.path.expanduser('~/BirdNET-Pi/scripts/birds.db'),
            os.path.expanduser('~/BirdNET-Pi/birds.db'),
            os.path.expanduser('~/BirdSongs/birds.db'),
            '/home/pi/BirdNET-Pi/scripts/birds.db',
            '/home/birder/BirdNET-Pi/scripts/birds.db'
        ]
        return next((p for p in paths if os.path.exists(p)), None)

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            if self.path == '/api/compile':
                target_species = payload.get('species')
                min_conf = float(payload.get('min_conf', 0.7))
                limit = min(int(payload.get('limit', 25)), 30)
                start_date = payload.get('start_date')
                end_date = payload.get('end_date')
                
                if not target_species:
                    self.send_error(400, "Species required")
                    return
                
                base_dir = os.path.expanduser('~/BirdSongs')
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
                success = update_config(payload)
                self.send_response(200 if success else 500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": success}).encode())

            elif self.path == '/api/species_list/update':
                list_name = payload.get('list_name')
                content = payload.get('content', '')
                
                allowed_lists = {'confirmed': 'confirmed_species_list.txt', 'excluded': 'exclude_species_list.txt', 'whitelisted': 'whitelist_species_list.txt'}
                if list_name not in allowed_lists:
                    self.send_error(400, "Invalid species list name")
                    return

                list_path = os.path.join(os.path.expanduser('~/BirdNET-Pi'), allowed_lists[list_name])

                with open(list_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode())

            elif self.path == '/api/service_control':
                action = payload.get('action')
                service = payload.get('service')
                script_path = '/home/birder/BirdNET-Pi/scripts/'
                
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
                            # Whitelist of allowed system commands
                            actions = {
                                'reboot': ['sudo', '/sbin/reboot'],
                                'shutdown': ['sudo', '/sbin/shutdown', 'now']
                            }
                            if action in actions:
                                subprocess.Popen(actions[action]) # Popen because reboot/shutdown kills the process
                                self.send_response(200)
                                self.end_headers()
                            else:
                                self.send_error(400, "Invalid system action")
        except Exception as e:
            self.send_error(500, str(e))

    def do_GET(self):
        if self.path == '/api/detections':
            db_path = self.get_db_path()
            if not db_path:
                self.send_error(404, "Database not found")
                return
            try:
                conn = sqlite3.connect(db_path)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("SELECT Date, Time, Sci_Name, Com_Name, Confidence FROM detections ORDER BY Date DESC, Time DESC LIMIT 500")
                rows = cursor.fetchall()
                
                detections_with_insights = []
                for row in rows:
                    detection_dict = dict(row)
                    insight = get_insight(detection_dict['Com_Name'], detection_dict['Date'])
                    detection_dict['insight'] = insight
                    detections_with_insights.append(detection_dict)
                
                conn.close()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(detections_with_insights).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
                
        elif self.path == '/api/system':
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

        elif self.path == '/api/services/status':
            try:
                services = [
                    'livestream.service', 'icecast2.service', 'web_terminal.service', 
                    'birdnet_log.service', 'birdnet_analysis.service', 'birdnet_stats.service', 
                    'birdnet_recording.service', 'chart_viewer.service', 'spectrogram_viewer.service'
                ]
                status_data = {}
                for s in services:
                    active_res = subprocess.run(['systemctl', 'is-active', s], capture_output=True, text=True)
                    enabled_res = subprocess.run(['systemctl', 'is-enabled', s], capture_output=True, text=True)
                    status_data[s] = {
                        "active": active_res.stdout.strip(),
                        "enabled": enabled_res.stdout.strip()
                    }
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(status_data).encode())
            except Exception as e:
                self.send_error(500, str(e))
                
        elif self.path == '/api/config':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(get_config()).encode())
            
        elif self.path == '/api/log':
            try:
                log_output = subprocess.getoutput("journalctl -u birdnet_analysis.service -n 100 --no-pager")
                self.send_response(200)
                self.send_header('Content-type', 'text/plain')
                self.end_headers()
                self.wfile.write(log_output.encode())
            except Exception as e:
                self.send_error(500, str(e))

        elif self.path == '/api/gallery':
            try:
                recent = []
                best_map = {}
                valid_exts = {'.wav', '.mp3', '.flac', '.m4a'}
                
                base_dir = os.path.expanduser('~/BirdSongs')
                
                for root, _, files in os.walk(base_dir):
                    if "streamdata" in root.lower() or "mixes" in root.lower() or root == base_dir: continue
                    for file in files:
                        if os.path.splitext(file)[1].lower() in valid_exts and "birdnet" in file.lower():
                            filepath = os.path.join(root, file)
                            try:
                                stat = os.stat(filepath)
                                match = re.search(r"^(.*?)-(\d{2,3})-\d{4}-\d{2}-\d{2}", file)
                                species = match.group(1).replace("_", " ") if match else "Unknown"
                                conf = float(match.group(2)) / 100.0 if match else 0.5
                                
                                web_path = filepath.replace(base_dir, '')
                                if web_path.startswith('/'): web_path = web_path[1:]
                                
                                file_obj = {
                                    "filepath": web_path,
                                    "filename": file,
                                    "species": species,
                                    "confidence": conf,
                                    "size_kb": stat.st_size // 1024,
                                    "mtime": stat.st_mtime,
                                    "date_str": re.search(r"\d{4}-\d{2}-\d{2}", file).group(0) if re.search(r"\d{4}-\d{2}-\d{2}", file) else "Unknown"
                                }
                                
                                recent.append(file_obj)
                                if species not in best_map or conf > best_map[species]["confidence"]:
                                    best_map[species] = file_obj
                            except Exception: pass
                
                recent.sort(key=lambda x: x["mtime"], reverse=True)
                payload = {"recent": recent[:200], "best": list(best_map.values())}
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode())
            except Exception as e:
                self.send_error(500, str(e))

        elif self.path.startswith('/api/species_list'):
            self.get_species_list()

        elif self.path == '/api/stream':
            config = get_config()
            password = config.get('BIRDNETPI_PASSWORD', '')
            
            hosts_to_try = ['localhost', '127.0.0.1', self.headers.get('Host', 'localhost').split(':')[0]]
            success = False
            last_err = ""
            
            for h in set(hosts_to_try):
                try:
                    stream_url = f"http://birdnet:{password}@{h}:8000/stream" if password else f"http://{h}:8000/stream"
                    req = urllib.request.Request(stream_url)
                    with urllib.request.urlopen(req, timeout=3) as response:
                        self.send_response(200)
                        self.send_header('Content-Type', 'audio/mpeg')
                        self.send_header('Access-Control-Allow-Origin', '*') 
                        self.send_header('Cache-Control', 'no-cache')
                        self.end_headers()
                        while True:
                            chunk = response.read(8192)
                            if not chunk: break
                            self.wfile.write(chunk)
                        success = True
                        break
                except Exception as e:
                    last_err = str(e)
                    continue
                    
            if not success:
                self.send_error(503, f"Stream proxy failed across all hosts: {last_err}")

        else:
            if self.path == '/': 
                self.path = '/index.html'
                
            if self.path.startswith('/images/'):
                clean_path = urllib.parse.unquote(self.path.replace('/images/', ''))
                target_path = os.path.join(os.path.expanduser('~/BirdNET-Pi/homepage/images'), clean_path)
                
                if os.path.exists(target_path):
                    try:
                        with open(target_path, 'rb') as f:
                            self.send_response(200)
                            if target_path.endswith('.svg'): 
                                self.send_header('Content-type', 'image/svg+xml')
                            elif target_path.endswith('.png'): 
                                self.send_header('Content-type', 'image/png')
                            self.end_headers()
                            self.wfile.write(f.read())
                        return
                    except Exception: pass
            
            if any(self.path.endswith(ext) for ext in ['.mp3', '.wav', '.png', '.jpg', '.jpeg']):
                clean_path = urllib.parse.unquote(self.path.lstrip('/'))
                target_path = os.path.join(os.path.expanduser('~/BirdSongs'), clean_path)
                
                if not os.path.exists(target_path) and target_path.endswith('.png'):
                    alt_mp3 = target_path[:-4] + '.mp3.png'
                    alt_wav = target_path[:-4] + '.wav.png'
                    if os.path.exists(alt_mp3):
                        target_path = alt_mp3
                    elif os.path.exists(alt_wav):
                        target_path = alt_wav

                if os.path.exists(target_path):
                    try:
                        with open(target_path, 'rb') as f:
                            self.send_response(200)
                            if target_path.endswith('.png'): self.send_header('Content-type', 'image/png')
                            elif target_path.endswith('.jpg') or target_path.endswith('.jpeg'): self.send_header('Content-type', 'image/jpeg')
                            else: self.send_header('Content-type', 'audio/mpeg')
                            self.end_headers()
                            self.wfile.write(f.read())
                        return
                    except Exception: pass
            
            try: 
                super().do_GET()
            except ConnectionError: 
                pass

    def get_species_list(self):
        try:
            list_name = self.path.split('?list=')[-1]
            allowed_lists = {'confirmed': 'confirmed_species_list.txt', 'excluded': 'exclude_species_list.txt', 'whitelisted': 'whitelist_species_list.txt'}
            
            if list_name not in allowed_lists:
                self.send_error(400, "Invalid species list name")
                return

            list_path = os.path.join(os.path.expanduser('~/BirdNET-Pi'), allowed_lists[list_name])
            
            content = ""
            if os.path.exists(list_path):
                with open(list_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"list_name": list_name, "content": content}).encode())

        except Exception as e:
            self.send_error(500, f"Error getting species list: {e}")


class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    # Build the history cache on startup
    db_path_for_cache = SidecarHandler.get_db_path(None)
    build_species_history_cache(db_path_for_cache)

    with ThreadingServer(("", PORT), SidecarHandler) as httpd:
        print(f"BirdNET Core Server active at http://localhost:{PORT}")
        try: httpd.serve_forever()
        except KeyboardInterrupt: httpd.server_close()