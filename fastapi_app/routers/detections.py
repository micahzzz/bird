# routers/detections.py
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Dict, Literal, Any
from datetime import datetime, timedelta
import sqlite3

# Import the centralized database connection function
from database import get_db_connection

router = APIRouter()

# --- Pydantic Models ---
# These models define the structure of the API responses.
# FastAPI uses them to validate data, serialize responses, and generate documentation.

class Insight(BaseModel):
    status: Literal["Normal", "New", "Rare"]
    days_since_last_seen: int | None = Field(None, description="Number of days since this species was last detected. Only present if status is 'Rare'.")

class Detection(BaseModel):
    date: str = Field(..., alias="Date")
    time: str = Field(..., alias="Time")
    sci_name: str = Field(..., alias="Sci_Name")
    com_name: str = Field(..., alias="Com_Name")
    confidence: float = Field(..., alias="Confidence")
    insight: Insight

class DetectionsResponse(BaseModel):
    detections: List[Detection]
    total_count: int

class Stats(BaseModel):
    total_detections: int
    total_species: int
    today_detections: int
    today_species: int
    hour_detections: int
    detections_by_date: Dict[str, int] = {}
    species_by_date: Dict[str, Any] = {}


# --- In-Memory Cache for Species Insights ---
species_history_cache: Dict[str, Dict] = {}

