# routers/streaming.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx

# Import the robust config parser from the system router.
from .system import get_config_full

router = APIRouter()

async def stream_generator():
    """
    A generator function that connects to the local Icecast stream and yields
    audio chunks as they are received.
    """
    config = get_config_full()
    password = config.get('BIRDNETPI_PASSWORD', '')
    
    # Define potential hostnames to try for the Icecast server
    hosts_to_try = ['localhost', '127.0.0.1']
    stream_url_template = "http://birdnet:{password}@{host}:8000/stream" if password else "http://{host}:8000/stream"
    
    last_error = None
    
    # Use an async client to make the streaming request
    async with httpx.AsyncClient(timeout=None) as client:
        for host in hosts_to_try:
            stream_url = stream_url_template.format(password=password, host=host)
            try:
                print(f"Attempting to connect to stream at: {stream_url}")
                async with client.stream("GET", stream_url, timeout=10.0) as response:
                    if response.status_code != 200:
                        last_error = RuntimeError(f"Stream connection failed with status {response.status_code}")
                        print(f"Stream connection failed on {host}: {response.status_code}")
                        continue

                    print("Stream connection successful. Proxying audio...")
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        if chunk:
                            yield chunk
                    return
            except httpx.RequestError as e:
                last_error = e
                print(f"Failed to connect to {host}: {e}")
                continue

    detail = f"Could not connect to audio stream. {last_error}" if last_error else "Could not connect to audio stream."
    raise HTTPException(status_code=503, detail=detail)


@router.get("/stream", summary="Proxy the Live Audio Stream")
async def get_audio_stream():
    """
    Proxies the local Icecast audio stream.
    
    This uses a `StreamingResponse` to efficiently send audio chunks to the client
    as they are received from Icecast, without loading the entire stream into memory.
    """
    return StreamingResponse(
        stream_generator(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )
