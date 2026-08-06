import os
from pathlib import Path

DEFAULT_EXTRACTED_AUDIO_DIR = Path.home() / "BirdSongs" / "Extracted" / "By_Date"
EXTRACTED_AUDIO_DIR = Path(
    os.path.expanduser(
        os.getenv("BIRDNET_AUDIO_DIR", str(DEFAULT_EXTRACTED_AUDIO_DIR))
    )
).resolve()
