# CivicBridge AI

CivicBridge AI helps a resident turn a messy civic complaint into a structured,
evidence-labelled report draft that they review and send themselves. It does not
verify reports officially, route them to an agency, or submit them on the user's
behalf.

This repository currently contains **Phase 1**: the frontend shell and the
backend health contract. The Gemini analysis pipeline is intentionally not
connected yet.

## What exists in Phase 1

- A React + Vite + TypeScript + Tailwind CSS landing page with an issue
  textarea, optional location field, three example issues, an Analyze button,
  and an honest placeholder for future analysis results.
- A FastAPI backend exposing `GET /api/v1/health`, which requires no Gemini API
  key.
- Environment-driven CORS for local frontend origins. Wildcard origins are
  rejected.
- Backend tests for the health contract and CORS behaviour.

Not implemented yet: Gemini calls, the analysis endpoint, image upload, a
database, authentication, report storage, and any submission or routing
integration. The UI never fabricates analysis results.

## Project layout

```text
CivicBridge-AI/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── health.py
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   └── config.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   └── health.py
│   │   ├── services/
│   │   │   └── __init__.py
│   │   ├── __init__.py
│   │   └── main.py
│   ├── tests/
│   │   └── test_health.py
│   ├── .env.example
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── IssueForm.tsx
│   │   │   ├── ResultsPlaceholder.tsx
│   │   │   ├── SiteFooter.tsx
│   │   │   └── SiteHeader.tsx
│   │   ├── lib/
│   │   │   └── examples.ts
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 20.19+ (verified here with Node 25.4.0 and npm 11.7.0)
- Python 3.11+ (verified here with Python 3.13.9)

## Start the backend

From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

- API base: <http://localhost:8000>
- Health: <http://localhost:8000/api/v1/health>
- Interactive docs: <http://localhost:8000/docs>

The health endpoint works without a `.env` file and without any API key.

```bash
curl http://localhost:8000/api/v1/health
```

```json
{
  "status": "ok",
  "model": null,
  "prompt_version": null,
  "demo_mode": true
}
```

Run the backend tests (with the virtual environment active):

```bash
cd backend
python -m pytest
```

## Start the frontend

In a second terminal, from the repository root:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:5173>.

Build and type-check:

```bash
cd frontend
npm run build
```

Preview the production build:

```bash
cd frontend
npm run preview
```

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Environment label. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated browser origins allowed to call the API. `*` is rejected. |
| `GEMINI_API_KEY` | empty | Reserved for Phase 2. Never commit it; never expose it to the browser. |
| `GEMINI_MODEL` | empty | Reported by `/health` once a model is connected. Stays `null` in Phase 1. |
| `PROMPT_VERSION` | empty | Reported by `/health` once a prompt is versioned. Stays `null` in Phase 1. |
| `DEMO_MODE` | `true` | Whether demo fixtures are enabled. |

### Frontend (`frontend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend base URL used by the Phase 2 analysis flow. |

Never place API keys or secrets in `VITE_*` variables. Vite inlines them into
the browser bundle.

## Scope boundaries

Phase 1 deliberately excludes:

- Gemini or any other AI call, and any fake or cached analysis output.
- The analysis/report API and report export.
- Image upload, databases, authentication, sessions, and persistence.
- Submission, routing, or official verification of reports.
- Maps, geocoding, notifications, and admin dashboards.

CivicBridge AI produces AI-assisted draft material only. The resident remains
responsible for reviewing it and choosing where to send it.
