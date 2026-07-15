from fastapi import APIRouter

router = APIRouter(tags=["Health"])

@router.get("/health")
async def health_check():
    """Liveness probe — returns 200 when the API is running."""
    return {"status": "ok", "service": "fraudguard-api"}
