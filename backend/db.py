from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Dict, Iterable, List, Optional
import uuid


# Keep DB file at repo root even though this module is in backend/
DEFAULT_DB_PATH = os.environ.get(
    "NEXORA_DB_PATH",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "nexora.db"),
)


@contextmanager
def get_connection(db_path: str = DEFAULT_DB_PATH) -> Iterable[sqlite3.Connection]:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        yield conn
    finally:
        conn.close()


def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    with get_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS datasets (
                id TEXT PRIMARY KEY,
                source_url TEXT NOT NULL UNIQUE,
                source_id TEXT,
                display_name TEXT,
                description TEXT,
                possibilities TEXT,
                num_files INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                dataset_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_format TEXT,
                file_size INTEGER,
                num_rows INTEGER,
                num_columns INTEGER,
                num_rows_with_missing INTEGER,
                num_columns_with_missing INTEGER,
                column_dtypes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(dataset_id, file_path),
                FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
            );
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_datasets_source_url ON datasets(source_url);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_files_dataset_id ON files(dataset_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_files_file_path ON files(file_path);")
        conn.commit()


def upsert_dataset(
    source_url: str,
    num_files: int,
    description: Optional[str] = None,
    possibilities: Optional[str] = None,
    source_id: Optional[str] = None,
    display_name: Optional[str] = None,
    db_path: str = DEFAULT_DB_PATH,
) -> str:
    with get_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM datasets WHERE source_url = ?", (source_url,))
        row = cur.fetchone()
        if row:
            dataset_id = row[0]
            cur.execute(
                """
                UPDATE datasets SET
                    source_id = COALESCE(?, source_id),
                    display_name = COALESCE(?, display_name),
                    description = COALESCE(?, description),
                    possibilities = COALESCE(?, possibilities),
                    num_files = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE source_url = ?
                ;
                """,
                (source_id, display_name, description, possibilities, num_files, source_url),
            )
        else:
            dataset_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO datasets (
                    id, source_url, source_id, display_name, description, possibilities, num_files, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ;
                """,
                (dataset_id, source_url, source_id, display_name, description, possibilities, num_files),
            )
        conn.commit()
        return dataset_id


def upsert_file(
    dataset_id: str,
    file_path: str,
    file_format: Optional[str] = None,
    file_size: Optional[int] = None,
    num_rows: Optional[int] = None,
    num_columns: Optional[int] = None,
    num_rows_with_missing: Optional[int] = None,
    num_columns_with_missing: Optional[int] = None,
    column_dtypes: Optional[Dict[str, str]] = None,
    db_path: str = DEFAULT_DB_PATH,
) -> str:
    with get_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM files WHERE dataset_id = ? AND file_path = ?", (dataset_id, file_path))
        row = cur.fetchone()
        if row:
            file_id = row[0]
            cur.execute(
                """
                UPDATE files SET
                    file_format = ?,
                    file_size = ?,
                    num_rows = ?,
                    num_columns = ?,
                    num_rows_with_missing = ?,
                    num_columns_with_missing = ?,
                    column_dtypes = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                ;
                """,
                (
                    file_format,
                    file_size,
                    num_rows,
                    num_columns,
                    num_rows_with_missing,
                    num_columns_with_missing,
                    json.dumps(column_dtypes) if column_dtypes is not None else None,
                    file_id,
                ),
            )
        else:
            file_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO files (
                    id, dataset_id, file_path, file_format, file_size, num_rows, num_columns,
                    num_rows_with_missing, num_columns_with_missing, column_dtypes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ;
                """,
                (
                    file_id,
                    dataset_id,
                    file_path,
                    file_format,
                    file_size,
                    num_rows,
                    num_columns,
                    num_rows_with_missing,
                    num_columns_with_missing,
                    json.dumps(column_dtypes) if column_dtypes is not None else None,
                ),
            )
        conn.commit()
        return file_id


def store_dataset_output(dataset: Dict, downloaded_meta: Optional[Dict] = None, db_path: str = DEFAULT_DB_PATH) -> str:
    source_url = dataset.get("source_url")
    if not source_url:
        raise ValueError("dataset.source_url is required")

    # Prefer authoritative description from downloaded metadata when present
    desc_from_dl = None
    if downloaded_meta:
        desc_from_dl = (downloaded_meta.get("description") or None)

    dataset_id = upsert_dataset(
        source_url=source_url,
        num_files=int(dataset.get("num_files") or 0),
        description=desc_from_dl if desc_from_dl is not None else dataset.get("description"),
        possibilities=dataset.get("possibilities"),
        source_id=(downloaded_meta or {}).get("source_id"),
        display_name=(downloaded_meta or {}).get("display_name"),
        db_path=db_path,
    )

    for f in dataset.get("files", []) or []:
        upsert_file(
            dataset_id=dataset_id,
            file_path=f.get("file_path"),
            file_format=f.get("file_format"),
            file_size=f.get("file_size"),
            num_rows=f.get("num_rows"),
            num_columns=f.get("num_columns"),
            num_rows_with_missing=f.get("num_rows_with_missing"),
            num_columns_with_missing=f.get("num_columns_with_missing"),
            column_dtypes=f.get("column_dtypes"),
            db_path=db_path,
        )

    return dataset_id


def store_from_agent_state(state: dict, db_path: str = DEFAULT_DB_PATH) -> List[str]:
    url_to_download_meta: Dict[str, Dict[str, str]] = {}
    for dd in state.get("download_results", []) or []:
        url = dd.get("source_url") if isinstance(dd, dict) else None
        if not url:
            continue
        url_to_download_meta[url] = {
            "source_id": (dd.get("source_id") if isinstance(dd, dict) else None) or None,
            "display_name": (dd.get("display_name") if isinstance(dd, dict) else None) or None,
        }

    dataset_ids: List[str] = []
    for ds in state.get("dataset_outputs", []) or []:
        ds_dict = ds if isinstance(ds, dict) else {}
        dl_meta = url_to_download_meta.get(ds_dict.get("source_url"), {})
        dataset_ids.append(store_dataset_output(ds_dict, downloaded_meta=dl_meta, db_path=db_path))

    return dataset_ids


def get_dataset_by_url(source_url: str, db_path: str = DEFAULT_DB_PATH) -> Optional[Dict]:
    with get_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, source_url, source_id, display_name, description, possibilities, num_files, created_at, updated_at
            FROM datasets
            WHERE source_url = ?
            ;
            """,
            (source_url,),
        )
        row = cur.fetchone()
        if not row:
            return None
        keys = [
            "id",
            "source_url",
            "source_id",
            "display_name",
            "description",
            "possibilities",
            "num_files",
            "created_at",
            "updated_at",
        ]
        return {k: v for k, v in zip(keys, row)}


def get_files_for_dataset(dataset_id: str, db_path: str = DEFAULT_DB_PATH) -> List[Dict]:
    with get_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, file_path, file_format, file_size, num_rows, num_columns,
                   num_rows_with_missing, num_columns_with_missing, column_dtypes,
                   created_at, updated_at
            FROM files
            WHERE dataset_id = ?
            ORDER BY id ASC
            ;
            """,
            (dataset_id,),
        )
        rows = cur.fetchall()
        cols = [
            "id",
            "file_path",
            "file_format",
            "file_size",
            "num_rows",
            "num_columns",
            "num_rows_with_missing",
            "num_columns_with_missing",
            "column_dtypes",
            "created_at",
            "updated_at",
        ]
        result: List[Dict] = []
        for r in rows:
            obj = {k: v for k, v in zip(cols, r)}
            if obj.get("column_dtypes"):
                try:
                    obj["column_dtypes"] = json.loads(obj["column_dtypes"])  # type: ignore[assignment]
                except Exception:
                    pass
            result.append(obj)
        return result


