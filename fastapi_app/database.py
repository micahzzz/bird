# database.py
import os
import sqlite3
from functools import lru_cache

HOME_DIR = os.path.expanduser('~')
DB_PATH = os.path.join(HOME_DIR, 'BirdNET-Pi', 'scripts', 'birds.db')

@lru_cache(maxsize=1)
def get_db_path() -> str:
    """
    Returns the hardcoded path to the live BirdNET-Pi database.
    """
    return DB_PATH

def get_db_connection() -> sqlite3.Connection:
    """
    Establishes and returns a connection to the SQLite database.
    Raises an exception if the database cannot be found.
    """
    db_path = get_db_path()
    if not os.path.exists(db_path):
        raise ConnectionError(f"Database file not found at the expected path: {db_path}")
    
    conn = sqlite3.connect(db_path)
    # Use Row factory to allow accessing columns by name
    conn.row_factory = sqlite3.Row
    return conn
