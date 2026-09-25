"""Backfill ownership of legacy meetings that have owner_id IS NULL.

Reads MEETINGS_OWNER_EMAIL from the environment and calls the
assign_orphan_meetings() SECURITY DEFINER function (service role only)
to assign every orphaned meeting to that user's Individual Workspace.

Run once after applying supabase/migrations/:
    python scripts/backfill_meeting_ownership.py

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set in .env.

Args:
    None (configuration comes from the environment).

Returns:
    int: process exit code (0 = success, 1 = failure).
"""

import logging
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("backfill_meeting_ownership")


def resolve_owner_email() -> str:
    """Return the configured owner email for legacy meetings.

    Returns:
        The trimmed MEETINGS_OWNER_EMAIL value.

    Raises:
        SystemExit: If the variable is missing or empty.
    """
    email = os.getenv("MEETINGS_OWNER_EMAIL", "").strip()
    if not email:
        logger.error(
            "MEETINGS_OWNER_EMAIL is not set. Add it to .env, e.g. "
            "MEETINGS_OWNER_EMAIL=you@example.com"
        )
        raise SystemExit(1)
    return email


def get_service_client() -> Any:
    """Create a Supabase client using the service-role key.

    Returns:
        An initialized supabase Client.

    Raises:
        SystemExit: If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing,
            or client creation fails.
    """
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        logger.error(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env. "
            "The service role key is needed because assign_orphan_meetings() "
            "rejects non-service-role callers."
        )
        raise SystemExit(1)

    try:
        from supabase import create_client

        return create_client(url, key)
    except Exception as exc:  # noqa: BLE001 - surface any client init failure
        logger.error("Failed to create Supabase client: %s", exc)
        raise SystemExit(1) from exc


def run_backfill(client: Any, owner_email: str) -> int:
    """Assign all ownerless meetings to the given owner email.

    Args:
        client: Supabase client authenticated as service role.
        owner_email: Email of the auth user who should own legacy meetings.

    Returns:
        The number of meetings that were updated.

    Raises:
        SystemExit: If the RPC call fails (e.g. no such auth user).
    """
    try:
        res = client.rpc(
            "assign_orphan_meetings", {"p_owner_email": owner_email}
        ).execute()
    except Exception as exc:  # noqa: BLE001 - RPC errors vary by client version
        logger.error("assign_orphan_meetings failed: %s", exc)
        raise SystemExit(1) from exc

    count = res.data if isinstance(res.data, int) else 0
    return count


def main() -> int:
    """Run the ownership backfill end to end.

    Returns:
        0 on success, 1 on failure.
    """
    owner_email = resolve_owner_email()
    client = get_service_client()
    count = run_backfill(client, owner_email)
    logger.info("Backfill complete: %d meeting(s) assigned to %s", count, owner_email)
    return 0


if __name__ == "__main__":
    sys.exit(main())
