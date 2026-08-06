# routers/gallery.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import os
import re
from pathlib import Path
from typing import List

from config import EXTRACTED_AUDIO_DIR

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
        base_dir = EXTRACTED_AUDIO_DIR if EXTRACTED_AUDIO_DIR.exists() else Path(os.path.expanduser('~/BirdSongs'))

        if not base_dir.is_dir():
            raise HTTPException(status_code=404, detail=f"Base directory '{base_dir}' not found.")

        for root, _, files in os.walk(str(base_dir)):
            # Skip directories that are unlikely to contain valid recordings
            if "streamdata" in root.lower() or "mixes" in root.lower() or root == base_dir:
                continue

            for file in files:
                if os.path.splitext(file)[1].lower() in valid_exts and "birdnet" in file.lower():
                    filepath = os.path.join(root, file)
                    try:
                        stat = os.stat(filepath)
                        # Regex to parse 'Species_Name-CONF-YYYY-MM-DD-HH-MM-SS.mp3'
                        match = re.search(r"^(.*?)-(\d{2,3})-\d{4}-\d{2}-\d{2}", file)
                        species = match.group(1).replace("_", " ") if match else "Unknown"
                        conf = float(match.group(2)) / 100.0 if match else 0.5
                        
                        # Make the web path relative to the base directory
                        rel_path = os.path.relpath(filepath, base_dir)
                        if base_dir == EXTRACTED_AUDIO_DIR:
                            rel_path = rel_path.replace(os.sep, '/')
                            web_path = f"/By_Date/{rel_path}"
                        else:
                            web_path = rel_path
                        
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
                        
                        # If this species isn't in our 'best' map, or if this file has higher confidence, update it.
                        if species not in best_map or conf > best_map[species]["confidence"]:
                            best_map[species] = file_obj
                    
                    except (AttributeError, IndexError, ValueError):
                        # Ignore files with malformed names that don't match the regex
                        continue
        
        # Sort recent files by modification time, newest first, and limit to 200
        recent.sort(key=lambda x: x["mtime"], reverse=True)
        
        return {"recent": recent[:200], "best": list(best_map.values())}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan gallery: {str(e)}")
