# routers/streaming.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx

router = APIRouter()

async def stream_generator():
    """
    Proxies the local Icecast audio stream from localhost:8000.
    """
    stream_url = "http://127.0.0.1:8000/stream"
    last_error = None

    async with httpx.AsyncClient(timeout=None) as client:
        try:
            async with client.stream("GET", stream_url, timeout=10.0) as response:
                if response.status_code != 200:
                    last_error = RuntimeError(f"Stream connection failed with status {response.status_code}")
                    raise HTTPException(status_code=503, detail=str(last_error))

                async for chunk in response.aiter_bytes(chunk_size=65536):
                    if chunk:
                        yield chunk
                return
        except httpx.RequestError as e:
            last_error = e

    detail = f"Could not connect to audio stream. {last_error}" if last_error else "Could not connect to audio stream."
    raise HTTPException(status_code=503, detail=detail)


@router.get("/stream", summary="Proxy the Live Audio Stream")
async def get_audio_stream():
    return StreamingResponse(
        stream_generator(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )
