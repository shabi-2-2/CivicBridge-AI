# CivicBridge AI

CivicBridge AI helps a resident turn a messy civic complaint into a structured,
evidence-labelled report draft that they review and send themselves. It does not
verify reports officially, route them to an agency, or submit them on the user's
behalf.

The repository now contains **Phase 2**: the FastAPI backend calls Gemini through
the official `google-genai` SDK, validates the structured result, checks every
claimed quote against the resident's input, and computes readiness, missing
information, review flags, next steps, and emergency warnings on the server.

The React frontend is still the Phase 1 shell. It is intentionally **not wired to
the analysis endpoint yet**, so it never displays fabricated analysis results.

## What exists

- A React + Vite + TypeScript + Tailwind CSS landing page with an issue
  textarea, optional location field, three example issues, an Analyze button,
  and an honest placeholder for future analysis results.
- `GET /api/v1/health`: liveness plus the configured model/prompt metadata. It
  needs no Gemini key.
- `POST /api/v1/analyze`: text-only complaint analysis with strict Pydantic
  request and response schemas.
- Deterministic server-side evidence validation: model-provided quotes are
  normalized and matched against the submitted text or location hint. An
  unverifiable quote downgrades the field to `inferred` (confidence at most 0.5)
  and adds a review flag.
- Deterministic derived data: `missing_information`, `review_flags`,
  `readiness`, and `suggested_next_steps` are computed from the category catalog,
  never trusted from the model.
- Deterministic emergency rules for gas, live electrical equipment, sinkholes or
  collapse, injuries, fire/explosion, and flooding near electrical equipment.
  These rules run independently and cannot be suppressed by a model that says no
  emergency is suspected.
- One repair retry for invalid structured model output, a 15-second per-attempt
  timeout, safe error envelopes, and request IDs. Raw complaint text, prompts,
  model responses, and secrets are not written to application logs.
- Mocked-provider tests that do not require an API key or incur Gemini charges.

### Phase 2 scope boundaries

Still **not implemented**:

- Frontend integration or redesign.
- Image upload or photo observations (always an empty list).
- Database, authentication, sessions, or saved reports.
- Government integrations, routing, official verification, or complaint
  submission.
- Voice input, vector databases, or multi-agent orchestration.

## Project layout

```text
CivicBridge-AI/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analysis.py       # POST /api/v1/analyze
│   │   │   └── health.py         # GET /api/v1/health
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── errors.py         # safe HTTP error classes
│   │   │   └── middleware.py     # request IDs
│   │   ├── schemas/
│   │   │   ├── analysis.py       # strict Gemini + API schemas
│   │   │   └── health.py
│   │   ├── services/
│   │   │   ├── analysis.py       # orchestration + one repair retry
│   │   │   ├── catalog.py        # category field weights/questions
│   │   │   ├── derived.py        # missing info, flags, readiness, steps
│   │   │   ├── emergency.py      # independent safety rules
│   │   │   ├── evidence.py       # quote verification / downgrade
│   │   │   ├── gemini.py         # google-genai Interactions API client
│   │   │   └── prompt.py         # versioned system prompt + repair prompt
│   │   ├── main.py
│   │   └── __init__.py
│   ├── tests/
│   │   ├── test_analysis.py
│   │   └── test_health.py
│   ├── .env.example
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/                     # Phase 1 shell, not connected to /analyze
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 20.19+ (verified here with Node 25.4.0 and npm 11.7.0)
- Python 3.11+ (verified here with Python 3.13.9)
- A Gemini API key for live analysis (not needed for the test suite)

## Configure and start the backend

From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```

`backend/.env` is gitignored. The key is read only by the backend and is never
sent to the browser. If the key is missing, `/api/v1/analyze` returns a safe
`GEMINI_NOT_CONFIGURED` error instead of inventing output.

- API base: <http://localhost:8000>
- Health: <http://localhost:8000/api/v1/health>
- Interactive docs: <http://localhost:8000/docs>

The health endpoint works without a `.env` file and without any API key. It
reports `null` for model/prompt metadata when those values are not configured:

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

If `GEMINI_MODEL` and `PROMPT_VERSION` are set in `.env`, health reports those
configured values instead.

## Analyze a complaint

`POST /api/v1/analyze` accepts JSON only (no image upload in this phase):

```json
{
  "text": "There is a deep pothole outside the community market on Market Road. Cars swerve into the opposite lane to avoid it and it fills with water when it rains.",
  "location_hint": "Springfield"
}
```

- `text`: required, 20-2000 characters after trimming.
- `location_hint`: optional, at most 200 characters.
- Unexpected request properties are rejected with `422 INVALID_INPUT`.

