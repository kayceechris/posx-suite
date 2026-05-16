"""
Passenger WSGI entry point for cPanel deployments.

cPanel's Python App feature uses Passenger (a WSGI server). FastAPI is ASGI,
so we use `a2wsgi` to bridge ASGI -> WSGI. Performance is reduced compared
to running uvicorn directly — for high traffic, deploy on a VPS or Render
instead of shared cPanel hosting.

Required pip packages (already in requirements.txt):
    a2wsgi
"""
import sys
import os
from pathlib import Path

# Ensure backend folder is on the import path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Load .env if present (for cPanel hosts that don't auto-load env vars)
try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / ".env")
except ImportError:
    pass

from server import app  # FastAPI ASGI app
from a2wsgi import ASGIMiddleware

# Passenger looks for `application` at module level
application = ASGIMiddleware(app)
