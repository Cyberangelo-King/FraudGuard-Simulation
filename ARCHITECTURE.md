# FraudGuard — Simulation Architecture

## Routes

| Route | Purpose | Device |
|-------|---------|--------|
| `/dashboard` | Admin / fraud-ops real-time feed | Any browser tab |
| `/device/owner` | Card owner primary device — normal checkout + notification receiver | Open in its own tab/window |
| `/device/fraudster` | Fraudster with stolen card — high-risk purchase | Open in its own tab/window |
| `/device/secondary` | Owner's secondary device — unrecognized device scenario | Open in its own tab/window |

## How the Realtime Flow Works

```
Browser Tab A          Browser Tab B           Browser Tab C          Browser Tab D
/device/owner          /device/fraudster        /device/secondary       /dashboard
      |                       |                        |                      |
      |               [Pay Now clicked]                |                      |
      |               POST /api/predict                |                      |
      |                       |                        |                      |
      |               FastAPI: run_inference()          |                      |
      |               → score > threshold              |                      |
      |               → status = 'flagged'              |                      |
      |               Supabase INSERT (status=flagged)  |                      |
      |                       |                        |                      |
      | ←── Realtime INSERT ──┤─────────────────────── │ ─────────────────→   |
      |   (payload.new.device_id ≠ owner-device-001)   |                      |
      |                                                 |                      |
  showNotification()                            table updates live      table updates live
  "Did you make this purchase?"                 (shows status=flagged)
      |
  [YES] → PATCH /transactions/{id}/status → 'approved'
  [NO]  → PATCH /transactions/{id}/status → 'flagged' (stays, dashboard escalates)
  [timeout] → transaction remains 'flagged'
```

## Environment Variables

### Backend (Render)
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
CORS_ORIGINS=https://your-app.vercel.app
```

### Frontend (Vercel)
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_BASE_URL=https://your-backend.onrender.com
```

## New Components Needed (Beyond Bug Fixes)

The following files were created as part of this fix:
- `frontend/src/lib/supabaseClient.js` — Supabase client singleton (was missing, causing build failure)
- `frontend/src/pages/DeviceOwner.jsx` — Owner device with notification modal
- `frontend/src/pages/DeviceFraudster.jsx` — Fraudster simulation
- `frontend/src/pages/DeviceSecondary.jsx` — Unrecognized device simulation
- `frontend/src/hooks/useNotifications.js` — Dedicated hook for push notification events

## Deployment Checklist

1. **Fix LFS (CRITICAL)**: The `models/*.pkl` files are Git LFS pointers. You need to:
   - Run `git lfs untrack '*.pkl'` locally
   - `git rm --cached models/*.pkl`
   - `git add models/*.pkl`
   - `git commit -m "Remove LFS tracking from model files"`
   - This ensures Render downloads real binary files, not LFS pointer text

2. **Set Render env vars**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `CORS_ORIGINS`

3. **Set Vercel env vars**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`

4. **Run schema.sql** in Supabase SQL Editor (especially `REPLICA IDENTITY FULL`)
