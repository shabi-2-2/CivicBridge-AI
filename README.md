# CivicBridge AI

CivicBridge AI helps a resident turn a messy civic complaint into a structured,
evidence-labelled report draft that they review and send themselves. It does not
verify reports officially, route them to an agency, or submit them on the user's
behalf.

The repository contains the complete implementation:
- **FastAPI backend**: calls Gemini via the official `google-genai` SDK using structured JSON output, validates schemas with Pydantic, checks every claimed evidence quote against the resident's input, detects missing information and conflicts, enforces independent emergency rules, computes readiness scores, and generates deterministic Markdown and plain-text reports with zero model calls during export.
- **Performance optimizations**: bounded in-memory response cache (`AnalysisCache`) with SHA-256 keys, model token and thinking level tuning, streamlined prompts, latency instrumentation, and safe repair retries.
- **React frontend**: responsive, accessible UI with progressive disclosure, a compact results summary, priority "One detail to add" inline answering, field editing with provenance tracking, client-side draft preview, and server-side report generation with copy and download.

---

## What exists

- **Form Input**: Accessible landing page with issue textarea, optional location field, character counters, input validation (20–2000 chars), and example complaints.
- `GET /api/v1/health`: Liveness plus configured model and prompt metadata (requires no API key).
- `POST /api/v1/analyze`: Unstructured complaint analysis returning a structured draft with 10 canonical fields.
- `POST /api/v1/report`: Deterministic server-side report generation incorporating user edits and answers into Markdown and plain text.
- **Server-side evidence validation**: Model-provided quotes are normalized and verified against submitted text or location hint. Unverifiable quotes are downgraded to `inferred` (confidence <= 0.5) with an `EVIDENCE_UNVERIFIED` review flag.
- **Deterministic derived data**: Missing information checklist, review flags, completeness readiness score, and suggested next steps are derived from the category catalog, never trusted blindly from the model.
- **Independent emergency detection**: Deterministic safety checks for gas leaks, live electrical wires, sinkholes, structural collapse, injuries, fire/explosion, and flooding near electrics. Rules run independently and cannot be overridden by model outputs.
- **Progressive disclosure UI**: Compact summary card, priority question card, collapsible detailed field editor, collapsible technical details, and report preview.
- **In-memory cache**: Thread-safe bounded LRU cache (128 entries) with SHA-256 keys for identical normalized requests.
- **Security & Privacy**: Backend-only API keys; raw complaint text, prompts, and secrets are never logged; no `dangerouslySetInnerHTML`; CORS restricted to configured origins.
- **Comprehensive test suite**: 53 backend tests (mocked provider, no API key needed) and 18 frontend tests.

---

## Project layout

