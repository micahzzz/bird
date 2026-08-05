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

# --- Root/Media Fallback Serving ---
@app.get("/{path:path}", include_in_schema=False)
async def serve_root_or_media(path: str):
    """
    Catch-all to serve the root index.html, or media files from the BirdSongs directory.
    This is the fallback for any path not matching an API route or a file in /static.
    """
    sanitized_path = urllib.parse.unquote(path)
    # Requests for the root should serve index.html
    if sanitized_path in ("", "index.html", "/"):
        index_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="index.html not found in project root directory.")

    # Otherwise, try to serve it as a media file
    if any(sanitized_path.lower().endswith(ext) for ext in ['.mp3', '.wav', '.flac', '.m4a', '.png', '.jpg', '.jpeg']):
        home_dir = os.path.expanduser('~')
        songs_dir = os.path.realpath(os.path.join(home_dir, 'BirdSongs'))
        
        # Sanitize and create the full path
        clean_path = os.path.normpath(sanitized_path).lstrip('/\\')
        target_path = os.path.join(songs_dir, clean_path)

        # Handle alternate spectrogram extensions BEFORE checking for existence/traversal
        if not os.path.exists(target_path) and target_path.lower().endswith('.png'):
            for alt_ext in ['.mp3.png', '.wav.png']:
                alt_path = target_path[:-4] + alt_ext
                if os.path.exists(alt_path):
                    target_path = alt_path
                    break

        # Security: Ensure the final path is still within the BirdSongs directory
        if os.path.exists(target_path) and os.path.realpath(target_path).startswith(songs_dir):
            if os.path.isfile(target_path):
                return FileResponse(target_path)
        else:
            # If the file doesn't exist OR it's a directory traversal attempt, 404/403
            # We return 404 to avoid leaking information about path structure.
            raise HTTPException(status_code=404, detail="Media file not found")
            
    # If it's not the root and not a recognized media file, it's a 404
    raise HTTPException(status_code=404, detail="Not found")
