from __future__ import annotations

from typing import Any, Dict

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .agent import run_agent
from .db import init_db, store_from_agent_state, list_datasets, get_dataset_with_files_by_url, reset_db


app = FastAPI(title="Nexora API")

# Allow local frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# Helper to make a safe filename
def _slugify_filename(name: str) -> str:
    import re
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", name or "dataset")
    return cleaned.strip("._") or "dataset"


@app.get("/download-dataset-zip")
def download_dataset_zip(source_url: str, background_tasks: BackgroundTasks) -> FileResponse:
    ds = get_dataset_with_files_by_url(source_url)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    files = ds.get("files") or []
    if len(files) == 0:
        raise HTTPException(status_code=404, detail="No files recorded for this dataset")

    import os
    import tempfile
    import zipfile

    paths = [f.get("file_path") for f in files if f.get("file_path")]
    # Filter existing files only
    paths = [p for p in paths if os.path.isfile(p)]
    if not paths:
        raise HTTPException(status_code=404, detail="No dataset files available on server")

    root = os.path.commonpath(paths)
    tmp_dir = tempfile.mkdtemp(prefix="nexora_zip_")
    base = _slugify_filename(ds.get("display_name") or ds.get("source_id") or "dataset")
    zip_path = os.path.join(tmp_dir, f"{base}.zip")

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in paths:
            try:
                arc = os.path.relpath(p, root)
                zf.write(p, arcname=arc)
            except Exception:
                # Skip unreadable files
                continue

    def _cleanup(path: str, directory: str) -> None:
        try:
            os.remove(path)
        except Exception:
            pass
        try:
            os.rmdir(directory)
        except Exception:
            pass

    background_tasks.add_task(_cleanup, zip_path, tmp_dir)
    return FileResponse(zip_path, media_type="application/zip", filename=f"{base}.zip")

