from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import transactions, health

app = FastAPI(
    title="FraudGuard Decision Support API",
    description="Real-time fraud detection and AI-powered decision support system.",
    version="0.1.0",
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

# ── Routers ───────────────────────────────────────────────────────
app.include_router(health.router,       prefix="/api")
app.include_router(transactions.router, prefix="/api")
