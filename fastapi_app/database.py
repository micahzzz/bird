# database.py
import os
import sqlite3
from functools import lru_cache

# Use a least-recently-used cache to avoid repeatedly searching the filesystem.
@lru_cache(maxsize=1)
def get_db_path() -> str | None:
    """
    Finds the path to the birds.db file in common locations.
    Returns the path as a string or None if not found.
    """
    # A relative path for the local dev environment
    local_dev_path = os.path.realpath(os.path.join(
        os.path.dirname(__file__), '..', 'legacy_php', 'scripts', 'birds.db'
    ))
    # List of potential paths for the database
    paths = [
        local_dev_path,
        os.path.expanduser('~/BirdNET-Pi/scripts/birds.db'),
        os.path.expanduser('~/BirdNET-Pi/birds.db'),
        os.path.expanduser('~/BirdSongs/birds.db'),
        '/home/pi/BirdNET-Pi/scripts/birds.db',
        '/home/birder/BirdNET-Pi/scripts/birds.db'
    ]
    # Return the first path that exists
    return next((p for p in paths if os.path.exists(p)), None)

def get_db_connection() -> sqlite3.Connection:
    """
    Establishes and returns a connection to the SQLite database.
    Raises an exception if the database cannot be found.
    """
    db_path = get_db_path()
    if not db_path:
        raise ConnectionError("Database file 'birds.db' could not be found.")
    
    conn = sqlite3.connect(db_path)
    # Use Row factory to allow accessing columns by name
    conn.row_factory = sqlite3.Row
    return conn
