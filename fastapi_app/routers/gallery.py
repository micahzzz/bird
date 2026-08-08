# routers/gallery.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import os
import re
from pathlib import Path
from typing import List

from fastapi_app.config import EXTRACTED_AUDIO_DIR

router = APIRouter()

# --- Pydantic Models ---

class FileObject(BaseModel):
    filepath: str
    filename: str
    species: str
    confidence: float
    size_kb: int = Field(..., alias="size_kb")
    mtime: float
    date_str: str

class GalleryResponse(BaseModel):
    recent: List[FileObject]
    best: List[FileObject]

# --- API Endpoint ---

@router.get("/gallery", response_model=GalleryResponse, summary="Get Recent and Best Recordings")
def get_gallery():
    """
    Scans the BirdSongs directory to find all recordings.
    
    - Returns the 200 most recent recordings.
    - Returns the single best (highest confidence) recording for every unique species.
    
    This is a synchronous endpoint because it performs heavy, blocking I/O.
    FastAPI is smart and will run it in a separate thread from the main event loop.
    """
    try:
        recent = []
        best_map = {}
        valid_exts = {'.wav', '.mp3', '.flac', '.m4a'}
        base_dir = Path(os.path.expanduser('~/BirdSongs'))

        if not base_dir.is_dir():
            raise HTTPException(status_code=404, detail=f"Base directory '{base_dir}' not found.")

        for root, _, files in os.walk(str(base_dir)):
            for file in files:
                if os.path.splitext(file)[1].lower() in valid_exts and "birdnet" in file.lower():
                    filepath = os.path.join(root, file)
                    try:
                        stat = os.stat(filepath)
                        match = re.search(r"^(.*?)-(\d{2,3})-(\d{4}-\d{2}-\d{2})", file)
                        species = match.group(1).replace("_", " ") if match else "Unknown"
                        confidence = float(match.group(2)) / 100.0 if match else 0.0
                        date_str = match.group(3) if match else (re.search(r"\d{4}-\d{2}-\d{2}", file).group(0) if re.search(r"\d{4}-\d{2}-\d{2}", file) else "Unknown")

                        rel_path = Path(root, file).relative_to(base_dir).as_posix()
                        if rel_path.startswith("Extracted/"):
                            rel_path = rel_path[len("Extracted/"):]
                        
                        file_obj = {
                            "filepath": rel_path,
                            "filename": file,
                            "species": species,
                            "confidence": confidence,
                            "size_kb": stat.st_size // 1024,
                            "mtime": stat.st_mtime,
                            "date_str": date_str
                        }

                        recent.append(file_obj)
                        if species not in best_map or confidence > best_map[species]["confidence"]:
                            best_map[species] = file_obj
                    except (AttributeError, IndexError, ValueError):
                        continue

        recent.sort(key=lambda x: x["mtime"], reverse=True)
        return {"recent": recent[:200], "best": list(best_map.values())}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan gallery: {str(e)}")
