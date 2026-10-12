from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import Base, engine
from app.routers import dashboard, defects, generator, report, requirements, test_cases, uploads


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Fine for development; switch to Alembic migrations once the schema settles.
    Base.metadata.create_all(engine)
    yield


app = FastAPI(
    title="Automated Software Verification & Testing Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server for the React frontend
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (requirements, test_cases, uploads, generator, defects, dashboard, report):
    app.include_router(r.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
