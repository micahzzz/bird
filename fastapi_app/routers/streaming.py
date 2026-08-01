# routers/streaming.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx

# Import the config parser from the system router.
# For a larger app, this might live in a shared 'utils' module.
from .system import parse_config, CONFIG_PATH

router = APIRouter()

async def stream_generator():
    """
    A generator function that connects to the local Icecast stream and yields
    audio chunks as they are received.
    """
    config = parse_config(CONFIG_PATH)
    password = config.get('BIRDNETPI_PASSWORD', '')
    
    # Define potential hostnames to try for the Icecast server
    hosts_to_try = ['localhost', '127.0.0.1']
    stream_url_template = "http://birdnet:{password}@{host}:8000/stream" if password else "http://{host}:8000/stream"
    
    last_error = None
    
    # Use an async client to make the streaming request
    async with httpx.AsyncClient() as client:
        for host in hosts_to_try:
            stream_url = stream_url_template.format(password=password, host=host)
            try:
                print(f"Attempting to connect to stream at: {stream_url}")
                async with client.stream("GET", stream_url, timeout=5) as response:
                    # If we get a successful status code, start streaming
                    if response.status_code == 200:
                        print("Stream connection successful. Proxying audio...")
                        async for chunk in response.aiter_bytes():
                            yield chunk
                        # If the stream ends, we break the loop and the function finishes.
                        return 
            except httpx.RequestError as e:
                last_error = e
                print(f"Failed to connect to {host}: {e}")
                continue # Try the next host

    # If all hosts failed, raise an error
    print(f"Fatal: Could not connect to Icecast stream on any host. Last error: {last_error}")
    # This part will likely not be sent to the client if the stream fails to open,
    # but it's good practice for debugging on the server side.


@router.get("/stream", summary="Proxy the Live Audio Stream")
async def get_audio_stream():
    """
    Proxies the local Icecast audio stream.
    
    This uses a `StreamingResponse` to efficiently send audio chunks to the client
    as they are received from Icecast, without loading the entire stream into memory.
    """
    return StreamingResponse(stream_generator(), media_type="audio/mpeg")
