"""
FraudGuard — Prediction Service
=================================
Encapsulates the full inference pipeline:

    raw features
        │
        ▼
    StandardScaler   (fitted on training data)
        │
        ▼
    ┌───────────────────────────────┐
    │  LR fold models  (avg proba)  │
    │  RF fold models  (avg proba)  │  ──► stacked meta-features
    │  XGB fold models (avg proba)  │
    └───────────────────────────────┘
        │
        ▼
    Meta-learner   →  ensemble_score  (fraud probability, 0-1)
        │
        ▼
    [if score > FRAUD_THRESHOLD]
        │
        ├── SHAP TreeExplainer on XGB ensemble (ThreadPoolExecutor)
        │       → top-5 contributing features
        │
        └── Gemini API  →  2-sentence alert text

All CPU-bound work (SHAP) is off-loaded to a ThreadPoolExecutor so the
async FastAPI event loop is never blocked.
"""

from __future__ import annotations

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np
import shap
import google.generativeai as genai

from .model_registry import (
    FEATURE_NAMES,
    FRAUD_THRESHOLD,
    lr_models,
    meta_learner,
    rf_models,
    scaler,
    xgb_models,
)

logger = logging.getLogger(__name__)

# ── Thread pool for CPU-bound SHAP work ──────────────────────────────────────
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="shap-worker")

# ── Gemini client (lazy-initialised once) ────────────────────────────────────
_gemini_model: Any | None = None


def _get_gemini():
    global _gemini_model
    if _gemini_model is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY environment variable is not set.")
        genai.configure(api_key=api_key)
        _gemini_model = genai.GenerativeModel("gemini-1.5-flash")
        logger.info("Gemini client initialised (gemini-1.5-flash)")
    return _gemini_model


# ── Internal helpers ──────────────────────────────────────────────────────────

def _avg_proba(models: list[Any], X_scaled: np.ndarray) -> np.ndarray:
    """Average the fraud-class probability across all fold models."""
    probas = np.array([m.predict_proba(X_scaled)[:, 1] for m in models])
    return probas.mean(axis=0)  # shape: (n_samples,)


def _compute_shap_sync(X_scaled: np.ndarray) -> list[tuple[str, float]]:
    """
    Synchronous SHAP computation — runs inside the thread pool.

    Uses the first XGB fold model as the representative explainer.
    Returns [(feature_name, shap_value), ...] sorted by |shap_value| desc.
    """
    explainer = shap.TreeExplainer(xgb_models[0])
    shap_values = explainer.shap_values(X_scaled)  # (n_samples, n_features)

    row = shap_values[0]  # single-row prediction
    ranked = sorted(
        zip(FEATURE_NAMES, row),
        key=lambda x: abs(x[1]),
        reverse=True,
    )
    return ranked[:5]  # top-5 contributors


async def _compute_shap_async(X_scaled: np.ndarray) -> list[tuple[str, float]]:
    """Off-load SHAP to the thread pool and await the result."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, _compute_shap_sync, X_scaled)


async def _call_gemini(
    ensemble_score: float,
    top_features: list[tuple[str, float]],
    amount: float,
    device_id: str,
) -> str:
    """
    Build a concise fraud-alert prompt and return a 2-sentence explanation
    from Gemini.  Network I/O is run in the thread pool to keep async-clean.
    """
    feature_lines = "\n".join(
        f"  • {name}: {value:+.4f}" for name, value in top_features
    )
    prompt = (
        f"You are a fraud analyst AI for a real-time payment monitoring system.\n"
        f"A transaction from device '{device_id}' for ${amount:.2f} has been scored "
        f"{ensemble_score:.4f} by an ensemble model (threshold {FRAUD_THRESHOLD:.4f}).\n\n"
        f"Top SHAP feature contributions (positive = increases fraud risk):\n"
        f"{feature_lines}\n\n"
        f"Write exactly 2 concise sentences: (1) summarise why this transaction is "
        f"high-risk based on the SHAP features, and (2) recommend a specific action "
        f"for the fraud operations team. Do not use bullet points."
    )

    loop = asyncio.get_running_loop()

    def _call() -> str:
        model = _get_gemini()
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.3,
                max_output_tokens=120,
            ),
        )
        return response.text.strip()

    text = await loop.run_in_executor(_executor, _call)
    logger.info("Gemini explanation generated (%d chars)", len(text))
    return text


# ── Public interface ──────────────────────────────────────────────────────────

async def run_inference(
    features: dict[str, float],
    device_id: str,
    amount: float,
) -> dict[str, Any]:
    """
    Full inference pipeline.

    Parameters
    ----------
    features : dict mapping each of the 30 feature names to its value.
    device_id: str  identifier for the originating device.
    amount   : float  raw transaction amount (used in Gemini prompt).

    Returns
    -------
    dict with keys:
        ensemble_score   float
        status           'flagged' | 'pending'
        gemini_explanation  str | None
        top_shap_features   list[dict]
    """
    # 1. Build feature vector in the correct column order
    X_raw = np.array([[features[f] for f in FEATURE_NAMES]], dtype=np.float64)

    # 2. Scale
    X_scaled = scaler.transform(X_raw)

    # 3. Base-model probabilities
    lr_p  = _avg_proba(lr_models,  X_scaled)
    rf_p  = _avg_proba(rf_models,  X_scaled)
    xgb_p = _avg_proba(xgb_models, X_scaled)

    # 4. Stack into meta-features and get final score
    meta_X        = np.column_stack([lr_p, rf_p, xgb_p])  # (1, 3)
    ensemble_score = float(meta_learner.predict_proba(meta_X)[0, 1])

    status              = "pending"
    gemini_explanation  = None
    top_shap_features: list[dict] = []

    if ensemble_score > FRAUD_THRESHOLD:
        status = "flagged"

        # 5. SHAP values (async, thread pool)
        top_features = await _compute_shap_async(X_scaled)
        top_shap_features = [
            {"feature": name, "shap_value": round(float(val), 6)}
            for name, val in top_features
        ]

        # 6. Gemini explanation (async, thread pool)
        try:
            gemini_explanation = await _call_gemini(
                ensemble_score, top_features, amount, device_id
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini call failed — skipping explanation: %s", exc)
            gemini_explanation = (
                f"[Gemini unavailable] High-risk score {ensemble_score:.4f} "
                f"detected; top driver: {top_features[0][0]}."
            )

    logger.info(
        "Inference complete | device=%s | score=%.4f | status=%s",
        device_id, ensemble_score, status,
    )
    return {
        "ensemble_score":      ensemble_score,
        "status":              status,
        "gemini_explanation":  gemini_explanation,
        "top_shap_features":   top_shap_features,
    }
