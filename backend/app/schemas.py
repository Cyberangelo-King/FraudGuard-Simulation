from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class TransactionCreate(BaseModel):
    device_id: str = Field(..., description="Unique device identifier")
    amount: Decimal = Field(..., gt=0, description="Transaction amount in USD")
    ensemble_score: Decimal | None = Field(None, ge=0, le=1, description="Fraud risk score 0–1")
    gemini_explanation: str | None = Field(None, description="LLM-generated risk explanation")
    status: Literal["pending", "approved", "flagged"] = "pending"


class TransactionRead(TransactionCreate):
    id: uuid.UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
