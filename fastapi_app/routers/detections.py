# routers/detections.py
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Dict, Literal, Any, Optional
from datetime import datetime, timedelta
from pathlib import Path
import re
import sqlite3

from fastapi_app.config import EXTRACTED_AUDIO_DIR
# Import the centralized database connection function
from fastapi_app.database import get_db_connection

router = APIRouter()

# --- Pydantic Models ---
# These models define the structure of the API responses.
# FastAPI uses them to validate data, serialize responses, and generate documentation.

class Insight(BaseModel):
    status: Literal["Normal", "New", "Rare"]
    days_since_last_seen: Optional[int] = Field(None, description="Number of days since this species was last detected. Only present if status is 'Rare'.")

class Detection(BaseModel):
    date: str = Field(..., alias="Date")
    time: str = Field(..., alias="Time")
    sci_name: str = Field(..., alias="Sci_Name")
    com_name: str = Field(..., alias="Com_Name")
    confidence: float = Field(..., alias="Confidence")
    media_url: Optional[str] = None
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

class CollageSpecies(BaseModel):
    sci: str = Field(..., alias="Sci_Name")
    com: str = Field(..., alias="Com_Name")
    n: int
    last_seen: str

class CollageResponse(BaseModel):
    species: List[CollageSpecies]



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


def resolve_detection_media_url(date: str, common_name: str, file_name: str) -> Optional[str]:
    if not file_name or not date or not common_name:
        return None

    safe_species = re.sub(r'\s+', '_', common_name.strip())
    safe_species = re.sub(r'[^\w\-]', '_', safe_species)

    # Prefer the exact date/species layout used by the extractor
    candidate_paths = [
        EXTRACTED_AUDIO_DIR / date / safe_species / file_name,
        EXTRACTED_AUDIO_DIR / date / file_name,
    ]

    for path in candidate_paths:
        if path.is_file():
            rel_path = path.relative_to(EXTRACTED_AUDIO_DIR).as_posix()
            return f"/By_Date/{rel_path}"

    # If the file isn't present yet, still return the expected external path.
    return f"/By_Date/{date}/{safe_species}/{file_name}"


# --- API Endpoints ---

@router.get("/detections", response_model=DetectionsResponse, summary="Get Paginated Detections")
def get_detections(
    limit: int = 50,
    offset: int = 0,
    sp: Optional[str] = Query(None, description="Filter by common name (e.g., 'American Robin')."),
    dStart: Optional[str] = Query(None, description="Start date in YYYY-MM-DD format."),
    dEnd: Optional[str] = Query(None, description="End date in YYYY-MM-DD format."),
    tStart: Optional[str] = Query(None, description="Start time in HH:MM:SS format."),
    tEnd: Optional[str] = Query(None, description="End time in HH:MM:SS format."),
    minConf: float = Query(0, ge=0, le=1, description="Minimum confidence level (0.0 to 1.0).")
):
    """
    Provides a paginated and filterable list of all bird detections.
    """
    where_clauses = []
    params = []

    if sp and sp != 'all':
        where_clauses.append("LOWER(Com_Name) LIKE LOWER(?)")
        params.append(f"%{sp}%")
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
        
        query = f"SELECT Date, Time, Sci_Name, Com_Name, Confidence, File_Name FROM detections {where_sql} ORDER BY Date DESC, Time DESC LIMIT ? OFFSET ?"
        cursor.execute(query, params + [limit, offset])
        rows = cursor.fetchall()
        conn.close()

        # Only return the requested detection fields, plus insight.
        detections_with_insights = []
        for row in rows:
            row_dict = dict(row)
            file_name = row_dict.get('File_Name')
            detection = {
                "Date": row_dict.get('Date'),
                "Time": row_dict.get('Time'),
                "Sci_Name": row_dict.get('Sci_Name'),
                "Com_Name": row_dict.get('Com_Name'),
                "Confidence": row_dict.get('Confidence'),
                "insight": get_insight(row_dict.get('Com_Name'), row_dict.get('Date'))
            }
            if file_name:
                media_url = resolve_detection_media_url(row_dict.get('Date'), row_dict.get('Com_Name'), file_name)
                detection["media_url"] = media_url
            detections_with_insights.append(detection)
        
        return {"detections": detections_with_insights, "total_count": total_count}

    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {e}")


@router.get("/species")
@router.get("/detections/species", response_model=List[str], summary="Get all species list")
def get_all_species():
    db_path = get_db_path()
    if not db_path or not os.path.exists(db_path):
        return []
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT Com_Name FROM detections WHERE Com_Name IS NOT NULL AND Com_Name != '' ORDER BY Com_Name;")
    species_list = [r[0] for r in cursor.fetchall()]
    conn.close()
    return species_list


@router.get("/detections/stats", response_model=Stats, summary="Get Aggregate Statistics")
def get_stats(
    days: str = Query("30", description="Timeframe to filter stats (e.g., '7', '30', 'today', 'all')."),
    species_of_interest: Optional[str] = Query(None, description="Get daily counts for a specific species.")
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
                where_clause = "WHERE Date >= date('now', ?)"
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



@router.get("/stats/hourly", summary="Get Hourly Detection Stats for the Last 24 Hours")
def get_hourly_stats():
    """
    Provides the number of detections for each of the last 24 hours.
    The keys of the returned dictionary are hours from 0 to 23.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Query for detections in the last 24 hours
        query = """
            SELECT
                strftime('%H', Time) as hour,
                COUNT(*) as count
            FROM
                detections
            WHERE
                (julianday('now', 'localtime') - julianday(Date || ' ' || Time)) * 24 <= 24
            GROUP BY
                hour
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        # Initialize a dictionary for all 24 hours to ensure the chart is complete
        hourly_counts = {f"{h:02d}": 0 for h in range(24)}
        for row in rows:
            hourly_counts[row['hour']] = row['count']

        return hourly_counts

    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {e}")


@router.get("/detections/collage-stats", response_model=CollageResponse, summary="Get species stats for collage view")
def get_collage_stats(
    days: Optional[str] = Query("7", description="Timeframe to filter stats (e.g., '7', '30', 'today', 'all').")
):
    """
    Provides aggregated species data tailored for the collage visualization.
    For each species, it returns the scientific name, common name, total detection count,
    and the timestamp of the last sighting within the specified timeframe.
    """
    where_clause = ""
    params = []
    if days and days != 'all':
        if days == 'today':
            where_clause = "WHERE Date = date('now', 'localtime')"
        elif days.isdigit():
            where_clause = "WHERE Date >= date('now', 'localtime', ?)"
            params.append(f'-{int(days)} days')

    query = f"""
        SELECT
            Sci_Name,
            Com_Name,
            COUNT(*) as n,
            MAX(Date || ' ' || Time) as last_seen
        FROM
            detections
        {where_clause}
        GROUP BY
            Sci_Name, Com_Name
        ORDER BY
            last_seen DESC
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        # Pydantic will automatically handle the alias mapping from the DB columns
        # to the model fields (e.g., Sci_Name -> sci).
        return {"species": [dict(row) for row in rows]}

    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {e}")
