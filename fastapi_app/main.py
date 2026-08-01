from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    detections.build_species_history_cache()


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

@app.get("/", tags=["Root"])
async def read_root():
    return {"message": "Welcome to the BirdNET-Pi Sidecar API!"}
