# routers/compiler.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import os
import re
import time
import subprocess
import tempfile

router = APIRouter()

# --- Pydantic Models ---

class CompileRequest(BaseModel):
    species: str
    min_conf: float = Field(0.7, ge=0.0, le=1.0)
    limit: int = Field(25, le=50)
    start_date: Optional[str] = None
    end_date: Optional[str] = None

# --- API Endpoint ---

@router.post("/compile", summary="Compile an Audio Mix")
async def compile_audio_mix(req: CompileRequest):
    """
    Synchronously compiles an audio mix and returns the result.
    """
    target_species = req.species
    min_conf = req.min_conf
    limit = req.limit
    start_date = req.start_date
    end_date = req.end_date

    try:
        base_dir = os.path.expanduser('~/BirdSongs')
        mix_dir = os.path.join(base_dir, 'mixes')
        os.makedirs(mix_dir, exist_ok=True)
        
        valid_files = []
        for root, _, files in os.walk(base_dir):
            if "streamdata" in root.lower() or "mixes" in root.lower() or root == base_dir:
                continue
            for file in files:
                if file.endswith('.mp3'):
                    # Filter by date range if provided
                    if start_date or end_date:
                        date_match = re.search(r"\d{4}-\d{2}-\d{2}", file)
                        if date_match:
                            f_date = date_match.group(0)
                            if start_date and f_date < start_date: continue
                            if end_date and f_date > end_date: continue
                        else:
                            continue

                    # Attempt to parse filename to extract species and confidence
                    # Typically formats are like: Target_Species-0.89-2023-10-31... or Target_Species-89-2023-10-31
                    match = re.search(r"^(.*?)-(\d{1,3}(?:\.\d+)?)-\d{4}-\d{2}-\d{2}", file)
                    if match:
                        species = match.group(1).replace("_", " ")
                        conf_str = match.group(2)
                        
                        # Handle confidence scaled as 0-100 or 0-1
                        conf = float(conf_str)
                        if conf > 1.0:
                            conf = conf / 100.0
                            
                        if species == target_species and conf >= min_conf:
                            valid_files.append(os.path.join(root, file))
        
        valid_files.sort(key=os.path.getmtime, reverse=True)
        files_to_compile = valid_files[:limit]

        if not files_to_compile:
            raise HTTPException(status_code=404, detail=f"No files found for '{target_species}' matching criteria.")
        
        out_filename = f"{target_species.replace(' ', '_')}_Mix_{int(time.time())}.mp3"
        out_filepath = os.path.join(mix_dir, out_filename)
        
        list_fd, list_filepath = tempfile.mkstemp(suffix=".txt", prefix="ffmpeg_list_")
        try:
            with os.fdopen(list_fd, 'w') as f:
                for vf in files_to_compile:
                    f.write(f"file '{vf}'\n")

            cmd = [
                'ffmpeg', '-y', '-f', 'concat', '-safe', '0', 
                '-i', list_filepath, '-c', 'copy', out_filepath
            ]

            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
            web_path = f"/mixes/{out_filename}"
            return {"success": True, "file": web_path, "count": len(files_to_compile)}
        finally:
            if os.path.exists(list_filepath):
                os.remove(list_filepath)

    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"FFmpeg compilation failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error compiling mix: {e}")
