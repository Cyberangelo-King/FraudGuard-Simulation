-- ==============================================================
-- FraudGuard DSS — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ==============================================================

-- ── Enable required extensions ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Transactions table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id           TEXT        NOT NULL,
    amount              DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    ensemble_score      DECIMAL(5, 4)  CHECK (ensemble_score >= 0 AND ensemble_score <= 1),
    gemini_explanation  TEXT,
    status              TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'approved', 'flagged')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Auto-update `updated_at` on every row change ────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_status     ON public.transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_device_id  ON public.transactions (device_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions (created_at DESC);

-- ── Row Level Security ──────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Allow anon/service-role reads (adjust as needed for your auth model)
CREATE POLICY "Allow public read" ON public.transactions
    FOR SELECT USING (true);

-- Only allow inserts/updates via service role (backend)
CREATE POLICY "Allow service role insert" ON public.transactions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service role update" ON public.transactions
    FOR UPDATE USING (true);

-- ── Realtime Replication ────────────────────────────────────────
-- Add the transactions table to the supabase_realtime publication
-- so that all INSERT / UPDATE / DELETE events are broadcast.
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- Optionally narrow the replication to specific columns to reduce
-- payload size (comment out if you want the full row):
-- ALTER TABLE public.transactions REPLICA IDENTITY FULL;

-- ── Seed: sample rows for local development ─────────────────────
INSERT INTO public.transactions (device_id, amount, ensemble_score, gemini_explanation, status) VALUES
  ('DEV-001', 149.99, 0.0821, 'Low-risk purchase: amount within typical range for this device profile.', 'approved'),
  ('DEV-002', 4999.00, 0.9342, 'High-risk: unusually large amount, first transaction from this device, geolocation anomaly detected.', 'flagged'),
  ('DEV-003', 25.50,  0.1104, 'Low-risk: small recurring transaction consistent with subscription pattern.', 'approved'),
  ('DEV-004', 780.00, 0.5673, 'Moderate risk: amount above average but device has established history.', 'pending'),
  ('DEV-005', 12350.00, 0.9871, 'Critical risk: extremely large amount, new device, velocity spike within 10 minutes.', 'flagged');
