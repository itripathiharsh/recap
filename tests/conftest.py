"""Global pytest configuration for Meeting Recorder Agent test suite.

Forces all pytest temporary directories, tempfile evaluations, model caches,
and browser binaries to reside exclusively on D:.
"""

import os
from pathlib import Path
import tempfile
import sys
import tempfile
import pytest

if sys.platform == "win32":
    TEST_TEMP_DIR = Path("D:/meet recorder/.temp/pytest").resolve()
    DEV_TEMP_DIR = Path("D:/meet recorder/.temp").resolve()
    CACHE_BASE = Path("D:/meet recorder/.cache")
else:
    TEST_TEMP_DIR = Path("/mnt/d/meet recorder/.temp/pytest").resolve()
    DEV_TEMP_DIR = Path("/mnt/d/meet recorder/.temp").resolve()
    CACHE_BASE = Path("/mnt/d/meet recorder/.cache")


def pytest_configure(config: pytest.Config) -> None:
    """Configure runtime environment before running tests."""
    TEST_TEMP_DIR.mkdir(parents=True, exist_ok=True)
    DEV_TEMP_DIR.mkdir(parents=True, exist_ok=True)

    # Force temp directories on D:
    os.environ["TEMP"] = str(TEST_TEMP_DIR)
    os.environ["TMP"] = str(TEST_TEMP_DIR)
    tempfile.tempdir = str(TEST_TEMP_DIR)

    # Force model and browser caches on D:
    os.environ.setdefault("HF_HOME", str(CACHE_BASE / "huggingface"))
    os.environ.setdefault("HF_HUB_CACHE", str(CACHE_BASE / "huggingface/hub"))
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(CACHE_BASE / "huggingface/hub"))
    os.environ.setdefault("TORCH_HOME", str(CACHE_BASE / "torch"))
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(DEV_TEMP_DIR / "ms-playwright"))