def build_species_history_cache():
    """
    Queries the entire database to build a cache of the first and last time
    each species was seen. This is called once on server startup.
    """
    print("Building species history cache...")
    global species_history_cache
    new_cache = {}
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                Com_Name,
                MIN(Date) as first_seen,
                MAX(Date) as last_seen
            FROM
                detections
            GROUP BY
                Com_Name;
        """)
        for row in cursor.fetchall():
            new_cache[row["Com_Name"]] = {"first_seen": row["first_seen"], "last_seen": row["last_seen"]}
        conn.close()
        species_history_cache = new_cache
        print(f"Successfully built cache for {len(species_history_cache)} species.")
    except Exception as e:
        print(f"Error building species history cache: {e}")

def get_insight(species_name: str, detection_date: str) -> dict:
    """
    Checks a detection against the cache to determine if it's a new or rare sighting.
    Returns a machine-readable dictionary.
    """
    if species_name not in species_history_cache:
        # This is the first time this species has ever been detected.
        # Add it to the cache immediately to handle subsequent detections in the same response.
        species_history_cache[species_name] = {"first_seen": detection_date, "last_seen": detection_date}
        return {"status": "New"}

    history = species_history_cache[species_name]
    
    try:
        last_seen_date = datetime.strptime(history['last_seen'], '%Y-%m-%d')
        current_date = datetime.strptime(detection_date, '%Y-%m-%d')
        
        # Check if the last sighting was from a day *before* the current detection's date.
        if current_date > last_seen_date:
            days_since_seen = (current_date - last_seen_date).days
            if days_since_seen >= 30:
                # It's been a month or more since this bird was last seen.
                return {"status": "Rare", "days_since_last_seen": days_since_seen}
    except (ValueError, TypeError):
        pass  # Ignore malformed dates in the database.

    return {"status": "Normal"}


# --- API Endpoints ---

@router.get("/detections", response_model=DetectionsResponse, summary="Get Paginated Detections")
async def get_detections(
    limit: int = 50,
    offset: int = 0,
    sp: str | None = Query(None, description="Filter by common name (e.g., 'American Robin')."),
    dStart: str | None = Query(None, description="Start date in YYYY-MM-DD format."),
    dEnd: str | None = Query(None, description="End date in YYYY-MM-DD format."),
    tStart: str | None = Query(None, description="Start time in HH:MM:SS format."),
    tEnd: str | None = Query(None, description="End time in HH:MM:SS format."),
    minConf: float = Query(0, ge=0, le=1, description="Minimum confidence level (0.0 to 1.0).")
):
    """
    Provides a paginated and filterable list of all bird detections.
    """
    where_clauses = []
    params = []

    if sp and sp != 'all':
        where_clauses.append("Com_Name = ?")
        params.append(sp)
    if dStart:
        where_clauses.append("Date >= ?")
        params.append(dStart)
    if dEnd:
        where_clauses.append("Date <= ?")
        params.append(dEnd)
    if tStart:
        where_clauses.append("Time >= ?")
        params.append(tStart)
    if tEnd:
        where_clauses.append("Time <= ?")
        params.append(tEnd)
    if minConf > 0:
        where_clauses.append("Confidence >= ?")
        params.append(minConf)

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Get total count matching the filter
        count_query = f"SELECT COUNT(*) FROM detections {where_sql}"
        cursor.execute(count_query, params)
        total_count = cursor.fetchone()[0]
        
        # Get the paginated data
        query = f"SELECT Date, Time, Sci_Name, Com_Name, Confidence FROM detections {where_sql} ORDER BY Date DESC, Time DESC LIMIT ? OFFSET ?"
        cursor.execute(query, params + [limit, offset])
        rows = cursor.fetchall()
        conn.close()

        # Add insights to each detection
        detections_with_insights = [
            dict(row, insight=get_insight(row['Com_Name'], row['Date'])) for row in rows
        ]
        
        return {"detections": detections_with_insights, "total_count": total_count}

    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {e}")


@router.get("/stats", response_model=Stats, summary="Get Aggregate Statistics")
async def get_stats(
    days: str | None = Query(None, description="Timeframe to filter stats (e.g., '7', '30', 'today', 'all')."),
    species_of_interest: str | None = Query(None, description="Get daily counts for a specific species.")
):
    """
    Provides aggregate statistics over a given timeframe.
    Also provides daily counts for detections and species for charts.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # --- Base filtering logic ---
        where_clause = ""
        params = []
        if days and days != 'all':
            if days == 'today':
                where_clause = "WHERE Date = date('now', 'localtime')"
            elif days.isdigit():
                where_clause = "WHERE Date >= date('now', 'localtime', ?)"
                params.append(f'-{int(days)} days')

        # --- Aggregate stats for dashboard cards ---
        cursor.execute(f"SELECT COUNT(*) FROM detections {where_clause}", params)
        total_detections = cursor.fetchone()[0]
        
        cursor.execute(f"SELECT COUNT(DISTINCT Com_Name) FROM detections {where_clause}", params)
        total_species = cursor.fetchone()[0]

        # --- Specific stats for sidebar/dashboard ---
        cursor.execute("SELECT COUNT(*) FROM detections WHERE Date = date('now', 'localtime')")
        today_detections = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT Com_Name) FROM detections WHERE Date = date('now', 'localtime')")
        today_species = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM detections WHERE Date = date('now', 'localtime') AND STRFTIME('%H', Time) = STRFTIME('%H', 'now', 'localtime')")
        hour_detections = cursor.fetchone()[0]

        # --- Data for charts ---
        detections_by_date = {}
        species_by_date = {}

        chart_params = list(params)
        chart_where_sql = where_clause
        
        if species_of_interest:
            # Logic for when a specific species history is requested
            interest_clause = "Com_Name = ?"
            chart_params.append(species_of_interest)
            if chart_where_sql:
                chart_where_sql += f" AND {interest_clause}"
            else:
                chart_where_sql = f"WHERE {interest_clause}"

            cursor.execute(f"SELECT Date, COUNT(*) FROM detections {chart_where_sql} GROUP BY Date ORDER BY Date", chart_params)
            
            species_counts = {row['Date']: row['COUNT(*)'] for row in cursor.fetchall()}
            species_by_date = {species_of_interest: species_counts}

        else:
            # Logic for the main analytics charts (Accumulation, Weather)
            cursor.execute(f"SELECT Date, Com_Name FROM detections {chart_where_sql} ORDER BY Date", chart_params)
            
            all_detections_for_period = cursor.fetchall()
            temp_species_by_date = {}

            for row in all_detections_for_period:
                date = row['Date']
                species = row['Com_Name']
                
                detections_by_date[date] = detections_by_date.get(date, 0) + 1
                
                if date not in temp_species_by_date:
                    temp_species_by_date[date] = set()
                temp_species_by_date[date].add(species)

            species_by_date = {k: list(v) for k, v in temp_species_by_date.items()}

        conn.close()

        return {
            "total_detections": total_detections,
            "total_species": total_species,
            "today_detections": today_detections,
            "today_species": today_species,
            "hour_detections": hour_detections,
            "detections_by_date": detections_by_date,
            "species_by_date": species_by_date
        }
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {e}")
