# routers/streaming.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import urllib.request
import os

router = APIRouter()

def stream_generator():
    """
    Proxies the local Icecast audio stream from localhost:8000.
    """
    password = ""
    conf_path = "/home/birder/BirdNET-Pi/birdnet.conf"
    if not os.path.exists(conf_path):
        conf_path = os.path.expanduser("~/BirdNET-Pi/birdnet.conf")
        
    if os.path.exists(conf_path):
        with open(conf_path, "r") as f:
            for line in f:
                if line.startswith("BIRDNETPI_PASSWORD="):
                    password = line.strip().split("=", 1)[1].strip('"\'')
                    break
                    
    stream_url = f"http://birdnet:{password}@127.0.0.1:8000/stream" if password else "http://127.0.0.1:8000/stream"

    try:
        with urllib.request.urlopen(stream_url) as response:
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                yield chunk
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not connect to audio stream. {e}")


@router.get("/stream", summary="Proxy the Live Audio Stream")
async def get_audio_stream():
    return StreamingResponse(
        stream_generator(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )
