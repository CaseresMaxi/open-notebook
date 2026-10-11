"""Private Cloud Run worker: invoked only by the configured Cloud Tasks identity."""

import asyncio
import os

from fastapi import FastAPI, HTTPException, Request
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.id_token import verify_oauth2_token
from pydantic import BaseModel, Field

from open_notebook.cloud_commands import execute

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class Job(BaseModel):
    job_id: str = Field(pattern=r"^command:[a-f0-9]{32}$")


@app.post("/internal/commands/run")
async def run(job: Job, request: Request):
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Task identity required")
    audience = os.environ["NEXTNOOTBOOK_WORKER_URL"].rstrip("/")
    try:
        claims = await asyncio.to_thread(
            verify_oauth2_token, header[7:], GoogleRequest(), audience
        )
    except Exception:
        raise HTTPException(401, "Invalid task identity") from None
    if claims.get("email") != os.environ[
        "NEXTNOOTBOOK_TASKS_SERVICE_ACCOUNT"
    ] or not claims.get("email_verified"):
        raise HTTPException(403, "Task identity not authorized")
    await execute(job.job_id)
    return {"ok": True}
