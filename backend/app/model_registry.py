"""
FraudGuard — Model Registry
============================
Loads all serialised artefacts at import-time so every FastAPI worker shares
a single in-memory copy.  The registry is imported by the predict router and
nothing else should ever call pickle.load() directly.

File layout expected (relative to this file's package root):
    ../../models/
        scaler.pkl
        logistic_regression_fold_models.pkl   → list[LogisticRegression]
        random_forest_fold_models.pkl         → list[RandomForestClassifier]
        xgboost_fold_models.pkl               → list[XGBClassifier]
        meta_learner.pkl                      → LogisticRegression (stacking)
        feature_names.json                    → list[str]  (30 features)
        metrics.json                          → {"optimal_threshold": float, ...}
"""

from __future__ import annotations

import json
import logging
import pickle
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── Resolve the models directory ──────────────────────────────────────────────
# backend/app/model_registry.py  →  ../../models/
_MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"


def _load(filename: str) -> Any:
    path = _MODELS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Model artefact not found: {path}")
    with path.open("rb") as fh:
        obj = pickle.load(fh)
    logger.info("Loaded %s  (%s)", filename, type(obj).__name__)
    return obj


# ── Artefacts ─────────────────────────────────────────────────────────────────
scaler: Any = _load("scaler.pkl")

lr_models:  list[Any] = _load("logistic_regression_fold_models.pkl")
rf_models:  list[Any] = _load("random_forest_fold_models.pkl")
xgb_models: list[Any] = _load("xgboost_fold_models.pkl")
meta_learner: Any     = _load("meta_learner.pkl")

# ── Metadata ──────────────────────────────────────────────────────────────────
with (_MODELS_DIR / "feature_names.json").open() as fh:
    FEATURE_NAMES: list[str] = json.load(fh)

with (_MODELS_DIR / "metrics.json").open() as fh:
    _metrics = json.load(fh)

# Use the threshold tuned during training; fall back to 0.68 if key is absent.
FRAUD_THRESHOLD: float = float(_metrics.get("optimal_threshold", 0.68))

logger.info(
    "Model registry ready — %d features, fraud threshold=%.4f",
    len(FEATURE_NAMES),
    FRAUD_THRESHOLD,
)
