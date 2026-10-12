# Testing Platform — Backend

FastAPI and SQLAlchemy backend for the Automated Software Verification & Testing Platform.

## Run

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8001   # http://localhost:8001/docs
uv run pytest
```

SQLite (`testing_platform.db`) is the default. For PostgreSQL, run `uv sync --extra postgres` and set
`DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/testing_platform`.

## Layout

| Path | What it does |
|---|---|
| `app/generator.py` | EP and robust BVA test generation (pure Python, no database) |
| `app/models.py` | Requirement → TestScenario → TestCase → TestExecution → Defect, plus suites and coverage snapshots |
| `app/routers/` | REST endpoints |

## API

| Endpoint | Purpose |
|---|---|
| `POST /requirements`, `POST /scenarios` | Define what is being verified |
| `POST/GET/PATCH/DELETE /test-cases`, `POST /suites` | Manage test cases (P0–P3, Pass/Fail/Blocked) |
| `POST /generate` | Generate EP/BVA cases from a signature; add `persist: true` to save them under a requirement |
| `POST /test-cases/{id}/executions` | Record a result. A failure opens a defect automatically (`BUG-XXX`) |
| `GET/PATCH /defects` | Triage defects |
| `POST /coverage` | Record a Coverage.py percentage |
| `GET /dashboard` | Totals, pass %, coverage, defects by severity and module, regression results |
| `GET /requirements/{id}/trace` | Full traceability chain plus a VERIFIED / FAILED / NOT_VERIFIED verdict |

### Example: generate tests for `withdraw(amount)`

```bash
curl -X POST localhost:8001/generate -H 'content-type: application/json' -d '{
  "signature": "withdraw(amount)",
  "params": {"amount": {"type": "int", "min": 1, "max": 10000}}
}'
```

This produces 9 cases: a nominal valid value (5000), BVA at 0/1/2 and 9999/10000/10001, and an EP
representative from each invalid class. With several parameters, the generator varies one at a
time and holds the others at their nominal value (the single-fault assumption), giving at most
8n + 1 cases.
