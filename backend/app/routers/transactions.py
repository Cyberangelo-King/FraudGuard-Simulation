from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from ..db import get_supabase
from ..schemas import TransactionCreate, TransactionRead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("/", response_model=list[TransactionRead])
async def list_transactions(
    limit: int = 50,
    db: Annotated[Client, Depends(get_supabase)] = ...,
):
    """Return the most recent transactions ordered by insertion time."""
    response = (
        db.table("transactions")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data


@router.post("/", response_model=TransactionRead, status_code=201)
async def create_transaction(
    payload: TransactionCreate,
    db: Annotated[Client, Depends(get_supabase)] = ...,
):
    """Insert a new transaction and return the persisted record."""
    row = payload.model_dump(mode="json")
    response = db.table("transactions").insert(row).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to insert transaction.")
    return response.data[0]


@router.get("/{transaction_id}", response_model=TransactionRead)
async def get_transaction(
    transaction_id: str,
    db: Annotated[Client, Depends(get_supabase)] = ...,
):
    """Fetch a single transaction by UUID."""
    try:
        response = (
            db.table("transactions")
            .select("*")
            .eq("id", transaction_id)
            .single()
            .execute()
        )
    except Exception as exc:
        # .single() raises an exception when no rows match in the Supabase
        # Python client (PostgREST error code PGRST116). Translate to 404.
        logger.warning("get_transaction: %s not found — %s", transaction_id, exc)
        raise HTTPException(status_code=404, detail="Transaction not found.") from exc

    if not response.data:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return response.data


@router.patch("/{transaction_id}/status", response_model=TransactionRead)
async def update_status(
    transaction_id: str,
    status: str,
    db: Annotated[Client, Depends(get_supabase)] = ...,
):
    """Update the status of a transaction (e.g., pending → flagged)."""
    allowed = {"pending", "approved", "flagged"}
    if status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {sorted(allowed)}",
        )
    response = (
        db.table("transactions")
        .update({"status": status})
        .eq("id", transaction_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return response.data[0]
