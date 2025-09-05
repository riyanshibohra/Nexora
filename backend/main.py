from __future__ import annotations

from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .agent import run_agent
from .db import init_db, store_from_agent_state, list_datasets, get_dataset_with_files_by_url, reset_db
from .plot_agent import PlotAgent


app = FastAPI(title="Nexora API")
plot_agent = PlotAgent()


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


@app.get("/file-preview")
def file_preview(source_url: str, file_name: str, limit: int = 50) -> Dict[str, Any]:
    ds = get_dataset_with_files_by_url(source_url)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    files = ds.get("files") or []
    path = None
    for f in files:
        fp = f.get("file_path")
        if fp and fp.endswith(file_name):
            path = fp
            break
    if not path:
        raise HTTPException(status_code=404, detail="File not found in dataset")

    import os
    import csv
    import json

    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File missing on server")

    # Check if file type is supported for preview
    SUPPORTED_EXTENSIONS = {'.csv', '.xlsx', '.xls', '.json'}
    file_ext = os.path.splitext(path)[1].lower()
    if file_ext not in SUPPORTED_EXTENSIONS:
        return {"headers": [], "rows": [], "error": "File type not supported for preview"}

    rows: List[Dict[str, Any]] = []
    headers: List[str] = []
    try:
        if path.lower().endswith('.csv'):
            # Try multiple CSV parsing strategies for malformed files
            try:
                with open(path, 'r', encoding='utf-8', newline='') as f:
                    reader = csv.DictReader(f)
                    headers = list(reader.fieldnames or [])
                    for i, r in enumerate(reader):
                        if i >= limit: break
                        rows.append({k: (v if v is not None else '') for k, v in r.items()})
            except Exception:
                try:
                    # Fallback: use pandas with error handling
                    import pandas as pd
                    df = pd.read_csv(path, engine='python', on_bad_lines='skip', nrows=limit)
                    headers = list(df.columns)
                    for _, row in df.iterrows():
                        rows.append({col: str(val) if pd.notna(val) else '' for col, val in row.items()})
                except Exception:
                    # Final fallback: manual parsing
                    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()[:limit+1]  # +1 for header
                        if lines:
                            headers = [col.strip().strip('"') for col in lines[0].strip().split(',')]
                            for line in lines[1:]:
                                values = [val.strip().strip('"') for val in line.strip().split(',')]
                                if len(values) >= len(headers):
                                    row_dict = {headers[i]: values[i] if i < len(values) else '' for i in range(len(headers))}
                                    rows.append(row_dict)
        elif path.lower().endswith('.json'):
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, list) and data:
                sample = data[:limit]
                headers = list({k for item in sample if isinstance(item, dict) for k in item.keys()})
                for item in sample:
                    if isinstance(item, dict):
                        rows.append({k: item.get(k, '') for k in headers})
        elif path.lower().endswith(('.xlsx', '.xls')):
            # For Excel files, use pandas to read and convert to preview format
            try:
                import pandas as pd
                df = pd.read_excel(path, nrows=limit)
                headers = list(df.columns)
                rows = []
                for _, row in df.iterrows():
                    rows.append({col: str(val) if pd.notna(val) else '' for col, val in row.items()})
            except Exception as e:
                return {"headers": [], "rows": [], "error": f"Error reading Excel file: {str(e)}"}
        else:
            # Unsupported preview
            return {"headers": [], "rows": [], "error": "File type not supported for preview"}
    except Exception as e:
        return {"headers": [], "rows": [], "error": f"Error reading file: {str(e)}"}

    return {"headers": headers, "rows": rows}


@app.get("/download-file")
def download_single_file(source_url: str, file_name: str) -> FileResponse:
    ds = get_dataset_with_files_by_url(source_url)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    files = ds.get("files") or []
    path = None
    for f in files:
        fp = f.get("file_path")
        if fp and fp.endswith(file_name):
            path = fp
            break
    if not path:
        raise HTTPException(status_code=404, detail="File not found in dataset")

    import os
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File missing on server")

    safe = _slugify_filename(file_name)
    return FileResponse(path, filename=safe)


# -------------------- Plotting endpoints --------------------

class PlotSuggestRequest(BaseModel):
    file_path: str


@app.post("/plot/suggestions")
def plot_suggestions(body: PlotSuggestRequest) -> Dict[str, Any]:
    try:
        suggestions = plot_agent.suggest(body.file_path)
        return {"suggestions": suggestions}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class PlotGenerateRequest(BaseModel):
    file_path: str
    prompt: str


@app.post("/plot/generate")
def plot_generate(body: PlotGenerateRequest) -> Dict[str, Any]:
    try:
        img = plot_agent.generate_plot(body.file_path, body.prompt)
        return {"image": img}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

