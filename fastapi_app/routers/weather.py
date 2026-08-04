# fastapi_app/routers/weather.py
from fastapi import APIRouter, HTTPException, Query
import httpx
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/weather", summary="Get historical weather data")
async def get_weather_data(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
):
    """
    Fetches historical weather data from Open-Meteo.
    """
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max",
        "timezone": "auto"
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from weather API: {e.response.text}")
        except httpx.RequestError as e:
            raise HTTPException(status_code=500, detail=f"Could not connect to weather API: {e}")
