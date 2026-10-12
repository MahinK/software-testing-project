# VeriTest — Automated Software Verification & Testing Platform

A working prototype of the platform described in `Problem_Statement_Testing_Platform.pdf`.

```
Upload code → Generate EP/BVA test cases → Execute (with coverage) → Failure detection
→ Automatic defects → Dashboard → Traceability → Verification report
```

## Run it

You need two terminals.

```bash
# 1. Backend: FastAPI on http://localhost:8001 (API docs at /docs)
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8001

# 2. Frontend: React on http://localhost:5173
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and click **Load demo data**. This uploads `backend/samples/bank.py`
(which has two deliberate bugs), generates 35 EP/BVA test cases, runs them, and opens a defect
for each bug.

If the backend runs on a different port, start the frontend with `API_URL=http://localhost:PORT npm run dev`.

## What's in the prototype

| Problem statement section | Where it lives |
|---|---|
| 3.1 Test case management (CRUD, P0–P3, Pass/Fail/Blocked, suites, requirement mapping) | **Test Cases** page · `backend/app/routers/test_cases.py` |
| 3.2 Automated generation (Equivalence Partitioning + robust Boundary Value Analysis) | **Upload & Generate** page · `backend/app/generator.py` |
| 3.3 Automated testing: generated cases run against the uploaded code, with branch coverage | `backend/app/harness.py`, `runner.py` |
| 3.4 Defect management (auto-opened `BUG-XXX` with expected and actual results) | **Defects** page · `backend/app/services.py` |
| 3.5 Testing dashboard | **Dashboard** page · `GET /dashboard` |
| 3.6 Verification traceability (Requirement → Scenario → Test case → Execution → Defect) | **Traceability** page · `GET /requirements/{id}/trace` |
| Verification report (printable / save as PDF) | **Verification Report** page · `GET /report` |

## How the tests decide pass or fail

- For each function parameter you give a valid range [min, max].
- **Expected outcome:** inputs inside the range should be **Accept**ed and inputs outside it should be **Reject**ed.
- **Actual outcome:** a call that raises an exception or returns `False` counts as a Reject. Anything else counts as an Accept.
- A test case passes when the actual outcome matches the expected one.

## Limits of this prototype

- Uploaded code runs on your machine with your user's permissions, in a separate process with a
  30-second timeout. It isn't sandboxed, so only upload code you trust.
- Only Python modules and numeric parameters are supported.
- These parts aren't built yet:
  - API, UI and integration tests that run automatically. Results for these are recorded by hand on the Test Cases page.
  - LLM-based test generation.
  - Database migrations with Alembic.

## Tests

```bash
cd backend && uv run pytest        # 20 tests: the generator, the API flow, the demo pipeline
cd frontend && npm run build && npm run lint
```
