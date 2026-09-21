"""Runtime configuration and storage directory enforcement.

Guarantees that all runtime temporary directories, model weights,
and browser binaries reside strictly on D:.
"""

import os
from pathlib import Path
import tempfile
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Enforce D: temporary directories
DEV_TEMP = Path("D:/dev/Temp").resolve()
DEV_TEMP.mkdir(parents=True, exist_ok=True)
os.environ["TEMP"] = str(DEV_TEMP)
os.environ["TMP"] = str(DEV_TEMP)
tempfile.tempdir = str(DEV_TEMP)

# Enforce Model and Browser caches on D:
os.environ.setdefault("HF_HOME", "D:/dev/Cache/huggingface")
os.environ.setdefault("HF_HUB_CACHE", "D:/dev/Cache/huggingface/hub")
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", "D:/dev/Cache/huggingface/hub")
os.environ.setdefault("TORCH_HOME", "D:/dev/Cache/torch")
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "D:/dev/ms-playwright")
