"""
POST /api/predict
=================
Receives raw transaction features, runs the full ensemble + SHAP + Gemini
pipeline, and writes the result to the Supabase `transactions` table.

Simulation note: The `status` field returned by inference ('flagged' | 'pending')
maps directly to the owner-confirmation flow:
  - 'pending'  → transaction is low-risk, processes normally
  - 'flagged'  → transaction is paused; owner must confirm via primary device
                 (implemented in frontend DeviceOwner.jsx notification flow)

The Supabase Realtime channel broadcasts INSERT events to all connected
device routes so all four tabs react simultaneously.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import Client

from ..db import get_supabase
from ..inference import run_inference
from ..model_registry import FEATURE_NAMES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/predict", tags=["Prediction"])


# ── Request / Response schemas ────────────────────────────────────────────────

class PredictRequest(BaseModel):
    """
    All 30 model features plus the two metadata fields needed for storage.

    PCA components V1–V28 are the output of the PCA transformation applied
    to the original Kaggle credit-card fraud dataset.  log_amount and hour
    are engineered features added during preprocessing.
    """

    device_id: str   = Field(..., description="Originating device identifier")
    amount:    float = Field(..., gt=0, description="Raw transaction amount in USD")

    # PCA components
    V1:  float; V2:  float; V3:  float; V4:  float; V5:  float
    V6:  float; V7:  float; V8:  float; V9:  float; V10: float
    V11: float; V12: float; V13: float; V14: float; V15: float
    V16: float; V17: float; V18: float; V19: float; V20: float
    V21: float; V22: float; V23: float; V24: float; V25: float
    V26: float; V27: float; V28: float

    # Engineered features
    log_amount: float = Field(..., description="log1p(amount)")
    hour:       float = Field(..., ge=0, lt=24, description="Hour of day (0–23)")

    def to_feature_dict(self) -> dict[str, float]:
        """Return only the 30 model features keyed by name."""
        return {f: float(getattr(self, f)) for f in FEATURE_NAMES}


class ShapFeature(BaseModel):
    feature:    str
    shap_value: float


class PredictResponse(BaseModel):
    transaction_id:     str
    device_id:          str
    amount:             float
    ensemble_score:     float
    status:             str
    gemini_explanation: str | None
    top_shap_features:  list[ShapFeature]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/", response_model=PredictResponse, status_code=201)
async def predict(
    payload: PredictRequest,
    db: Annotated[Client, Depends(get_supabase)],
) -> PredictResponse:
    """
    Full fraud-detection pipeline:

    1. Extract features from the request body.
    2. Run ensemble inference (LR + RF + XGB → meta-learner).
    3. If score > threshold: compute SHAP values (thread pool) and call Gemini.
    4. Persist the transaction to Supabase (triggers Realtime broadcast to all devices).
    5. Return the full prediction result.

    Realtime note: The Supabase INSERT in step 4 broadcasts to the
    `supabase_realtime` publication, which all four frontend device routes
    (owner, fraudster, secondary, dashboard) subscribe to. Flagged transactions
    trigger the owner-confirmation notification flow on /device/owner.
    """

    # ── 1. Inference ──────────────────────────────────────────────────────────
    try:
        result = await run_inference(
            features=payload.to_feature_dict(),
            device_id=payload.device_id,
            amount=payload.amount,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required feature: {exc}",
        ) from exc
    except Exception as exc:
        logger.exception("Inference pipeline failed")
        raise HTTPException(
            status_code=500,
            detail=f"Inference error: {exc}",
        ) from exc

    # ── 2. Persist to Supabase ────────────────────────────────────────────────
    row = {
        "device_id":           payload.device_id,
        "amount":              float(payload.amount),
        "ensemble_score":      round(result["ensemble_score"], 6),
        "gemini_explanation":  result["gemini_explanation"],
        "status":              result["status"],
    }

    try:
        insert_resp = db.table("transactions").insert(row).execute()
        if not insert_resp.data:
            raise RuntimeError("Supabase returned empty data on insert.")
        saved = insert_resp.data[0]
    except Exception as exc:
        logger.exception("Supabase insert failed")
        raise HTTPException(
            status_code=502,
            detail=f"Database write failed: {exc}",
        ) from exc

    # ── 3. Build response ─────────────────────────────────────────────────────
    return PredictResponse(
        transaction_id=saved["id"],
        device_id=saved["device_id"],
        amount=float(saved["amount"]),
        ensemble_score=float(saved["ensemble_score"]),
        status=saved["status"],
        gemini_explanation=saved.get("gemini_explanation"),
        top_shap_features=[
            ShapFeature(**sf) for sf in result["top_shap_features"]
        ],
    )
