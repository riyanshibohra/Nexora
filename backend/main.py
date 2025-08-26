from __future__ import annotations

from typing import Any, Dict

from fastapi import FastAPI
from pydantic import BaseModel

from .agent import run_agent
from .db import init_db, store_from_agent_state, list_datasets, get_dataset_with_files_by_url, reset_db


app = FastAPI(title="Nexora API")


class RunAgentRequest(BaseModel):
    query: str


class RunAgentResponse(BaseModel):
    message: str
    dataset_ids: list[str]
    state: Dict[str, Any]


@app.on_event("startup")
def _on_startup() -> None:
    init_db()


@app.post("/run-agent", response_model=RunAgentResponse)
def run_agent_endpoint(body: RunAgentRequest) -> RunAgentResponse:
    state = run_agent(body.query)
    dataset_ids = store_from_agent_state(state)
    return RunAgentResponse(message="Agent run completed", dataset_ids=dataset_ids, state=state)


@app.get("/datasets")
def list_datasets_endpoint() -> Dict[str, Any]:
    return {"datasets": list_datasets()}


@app.get("/dataset")
def get_dataset_endpoint(source_url: str) -> Dict[str, Any]:
    return {"dataset": get_dataset_with_files_by_url(source_url)}


@app.delete("/reset")
def reset_endpoint() -> Dict[str, Any]:
    # Remove downloaded data directory (if exists)
    import shutil
    from pathlib import Path

    data_dir = Path("data")
    if data_dir.exists():
        shutil.rmtree(data_dir, ignore_errors=True)

    # Clear database tables
    reset_db()
    return {"message": "All downloads removed and database cleared"}


