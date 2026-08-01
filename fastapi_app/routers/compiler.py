# routers/compiler.py
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
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
    limit: int = Field(25, le=50) # Set a reasonable upper limit
    start_date: str | None = None
    end_date: str | None = None

# --- Background Task ---

def run_ffmpeg_compilation(
    target_species: str, 
    min_conf: float, 
    limit: int, 
    start_date: str | None, 
    end_date: str | None
):
    """
    This function runs in the background. It finds relevant files
    and uses ffmpeg to compile them into a single audio mix.
    """
    print(f"BACKGROUND: Starting compilation for '{target_species}'...")
    try:
        base_dir = os.path.expanduser('~/BirdSongs')
        mix_dir = os.path.join(base_dir, 'mixes')
        os.makedirs(mix_dir, exist_ok=True)
        
        valid_files = []
        for root, _, files in os.walk(base_dir):
            if "streamdata" in root.lower() or "mixes" in root.lower() or root == base_dir:
                continue
            for file in files:
                if file.endswith('.mp3') and "birdnet" in file.lower():
                    # Filter by date range if provided
                    if start_date or end_date:
                        date_match = re.search(r"\d{4}-\d{2}-\d{2}", file)
                        if date_match:
                            f_date = date_match.group(0)
                            if start_date and f_date < start_date: continue
                            if end_date and f_date > end_date: continue
                        else:
                            continue # Skip files without a date if filtering is active

                    # Filter by species and confidence
                    match = re.search(r"^(.*?)-(\d{2,3})-\d{4}-\d{2}-\d{2}", file)
                    if match:
                        species = match.group(1).replace("_", " ")
                        conf = float(match.group(2)) / 100.0
                        if species == target_species and conf >= min_conf:
                            valid_files.append(os.path.join(root, file))
        
        # Take the most recent files up to the limit
        valid_files.sort(key=os.path.getmtime, reverse=True)
        files_to_compile = valid_files[:limit]

        if not files_to_compile:
            print(f"BACKGROUND: No files found for '{target_species}'. Aborting.")
            return

        print(f"BACKGROUND: Found {len(files_to_compile)} files. Starting ffmpeg...")
        
        out_filename = f"{target_species.replace(' ', '_')}_Mix_{int(time.time())}.mp3"
        out_filepath = os.path.join(mix_dir, out_filename)
        
        # Create a temporary file list for ffmpeg's concat demuxer.
        # This is high-performance and doesn't re-encode the audio.
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
            print(f"BACKGROUND: Compilation complete! Output at: {out_filepath}")
        finally:
            # Clean up the temporary file list
            if os.path.exists(list_filepath):
                os.remove(list_filepath)

    except Exception as e:
        print(f"BACKGROUND: Error during compilation for '{target_species}': {e}")


# --- API Endpoint ---

@router.post("/compile", status_code=202, summary="Compile an Audio Mix")
async def compile_audio_mix(req: CompileRequest, background_tasks: BackgroundTasks):
    """
    Accepts a request to compile an audio mix from existing recordings.
    
    This endpoint immediately returns a 202 'Accepted' response and
    starts the ffmpeg compilation process in the background to avoid
    blocking the server.
    """
    background_tasks.add_task(
        run_ffmpeg_compilation,
        req.species,
        req.min_conf,
        req.limit,
        req.start_date,
        req.end_date
    )
    return {"message": "Accepted: Audio compilation job started in the background.", "species": req.species}