```text
CivicBridge-AI/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analysis.py       # POST /api/v1/analyze & POST /api/v1/report
│   │   │   └── health.py         # GET /api/v1/health
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic Settings
│   │   │   ├── errors.py         # Safe HTTP error envelopes
│   │   │   └── middleware.py     # Request ID tracking
│   │   ├── schemas/
│   │   │   ├── analysis.py       # Strict Pydantic schemas
│   │   │   └── health.py
│   │   ├── services/
│   │   │   ├── analysis.py       # Orchestration + repair retry + cache
│   │   │   ├── cache.py          # Bounded in-memory LRU cache (SHA-256)
│   │   │   ├── catalog.py        # Category field specs and weights
│   │   │   ├── derived.py        # Missing info, flags, readiness, next steps
│   │   │   ├── emergency.py      # Independent safety rules
│   │   │   ├── evidence.py       # Quote verification / downgrade
│   │   │   ├── gemini.py         # google-genai SDK client
│   │   │   ├── prompt.py         # Versioned system prompt & repair prompt
│   │   │   └── report.py         # Deterministic report generation
│   │   ├── main.py
│   │   └── __init__.py
│   ├── tests/
│   │   ├── test_analysis.py      # Core analysis & safety tests
│   │   ├── test_health.py        # Health & CORS tests
│   │   ├── test_performance_cache.py # Cache, repair & latency tests
│   │   └── test_report.py        # Report generation & edit tests
│   ├── .env.example
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AnalysisEmptyState.tsx
│   │   │   ├── AnalysisError.tsx
│   │   │   ├── AnalysisLoading.tsx
│   │   │   ├── AnalysisResults.tsx
│   │   │   ├── ExtractedFieldCard.tsx
│   │   │   ├── IssueForm.tsx
│   │   │   ├── OneThingToAdd.tsx
│   │   │   ├── ReportPreview.tsx
│   │   │   ├── ReviewDraft.tsx
│   │   │   ├── SiteFooter.tsx
│   │   │   └── SiteHeader.tsx
│   │   ├── lib/
│   │   │   ├── analysisMeta.ts
│   │   │   ├── examples.ts
│   │   │   └── review.ts
│   │   ├── services/
│   │   │   ├── analysisApi.ts
│   │   │   └── reportApi.ts
│   │   ├── test/
│   │   ├── App.tsx
│   │   ├── App.test.tsx
│   │   └── main.tsx
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

---

## Prerequisites

- **Python 3.11+** (verified with Python 3.13.9)
- **Node.js 20.19+** (verified with Node 25.4.0 and npm 11.7.0)
- **Gemini API Key**: Required for live analysis (not required for tests).

---

## Quickstart

### 1. Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```

- API Base: <http://localhost:8000>
- Health: <http://localhost:8000/api/v1/health>
- Interactive Docs: <http://localhost:8000/docs>

### 2. Frontend Setup

In a separate terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:5173> to interact with the application.

---

## Running the Test Suites

### Backend Tests (No API key needed)

```bash
cd backend
source .venv/bin/activate
python -m pytest -v
```

All 53 unit and integration tests run against mocked provider fixtures.

### Frontend Tests & Typecheck

```bash
cd frontend
npm run test
npm run build
```

Runs 18 Vitest component tests and validates TypeScript compilation and production bundle build.

---

## API Endpoints

### 1. `POST /api/v1/analyze`

Converts an unstructured civic complaint into an evidence-labelled draft:

```bash
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "text": "There is a deep pothole outside the community market on Market Road. Cars swerve into the opposite lane to avoid it and it fills with water when it rains.",
    "location_hint": "Springfield"
  }'
```

Key features:
- In-memory caching with SHA-256 keys (cached responses return in <40ms with `cache_hit: true`).
- Single repair attempt for malformed JSON or schema mismatches.
- Verified evidence quotes downgraded to `inferred` if not verbatim in user input.

### 2. `POST /api/v1/report`

Generates a human-reviewed report from an analyzed draft and user edits:

```bash
curl -X POST http://localhost:8000/api/v1/report \
  -H "Content-Type: application/json" \
  -d '{
    "analysis": { ... },
    "drafts": {
      "issue.description": {
        "value": "A deep pothole with sharp edges",
        "edited": true,
        "confirmedByUser": true
      }
    },
    "user_answers": {}
  }'
```

Key features:
- Recalculates readiness and completeness server-side.
- Generates clean Markdown (`report_md`) and plain-text (`report_text`).
- Zero model calls during report generation.

---

## Security & Privacy Highlights

1. **Backend-Only Secrets**: `GEMINI_API_KEY` is loaded from `backend/.env` and never exposed to the frontend bundle or API responses.
2. **Safe Logging**: Only request IDs, status codes, categories, and durations are logged; raw user complaints, prompts, and model responses are never logged.
3. **Strict Validation**: All endpoints use strict Pydantic schemas with `extra="forbid"`.
4. **No Unsafe HTML**: Model-generated content is rendered strictly as plain text. No `dangerouslySetInnerHTML`.
5. **CORS Restrictions**: Rejects wildcard origins (`*`) and strictly permits configured origins.
6. **Prominent Disclaimers**: Clarifies that reports are drafts and CivicBridge AI does not file reports or contact emergency services.
