from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import urllib.parse

from fastapi_app.config import EXTRACTED_AUDIO_DIR
from fastapi_app.database import setup_database

# Import your routers here
from fastapi_app.routers import system, detections, gallery, compiler, streaming

# --- App Initialization ---
app = FastAPI(
    title="BirdNET-Pi Sidecar API",
    description="A modern API providing data and control for the BirdNET-Pi frontend.",
    version="1.0.0",
)

# --- Startup Event ---
@app.on_event("startup")
async def startup_event():
    """
    On startup, ensure the database is indexed and build the species
    history cache for 'new' or 'rare' species detections.
    """
    try:
        setup_database()
    except Exception as e:
        print(f"Error setting up database indexes on startup: {e}")

    try:
        detections.build_species_history_cache()
    except Exception as e:
        print(f"Error building startup cache: {e}")

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],  
)

# --- Routers ---
app.include_router(system.router, prefix="/api", tags=["System & Config"])
app.include_router(detections.router, prefix="/api/detections", tags=["Detections & Stats"])
app.include_router(gallery.router, prefix="/api", tags=["Media Gallery"])
app.include_router(streaming.router, prefix="/api", tags=["Live Streaming"])
app.include_router(compiler.router, prefix="/api", tags=["Audio Compiler"])

# --- Safe Static File Mounting ---
# Using absolute path resolution so FastAPI always finds the directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

home_dir = os.path.expanduser('~')
extracted_path = os.path.join(home_dir, 'BirdSongs', 'Extracted', 'By_Date')
by_date_path = os.path.join(home_dir, 'BirdSongs', 'By_Date')

if os.path.exists(extracted_path):
    app.mount("/By_Date", StaticFiles(directory=extracted_path), name="by_date")
elif os.path.exists(by_date_path):
    app.mount("/By_Date", StaticFiles(directory=by_date_path), name="by_date")
elif EXTRACTED_AUDIO_DIR.exists():
    app.mount("/By_Date", StaticFiles(directory=str(EXTRACTED_AUDIO_DIR)), name="by_date")

# --- Root/Media Fallback Serving ---
@app.get("/{path:path}", include_in_schema=False)
async def serve_root_or_media(path: str):
    """
    Catch-all to serve the root index.html, or media files from the BirdSongs directory.
    """
    sanitized_path = urllib.parse.unquote(path)
    
    # Serve index.html
    if sanitized_path in ("", "index.html", "/"):
        index_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="index.html not found.")

    # Serve Media Files
    if any(sanitized_path.lower().endswith(ext) for ext in ['.mp3', '.wav', '.flac', '.m4a', '.png', '.jpg', '.jpeg']):
        home_dir = os.path.expanduser('~')
        default_songs_dir = os.path.realpath(os.path.join(home_dir, 'BirdSongs'))

        try:
            # EXTRACTED_AUDIO_DIR is typically .../BirdSongs/Extracted/By_Date
            # Use two levels up to reach the BirdSongs root when possible
            if EXTRACTED_AUDIO_DIR and EXTRACTED_AUDIO_DIR.exists():
                songs_dir = os.path.realpath(str(EXTRACTED_AUDIO_DIR.parent.parent))
            else:
                songs_dir = default_songs_dir
        except Exception:
            songs_dir = default_songs_dir

        clean_path = os.path.normpath(sanitized_path).lstrip('/\\')
        target_path = os.path.join(songs_dir, clean_path)

        # Handle alternate spectrogram extensions
        if not os.path.exists(target_path) and target_path.lower().endswith('.png'):
            for alt_ext in ['.mp3.png', '.wav.png']:
                alt_path = target_path[:-4] + alt_ext
                if os.path.exists(alt_path):
                    target_path = alt_path
                    break

        # Security: Ensure the path is within the deduced songs_dir
        if os.path.exists(target_path) and os.path.realpath(target_path).startswith(songs_dir):
            if os.path.isfile(target_path):
                return FileResponse(target_path)
        else:
            raise HTTPException(status_code=404, detail="Media file not found")
            
    raise HTTPException(status_code=404, detail="Not found")