def get_dataset_with_files_by_url(source_url: str, db_path: str = DEFAULT_DB_PATH) -> Optional[Dict]:
    ds = get_dataset_by_url(source_url, db_path=db_path)
    if not ds:
        return None
    files = get_files_for_dataset(ds["id"], db_path=db_path)
    
    # Filter to only include files with valid metadata
    valid_files = [f for f in files if f.get("num_rows") is not None and f.get("num_columns") is not None]
    
    ds_copy = dict(ds)
    ds_copy["files"] = valid_files
    return ds_copy


def list_datasets(db_path: str = DEFAULT_DB_PATH) -> List[Dict]:
    with get_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT d.id, d.source_url, d.source_id, d.display_name, d.description, d.possibilities, d.num_files, d.created_at, d.updated_at,
                   COALESCE(SUM(f.file_size), 0) as total_size_bytes
            FROM datasets d
            LEFT JOIN files f ON d.id = f.dataset_id
            WHERE EXISTS (
                SELECT 1 FROM files f2 
                WHERE f2.dataset_id = d.id 
                AND f2.num_rows IS NOT NULL 
                AND f2.num_columns IS NOT NULL
            )
            GROUP BY d.id, d.source_url, d.source_id, d.display_name, d.description, d.possibilities, d.num_files, d.created_at, d.updated_at
            ORDER BY d.id DESC;
            """
        )
        rows = cur.fetchall()
        keys = [
            "id",
            "source_url",
            "source_id",
            "display_name",
            "description",
            "possibilities",
            "num_files",
            "created_at",
            "updated_at",
            "total_size_bytes",
        ]
        return [{k: v for k, v in zip(keys, r)} for r in rows]


def reset_db(db_path: str = DEFAULT_DB_PATH) -> None:
    with get_connection(db_path) as conn:
        cur = conn.cursor()
        try:
            cur.execute("DROP TABLE IF EXISTS files;")
        except Exception:
            pass
        try:
            cur.execute("DROP TABLE IF EXISTS datasets;")
        except Exception:
            pass
        conn.commit()
    init_db(db_path=db_path)


