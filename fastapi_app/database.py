# database.py
import os
import sqlite3
from functools import lru_cache
from pathlib import Path

DB_NAME = "birds.db"

@lru_cache(maxsize=1)
def get_db_path() -> str:
    """
    Returns the BirdNET-Pi database path using this lookup order:
    1) DB_PATH environment variable
    2) ~/BirdNET-Pi/scripts/birds.db
    3) ~/BirdNET-Pi/birds.db
    4) ./data/birds.db
    """
    env_path = os.getenv("DB_PATH")
    if env_path:
        resolved = os.path.expanduser(env_path)
        if not os.path.exists(resolved):
            raise FileNotFoundError(
                f"DB_PATH environment variable is set but file does not exist: {resolved}"
            )
        return resolved

    candidate_paths = [
        Path.home() / "BirdNET-Pi" / "scripts" / DB_NAME,
        Path.home() / "BirdNET-Pi" / DB_NAME,
        Path.cwd() / "data" / DB_NAME,
    ]

    for candidate in candidate_paths:
        resolved = str(candidate.expanduser())
        if os.path.exists(resolved):
            return resolved

    raise FileNotFoundError(
        "Could not locate the BirdNET-Pi database. Checked the following locations: "
        f"{os.getenv('DB_PATH') or 'DB_PATH not set'}, "
        f"~/BirdNET-Pi/scripts/{DB_NAME}, "
        f"~/BirdNET-Pi/{DB_NAME}, "
        f"./data/{DB_NAME}"
    )


def setup_database(db_path: str = None) -> None:
    """
    Creates the required SQLite indexes to avoid slow detection queries.
    """
    if db_path is None:
        db_path = get_db_path()

    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database file not found at path: {db_path}")

    conn = sqlite3.connect(db_path, timeout=30)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_detections_date ON detections(Date);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_detections_com_name ON detections(Com_Name);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_detections_date_com_name ON detections(Date, Com_Name);"
        )
        conn.commit()
    finally:
        conn.close()


def get_db_connection() -> sqlite3.Connection:
    """
    Establishes and returns a connection to the SQLite database.
    Raises an exception if the database cannot be found.
    """
    db_path = get_db_path()
    if not os.path.exists(db_path):
        raise ConnectionError(f"Database file not found at the expected path: {db_path}")
    
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn
