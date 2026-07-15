import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import health, predict, transactions

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FraudGuard Decision Support API",
    description=(
        "Real-time fraud detection and AI-powered decision support system.\n\n"
        "**Pipeline**: Ensemble (LR + RF + XGBoost → meta-learner) → SHAP → Gemini"
    ),
    version="0.2.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── CORS ──────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",     # Vite dev server
        "https://*.vercel.app",      # Vercel preview/production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup: pre-load model artefacts ────────────────────────────
@app.on_event("startup")
async def _load_models() -> None:
    """
    Import the registry here (not at module level) so the heavy pickle.load
    calls happen inside the worker process after the fork, not before it.
    The import is cached by Python so subsequent calls are instant.
    """
    from . import model_registry  # noqa: F401 — triggers artefact loading
    logger.info(
        "Startup complete — fraud threshold: %.4f",
        model_registry.FRAUD_THRESHOLD,
    )


# ── Routers ───────────────────────────────────────────────────────
app.include_router(health.router,       prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(predict.router,      prefix="/api")
