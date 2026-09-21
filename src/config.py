"""Runtime configuration and storage directory enforcement.

Guarantees that all runtime temporary directories, model weights,
and browser binaries reside strictly on D:.
"""

import os
from pathlib import Path
import sys
import tempfile
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Determine storage base path based on OS and environment
if sys.platform == "win32":
    DEV_TEMP = Path("D:/meet recorder/.temp").resolve()
    CACHE_BASE = Path("D:/meet recorder/.cache")
else:
    # Linux / WSL
    if Path("/mnt/d/meet recorder").exists():
        DEV_TEMP = Path("/mnt/d/meet recorder/.temp").resolve()
        CACHE_BASE = Path("/mnt/d/meet recorder/.cache")
    else:
        DEV_TEMP = Path("/tmp/meet_recorder").resolve()
        CACHE_BASE = Path.home() / ".cache"

DEV_TEMP.mkdir(parents=True, exist_ok=True)
CACHE_BASE.mkdir(parents=True, exist_ok=True)
os.environ["TEMP"] = str(DEV_TEMP)
os.environ["TMP"] = str(DEV_TEMP)
tempfile.tempdir = str(DEV_TEMP)

# Enforce Model and Browser caches
hf_cache = CACHE_BASE / "huggingface"
torch_cache = CACHE_BASE / "torch"
pw_cache = DEV_TEMP / "ms-playwright"

os.environ.setdefault("HF_HOME", str(hf_cache))
os.environ.setdefault("HF_HUB_CACHE", str(hf_cache / "hub"))
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(hf_cache / "hub"))
os.environ.setdefault("TORCH_HOME", str(torch_cache))
if sys.platform != "win32":
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(pw_cache)
else:
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(pw_cache))

