# FraudGuard — Real-Time Decision Support System

> AI-powered fraud detection with Gemini explanations, ensemble scoring, and real-time transaction monitoring.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite 5, Supabase Realtime |
| Backend | Python FastAPI, Supabase service-role client |
| Database | Supabase (PostgreSQL + Realtime) |
| AI | Google Gemini API (explanations) |
| Deployment | Vercel (frontend static + Python serverless) |

## Project Structure

```
FraudGuard-Simulation/
├── frontend/               # Vite + React application
│   ├── src/
│   │   ├── hooks/          # useTransactions — Realtime subscription
│   │   ├── lib/            # supabaseClient singleton
│   │   └── pages/          # Dashboard page
│   ├── vite.config.js
│   └── package.json
├── backend/                # FastAPI serverless functions
│   ├── app/
│   │   ├── routers/        # health.py, transactions.py
│   │   ├── main.py         # CORS + router registration
│   │   ├── schemas.py      # Pydantic models
│   │   └── db.py           # Supabase service-role client
│   └── requirements.txt
├── supabase/
│   └── schema.sql          # Full DB schema with Realtime enabled
├── vercel.json             # Deployment routing rules
└── .gitignore
```

## Quick Start

### Prerequisites
- Node.js ≥ 18
- Python ≥ 3.11
- A [Supabase](https://supabase.com) project

### 1. Apply the Database Schema

Paste [`supabase/schema.sql`](./supabase/schema.sql) into your Supabase **SQL Editor** and run it.

### 2. Frontend

```bash
cd frontend
cp .env.example .env          # fill in your Supabase URL + anon key
npm install
npm run dev
```

### 3. Backend

```bash
cd backend
cp .env.example .env          # fill in your Supabase URL + service role key
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API docs available at: `http://127.0.0.1:8000/api/docs`

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import the repo in [Vercel](https://vercel.com/new).
3. Set the following **environment variables** in Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Vercel will auto-detect the `vercel.json` and route:
   - `/api/*` → FastAPI serverless function
   - `/*` → Vite static build

## Preparing for GitHub

```bash
git add .
git commit -m "feat: initial monorepo scaffold for FraudGuard DSS"
git remote add origin https://github.com/<your-username>/FraudGuard-Simulation.git
git push -u origin main
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Liveness probe |
| GET | `/api/transactions` | List recent transactions |
| POST | `/api/transactions` | Submit a new transaction |
| GET | `/api/transactions/{id}` | Get transaction by ID |
| PATCH | `/api/transactions/{id}/status` | Update transaction status |

## Database Schema

```sql
transactions (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id         TEXT         NOT NULL,
  amount            DECIMAL      NOT NULL CHECK (amount > 0),
  ensemble_score    DECIMAL      CHECK (0 ≤ score ≤ 1),
  gemini_explanation TEXT,
  status            TEXT         DEFAULT 'pending' CHECK IN ('pending','approved','flagged'),
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  DEFAULT NOW()
)
```

Realtime replication is enabled via `ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions`.
