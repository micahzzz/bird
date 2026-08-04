from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import urllib.parse

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
# Add CORS middleware to allow requests from any origin
# This is important for development when the frontend and backend are on different ports
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# --- Routers ---
# Include the routers from their respective files
app.include_router(system.router, prefix="/api", tags=["System & Config"])
app.include_router(detections.router, prefix="/api", tags=["Detections & Stats"])
app.include_router(gallery.router, prefix="/api", tags=["Media Gallery"])
app.include_router(compiler.router, prefix="/api", tags=["Audio Compiler"])
app.include_router(streaming.router, prefix="/api", tags=["Live Streaming"])

# --- Static Frontend Assets ---
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# --- Root HTML Monolith Serving ---
@app.get("/", tags=["Root"])
async def read_root():
    """Serves the main index.html monolith from the project root."""
    index_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="index.html not found in project root directory.")

# --- Catch-All Media Fallback serving ---
@app.get("/{path:path}", tags=["Media Fallback"])
async def serve_media(path: str):
    """
    Serves .mp3, .wav, and spectrogram .png files directly from the local BirdSongs filesystem.
    Includes robust alternate-extension checks and directory traversal defense.
    """
    # Only serve recognized media/image assets
    if any(path.lower().endswith(ext) for ext in ['.mp3', '.wav', '.flac', '.m4a', '.png', '.jpg', '.jpeg']):
        home_dir = os.path.expanduser('~')
        
        # Sanitize and decode path to prevent directory traversal
        clean_path = os.path.normpath(urllib.parse.unquote(path).lstrip('/'))
        target_path = os.path.join(home_dir, 'BirdSongs', clean_path)

        # Enforce that path resolves within the BirdSongs root folder
        songs_dir = os.path.realpath(os.path.join(home_dir, 'BirdSongs'))
        if not os.path.realpath(target_path).startswith(songs_dir):
            raise HTTPException(status_code=403, detail="Access denied")

        # Handle alternate spectrogram extensions (e.g., .mp3.png or .wav.png)
        if not os.path.exists(target_path) and target_path.lower().endswith('.png'):
            for alt_ext in ['.mp3.png', '.wav.png']:
                alt_path = target_path[:-4] + alt_ext
                if os.path.exists(alt_path):
                    target_path = alt_path
                    break

        if os.path.exists(target_path) and os.path.isfile(target_path):
            return FileResponse(target_path)
            
        raise HTTPException(status_code=404, detail="Media file not found")
        
    raise HTTPException(status_code=404, detail="Not found")
