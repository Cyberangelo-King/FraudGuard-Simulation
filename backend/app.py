# Entry point consumed by Vercel's @vercel/python builder and by uvicorn
# when running locally:  uvicorn app:app --reload
from backend.app.main import app  # noqa: F401  re-exported as `app`
