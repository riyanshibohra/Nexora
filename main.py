from fastapi import FastAPI, HTTPException, Query
from pathlib import Path
from typing import List, Dict, Any
import json
from fastapi.middleware.cors import CORSMiddleware

# Create the FastAPI app
app = FastAPI(title="Nexora API", description="Simple start for dataset exploration")

ANALYSES_DIR = (Path(__file__).parent / "data" / "analyses").resolve()


def _list_analysis_paths() -> List[Path]:
    if not ANALYSES_DIR.exists():
        return []
    return sorted(ANALYSES_DIR.glob("*.analysis.json"))


def _load_json(path: Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read analysis: {path.name}: {e}")


def _analysis_id_from_name(name: str) -> str:
    # Converts 'owner__dataset.analysis.json' -> 'owner__dataset'
    return name[:-len(".analysis.json")] if name.endswith(".analysis.json") else Path(name).stem


def _file_meta(path: Path) -> Dict[str, Any]:
    try:
        st = path.stat()
        return {"updated_at": int(st.st_mtime), "size_bytes": int(st.st_size)}
    except Exception:
        return {"updated_at": None, "size_bytes": None}


# Allow browser apps to call the API (adjust origins in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A simple hello endpoint
@app.get("/")
def read_root():
    return {"message": "Welcome to Nexora! 🚀"}

@app.get("/analyses")
def list_analyses(
    q: str | None = Query(default=None, description="Search by display_name or source_id"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    sort: str | None = Query(default=None, description="Sort key: name|rows|updated"),
) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    for p in _list_analysis_paths():
        data = _load_json(p)
        meta = _file_meta(p)
        item = {
            "id": _analysis_id_from_name(p.name),
            "display_name": data.get("display_name") or data.get("source_id"),
            "source_id": data.get("source_id"),
            "aggregate_stats": data.get("aggregate_stats", {}),
            "num_files": len((data.get("files") or [])),
            "updated_at": meta["updated_at"],
        }
        rows.append(item)

    # Filter
    if q:
        q_low = q.lower()
        rows = [r for r in rows if q_low in (r.get("display_name") or "").lower() or q_low in (r.get("source_id") or "").lower()]

    # Sort
    if sort == "rows":
        rows.sort(key=lambda r: int((r.get("aggregate_stats") or {}).get("total_rows", 0)), reverse=True)
    elif sort == "updated":
        rows.sort(key=lambda r: r.get("updated_at") or 0, reverse=True)
    else:
        rows.sort(key=lambda r: (r.get("display_name") or r.get("id") or "").lower())

    total = len(rows)
    rows = rows[offset: offset + limit]
    return {"total": total, "limit": limit, "offset": offset, "analyses": rows}


@app.get("/analyses/{analysis_id}")
def get_analysis(analysis_id: str) -> Dict[str, Any]:
    # Expect analysis_id like 'owner__dataset'
    filename = f"{analysis_id}.analysis.json"
    path = ANALYSES_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Analysis not found: {analysis_id}")
    return _load_json(path)


# Back-compat alias: return the same list as /analyses
@app.get("/datasets")
def get_datasets() -> Dict[str, Any]:
    items = []
    for p in _list_analysis_paths():
        data = _load_json(p)
        items.append({
            "id": _analysis_id_from_name(p.name),
            "title": data.get("display_name") or data.get("source_id"),
            "description": data.get("ai_summary"),
            "aggregate_stats": data.get("aggregate_stats", {}),
        })
    return {"datasets": items}

# Health check endpoint
@app.get("/health")
def health_check():
    return {"status": "healthy"} 