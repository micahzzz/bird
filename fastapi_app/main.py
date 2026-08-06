from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import urllib.parse

from config import EXTRACTED_AUDIO_DIR

# Import your routers here
from routers import system, detections, gallery, compiler, streaming

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
    On startup, build the species history cache to provide insights
    on 'new' or 'rare' species detections.
    """
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
app.include_router(compiler.router, prefix="/api", tags=["Audio Compiler"])
app.include_router(streaming.router, prefix="/api", tags=["Live Streaming"])

# --- Safe Static File Mounting ---
# Using absolute path resolution so FastAPI always finds the directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

if EXTRACTED_AUDIO_DIR.exists():
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
        songs_dir = os.path.realpath(os.path.join(home_dir, 'BirdSongs'))
        
        clean_path = os.path.normpath(sanitized_path).lstrip('/\\')
        target_path = os.path.join(songs_dir, clean_path)

        # Handle alternate spectrogram extensions
        if not os.path.exists(target_path) and target_path.lower().endswith('.png'):
            for alt_ext in ['.mp3.png', '.wav.png']:
                alt_path = target_path[:-4] + alt_ext
                if os.path.exists(alt_path):
                    target_path = alt_path
                    break

        # Security: Ensure the path is within BirdSongs
        if os.path.exists(target_path) and os.path.realpath(target_path).startswith(songs_dir):
            if os.path.isfile(target_path):
                return FileResponse(target_path)
        else:
            raise HTTPException(status_code=404, detail="Media file not found")
            
    raise HTTPException(status_code=404, detail="Not found")