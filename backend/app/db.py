import logging
import os

from supabase import Client, create_client

logger = logging.getLogger(__name__)

# Validate required environment variables at startup with a clear error
# instead of a confusing KeyError crash.
_SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
_SUPABASE_SERVICE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not _SUPABASE_URL:
    raise EnvironmentError(
        "SUPABASE_URL environment variable is not set. "
        "Add it to your Render environment variables or .env file."
    )
if not _SUPABASE_SERVICE_KEY:
    raise EnvironmentError(
        "SUPABASE_SERVICE_ROLE_KEY environment variable is not set. "
        "Add it to your Render environment variables or .env file."
    )

# Service-role client — only use server-side
_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(_SUPABASE_URL, _SUPABASE_SERVICE_KEY)
        logger.info("Supabase client initialised")
    return _client