Curl example:

```bash
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "text": "There is a deep pothole outside the community market on Market Road. Cars swerve into the opposite lane to avoid it and it fills with water when it rains.",
    "location_hint": "Springfield"
  }'
```

The response contains:

- `schema_version`, `request_id`, `input_language`.
- `issue`: category, title, summary, tentative severity suggestion,
  emergency flag/reason.
- `fields`: all ten canonical keys (`issue.description`, `issue.first_observed`,
  `issue.frequency`, `issue.scale`, `issue.impact`, `issue.hazard`,
  `location.street_or_landmark`, `location.city_or_district`,
  `location.postal_code`, `issue.access_notes`). Each field has `value`, `status`
  (`provided` / `inferred` / `missing` / `conflicting`), `confidence`,
  `evidence_quote`, and `rationale`.
- `inferences`: model-labelled interpretations and their basis.
- `photo_observations`: always `[]` in this phase.
- `missing_information`: server-generated questions with blocking, recommended,
  or optional priority.
- `review_flags`: conflicts, unverified evidence, and low-confidence inferences.
- `readiness`: weighted completeness only. Blocking fields weigh 3, recommended
  fields 2, optional fields 1; unresolved conflicts cap the score at 80. This is
  **not** a trust or verification score.
- `suggested_next_steps`: generic guidance. CivicBridge does not submit anything.
- `emergency`: deterministic safety warning plus whether the model also flagged
  it. `contacts_emergency_services` is always `false`.
- `meta`: model, prompt version, timestamp, human-review flag, and disclaimer.

Evidence matching confirms only that the quoted words appear in the submitted
text or location hint. It does **not** prove the real-world claim is true.

### Error responses

Errors use a consistent envelope:

```json
{
  "error": {
    "code": "GEMINI_NOT_CONFIGURED",
    "message": "Gemini is not configured. Set GEMINI_API_KEY in backend/.env and restart the backend.",
    "request_id": "...",
    "retryable": false,
    "details": null
  }
}
```

| HTTP | Code | Meaning |
| --- | --- | --- |
| 422 | `INVALID_INPUT` | Request validation failed. Raw input is not echoed. |
| 429 | `GEMINI_RATE_LIMITED` | Gemini rate limit reached. |
| 502 | `GEMINI_AUTH_FAILED` | Gemini rejected the API key. |
| 502 | `GEMINI_INVALID_OUTPUT` | Invalid structured output after one repair attempt. |
| 503 | `GEMINI_NOT_CONFIGURED` | `GEMINI_API_KEY` is missing. |
| 503 | `GEMINI_MODEL_UNAVAILABLE` | Configured model is unavailable. |
| 503 | `GEMINI_UNAVAILABLE` | Gemini is temporarily unavailable. |
| 504 | `GEMINI_TIMEOUT` | Gemini exceeded the per-attempt timeout. |

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Environment label. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated browser origins allowed to call the API. `*` is rejected. |
| `GEMINI_API_KEY` | empty | Required for analysis. Server-side only; never expose it to the browser. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Gemini model used for structured extraction. Must be available to your key. |
| `PROMPT_VERSION` | empty | Optional display label; analysis metadata falls back to `civic-analysis-v1`. |
| `GEMINI_TIMEOUT_SECONDS` | `15` | Per-attempt request timeout, from 1 to 60 seconds. |
| `DEMO_MODE` | `true` | Retained for the health contract; no demo fixtures are served. |

### Frontend (`frontend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend base URL for future frontend integration. |

Never place API keys or secrets in `VITE_*` variables. Vite inlines them into
the browser bundle.

## Tests

The test suite mocks Gemini and does not require an API key or incur charges:

```bash
cd backend
python -m pytest -q
```

Coverage includes valid/invalid payloads, malformed provider output and the
single repair retry, evidence quote verification and downgrade, missing-location
detection, conflict flags and readiness caps, independent emergency rules,
missing API key, timeout handling, and preservation of the health contract.

## Start the frontend

In a second terminal, from the repository root:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:5173>. The Phase 1 form is not connected to `/analyze`
yet.

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

## Privacy and limitations

- Complaint text is sent to Gemini only when `/api/v1/analyze` is called.
- Application logs include request IDs, status codes, categories, readiness, and
  timing, but not complaint text, prompts, raw model responses, or secrets.
- Model output can be wrong. All extracted fields are drafts, not findings.
- The readiness score measures completeness only.
- Emergency rules are keyword/phrase checks. They are not a safety assessment.
- Reports are never verified, routed, or submitted by CivicBridge AI. The
  resident must review the draft and choose an official channel themselves.
