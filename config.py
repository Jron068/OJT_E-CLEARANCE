import os
import logging

try:
    import mysql.connector
except ImportError:  # Allows the Flask app to start and show a useful DB error.
    mysql = None
else:
    mysql = mysql.connector


SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "change-this-development-secret")
DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"
MYSQL_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", "root123"),
    "database": os.getenv("DB_NAME", "ojt_db"),
    "port": int(os.getenv("DB_PORT", "3306")),
}


def create_connection():
    """Open a MySQL connection using environment-based settings."""
    if mysql is None:
        logging.getLogger(__name__).error(
            "MySQL connector is not installed. Install requirements.txt before starting Flask."
        )
        return None
    try:
        return mysql.connect(**MYSQL_CONFIG)
    except mysql.Error:
        logging.getLogger(__name__).exception(
            "Could not connect to MySQL at %s:%s using database %s",
            MYSQL_CONFIG["host"], MYSQL_CONFIG["port"], MYSQL_CONFIG["database"],
        )
        return None
