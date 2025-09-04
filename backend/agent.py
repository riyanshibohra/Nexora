import os
import re
import json
from operator import add
from pathlib import Path
from typing import Annotated, Any, Dict, List, Optional, TypedDict, Literal

import pandas as pd
from dotenv import load_dotenv
from kaggle.api.kaggle_api_extended import KaggleApi
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from tavily import TavilyClient
from langgraph.graph import StateGraph, START, END
from IPython.display import Image, display


# Environment
load_dotenv()

OPEN_API_KEY = os.getenv('OPEN_API_KEY')
LANGSMITH_TRACING = os.getenv('LANGSMITH_TRACING')
LANGSMITH_API_KEY = os.getenv('LANGSMITH_API_KEY')
LANGSMITH_PROJECT = os.getenv('LANGSMITH_PROJECT')
LANGSMITH_ENDPOINT = os.getenv('LANGSMITH_ENDPOINT')
TAVILY_API_KEY = os.getenv('TAVILY_API_KEY')


# Clients
llm = ChatOpenAI(model="gpt-4o", temperature=0)
tavily_client = TavilyClient(api_key=TAVILY_API_KEY)


# Data models
class TavilySearchOutput(BaseModel):
    title: str
    url: str
    content: str


class FileRecord(BaseModel):
    path: str
    rel_path: str
    ext: str
    name: Optional[str] = None
    size_bytes: Optional[int] = None


class DownloadedDataset(BaseModel):
    source_url: str
    source_id: str
    display_name: Optional[str] = None
    dest_dir: str
    files: List[FileRecord]
    meta: Dict[str, Any] = Field(default_factory=dict)


class FileOutput(BaseModel):
    file_path: str
    file_format: Optional[str] = None
    file_size: Optional[int] = None
    num_rows: Optional[int] = None
    num_columns: Optional[int] = None
    num_rows_with_missing: Optional[int] = None
    num_columns_with_missing: Optional[int] = None
    column_dtypes: Optional[Dict[str, str]] = None


class DatasetOutput(BaseModel):
    source_url: str
    num_files: int
    description: Optional[str] = None
    possibilities: Optional[Literal["classification", "regression", "clustering", "time_series", "text_generation", "image_generation", "other"]] = None
    files: List[FileOutput] = Field(default_factory=list)


class AgentState(TypedDict):
    query: str
    tavilySearchOutput: List[TavilySearchOutput]
    status: Annotated[List[str], add]
    download_results: Annotated[List[DownloadedDataset], add]
    dataset_outputs: Annotated[List[DatasetOutput], add]


def tavily_search_tool(state: AgentState):
    """Search Kaggle only and return up to 15 most relevant, deduped dataset links."""
    query = state["query"]

    # Multiple search variations to find more relevant tabular datasets
    site_queries = {
        "kaggle1": f"{query} tabular data csv xlsx dataset site:kaggle.com/datasets",
        "kaggle2": f"{query} structured data spreadsheet site:kaggle.com/datasets",
        "kaggle3": f"{query} data analysis csv file site:kaggle.com/datasets"
    }

    def which_site(url: str) -> str | None:
        u = url.lower()
        if "kaggle.com/datasets/" in u:
            return "kaggle"
        return None

    def relevance_score(site: str, title: str, url: str, content: str) -> float:
        t = (title or "").lower()
        u = (url or "").lower()
        c = (content or "").lower()
        score = 0.0
        
        # Penalize non-columnar datasets heavily
        non_columnar_keywords = ["image", "images", "photo", "photos", "picture", "pictures", "video", "videos", "audio", "sound", "music", "streetview", "satellite", "visual", "graphics"]
        if any(x in t for x in non_columnar_keywords) or any(x in c for x in non_columnar_keywords):
            score -= 3.0  # Penalty for non-columnar datasets
        
        # Boost columnar data indicators
        if any(x in u for x in [".csv", ".xlsx", ".json", "/download", "/raw/"]):
            score += 3.0
        if any(x in c for x in ["csv", "xlsx", "json", "download", "tabular", "spreadsheet", "dataframe"]):
            score += 2.0
        
        # Boost specific columnar data mentions
        columnar_indicators = ["tabular", "spreadsheet", "dataframe", "rows", "columns", "dataset", "data analysis", "statistics", "table", "records", "entries", "structured data"]
        if any(x in c for x in columnar_indicators):
            score += 1.5
            
        # Additional boost for common tabular data types
        if any(x in c for x in ["demographic", "census", "population", "economic", "financial", "sales", "survey", "research", "analytics"]):
            score += 1.0
            
        # Query relevance
        for tok in set(query.lower().split()):
            if tok and (tok in t or tok in c):
                score += 0.5
                
        if site == "kaggle":
            score += 0.5
            
        return score

    candidates: list[tuple[str, TavilySearchOutput, float]] = []
    seen_urls: set[str] = set()

    for site, q in site_queries.items():
        try:
            r = tavily_client.search(query=q, search_depth="basic", max_results=25)
        except Exception:
            continue
        if not isinstance(r, dict) or "results" not in r:
            continue
        for h in r["results"]:
            url = h.get("url", "") if isinstance(h, dict) else ""
            site_name = which_site(url) if url else None
            if site_name is None:
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)
            title = h.get("title", "")
            content = h.get("content", "")
            tso = TavilySearchOutput(title=title, url=url, content=content)
            score = relevance_score(site_name, title, url, content)
            candidates.append((site_name, tso, score))

    candidates.sort(key=lambda x: x[2], reverse=True)

    selected: list[TavilySearchOutput] = []
    used_urls: set[str] = set()

    for _, tso, score in candidates:
        if len(selected) >= 15:
            break
        if tso.url in used_urls:
            continue
        # Include datasets with positive scores, or if we have fewer than 10, include neutral scores too
        if score > 0 or (len(selected) < 10 and score >= -1.0):
            selected.append(tso)
            used_urls.add(tso.url)

    return {"tavilySearchOutput": selected, "status": ["Gathered Kaggle urls"]}


def download_kaggle_files(state: AgentState, data_dir: str = './data') -> dict:
    urls = [tso.url for tso in state['tavilySearchOutput']]

    api = KaggleApi()
    api.authenticate()

    base_dir = Path(data_dir) / 'kaggle'
    base_dir.mkdir(parents=True, exist_ok=True)

    def sanitize_slug(slug: str) -> str:
        return re.sub(r'[^a-zA-Z0-9._-]+', '_', slug.replace('/', '__'))

    bundles: List[DownloadedDataset] = []

    for url in urls:
        m = re.search(r'kaggle\.com/datasets/([^/]+/[^/?#]+)', url)
        if not m:
            continue
        slug = m.group(1)
        owner = slug.split('/')[0]
        name = slug.split('/')[-1]

        dest_dir = base_dir / sanitize_slug(slug)
        dest_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Attempt to download the dataset directly
            # The download will fail if the dataset doesn't exist or isn't accessible
            api.dataset_download_files(
                slug,
                path=str(dest_dir),
                force=False,
                quiet=True,
                unzip=True
            )
        except Exception as e:
            print(f"Failed to download dataset {slug}: {str(e)}")
            # Continue with other datasets instead of failing completely
            continue

        # Try to fetch rich dataset metadata from Kaggle
        kaggle_description = None
        try:
            # Get metadata file from the downloaded dataset
            metadata_file = dest_dir / "dataset-metadata.json"
            if metadata_file.exists():
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                kaggle_description = metadata.get('subtitle') or metadata.get('description')
        except Exception as e:
            print(f"Could not fetch metadata for dataset {slug}: {str(e)}")
            kaggle_description = None

        files: List[FileRecord] = []
        # Define supported columnar file extensions
        SUPPORTED_EXTENSIONS = {'.csv', '.xlsx', '.xls', '.json'}
        # Define file size limit (100MB)
        MAX_FILE_SIZE = 100 * 1024 * 1024
        
        for p in dest_dir.rglob('*'):
            if p.is_file():
                try:
                    size = p.stat().st_size
                    # Skip files that are too large or not supported formats
                    if size > MAX_FILE_SIZE or p.suffix.lower() not in SUPPORTED_EXTENSIONS:
                        continue
                except Exception:
                    continue
                files.append(FileRecord(
                    path=str(p.resolve()),
                    rel_path=str(p.relative_to(dest_dir)),
                    ext=p.suffix.lower(),
                    name=p.name,
                    size_bytes=int(size) if size is not None else None,
                ))

        bundles.append(DownloadedDataset(
            source_url=url,
            source_id=slug,
            display_name=name,
            dest_dir=str(dest_dir.resolve()),
            files=files,
            meta={
                'owner': owner,
                'num_files': len(files),
                'description': kaggle_description,
            }
        ))

    return {"download_results": bundles, "status": ["Downloaded Kaggle bundles"]}


def get_metadata(state: AgentState):
    bundles = state.get("download_results", []) if isinstance(state, dict) else []
    
    # Import concurrent.futures for parallel processing
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading

    def process_single_file(file) -> FileOutput:
        """Process a single file to extract metadata"""
        file_path = file.path
        file_ext = file.ext.lower()
        file_size = file.size_bytes
        
        fo = FileOutput(
            file_path=file_path,
            file_format=file_ext.replace('.', ''),
            file_size=file_size,
            num_rows=None,
            num_columns=None,
            num_rows_with_missing=None,
            num_columns_with_missing=None,
            column_dtypes=None
        )
        
        try:
            if file_ext == ".csv":
                # Try multiple CSV parsing strategies for malformed files
                try:
                    # First attempt: standard parsing
                    df = pd.read_csv(file_path)
                except pd.errors.ParserError:
                    try:
                        # Second attempt: more lenient parsing with Python engine
                        df = pd.read_csv(file_path, engine='python', on_bad_lines='skip')
                    except Exception:
                        try:
                            # Third attempt: handle quoting issues
                            df = pd.read_csv(file_path, quoting=1, escapechar='\\', on_bad_lines='skip')
                        except Exception:
                            # Final attempt: read as text and clean manually
                            import csv
                            rows = []
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                reader = csv.reader(f, quoting=csv.QUOTE_NONE, escapechar='\\')
                                for i, row in enumerate(reader):
                                    if i == 0:  # Header
                                        headers = row
                                    else:
                                        if len(row) == len(headers):
                                            rows.append(row)
                                        elif len(row) > len(headers):
                                            # Truncate extra fields
                                            rows.append(row[:len(headers)])
                                        # Skip rows with too few fields
                            if rows:
                                df = pd.DataFrame(rows, columns=headers)
                            else:
                                df = None
            elif file_ext in [".xlsx", ".xls"]:
                df = pd.read_excel(file_path)
            elif file_ext == ".json":
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    df = pd.DataFrame(data)
                elif isinstance(data, dict):
                    df = pd.json_normalize(data)
                else:
                    df = None
            else:
                df = None

            if df is not None:
                fo.num_rows = int(df.shape[0])
                fo.num_columns = int(df.shape[1])
                fo.column_dtypes = {str(col): str(dtype) for col, dtype in df.dtypes.items()}
                isnull = df.isnull()
                fo.num_rows_with_missing = int(isnull.any(axis=1).sum())
                fo.num_columns_with_missing = int(isnull.any(axis=0).sum())
        except Exception as e:
            # Log the error for debugging but continue processing
            print(f"Error processing file {file_path}: {str(e)}")
            pass
        
        return fo

    def infer_possibility_simple(files: List[FileOutput]) -> str:
        from collections import Counter

        numeric_types = {"int", "float", "double", "decimal", "number"}
        text_types = {"object", "string", "str", "text", "category"}
        time_types = {"date", "time", "timestamp", "datetime"}
        label_keywords = {"target", "label", "sentiment", "class", "rating", "price", "value", "score", "output", "y"}

        votes = Counter()
        label_col_candidates = []

        for fo in files:
            col_dtypes = getattr(fo, "column_dtypes", None)
            if not col_dtypes or not isinstance(col_dtypes, dict):
                continue

            for col, dt in col_dtypes.items():
                lc = (col or "").lower()
                sd = (dt or "").lower()
                if any(x in lc for x in label_keywords):
                    label_col_candidates.append((col, sd))

                if any(x in lc for x in time_types) or any(x in sd for x in time_types):
                    votes["time_series"] += 1
                if any(x in sd for x in numeric_types):
                    votes["numeric"] += 1
                if any(x in sd for x in text_types):
                    votes["text"] += 1

        if label_col_candidates:
            for col, sd in label_col_candidates:
                if any(x in sd for x in numeric_types):
                    votes["regression"] += 1
                elif any(x in sd for x in text_types):
                    votes["classification"] += 1
                else:
                    votes["classification"] += 1

        if votes["time_series"] > 0:
            return "time_series"
        if votes["regression"] > 0:
            return "regression"
        if votes["classification"] > 0:
            return "classification"
        if votes["numeric"] > 0 and votes["text"] > 0:
            return "classification"
        if votes["numeric"] > 0:
            return "regression"
        if votes["text"] > 0:
            return "classification"
        return "other"

    dataset_outputs: List[DatasetOutput] = []
    file_outputs: List[FileOutput] = []

    for bundle in bundles:
        files_for_dataset: List[FileOutput] = []
        
        # Process files in parallel using ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=4) as executor:
            # Submit all file processing tasks
            future_to_file = {executor.submit(process_single_file, file): file for file in bundle.files}
            
            # Collect results as they complete
            for future in as_completed(future_to_file):
                try:
                    fo = future.result()
                    files_for_dataset.append(fo)
                    file_outputs.append(fo)
                except Exception as e:
                    # If processing fails, create a basic FileOutput without metadata
                    file = future_to_file[future]
                    fo = FileOutput(
                        file_path=file.path,
                        file_format=file.ext.replace('.', ''),
                        file_size=file.size_bytes,
                        num_rows=None,
                        num_columns=None,
                        num_rows_with_missing=None,
                        num_columns_with_missing=None,
                        column_dtypes=None
                    )
                    files_for_dataset.append(fo)
                    file_outputs.append(fo)

        file_ctx_list = []
        for fo_item in files_for_dataset:
            file_ctx_list.append({
                "file_path": fo_item.file_path,
                "name": Path(fo_item.file_path).name if fo_item.file_path else None,
                "format": fo_item.file_format,
                "num_rows": fo_item.num_rows,
                "num_columns": fo_item.num_columns,
                "num_rows_with_missing": fo_item.num_rows_with_missing,
                "num_columns_with_missing": fo_item.num_columns_with_missing,
                "column_dtypes": fo_item.column_dtypes,
                "sample_columns": list(fo_item.column_dtypes.keys())[:15] if fo_item.column_dtypes else None,
            })
        llm_context = {
            "source_url": bundle.source_url,
            "source_id": getattr(bundle, "source_id", None),
            "display_name": getattr(bundle, "display_name", None),
            "owner": (bundle.meta or {}).get("owner") if hasattr(bundle, "meta") else None,
            "num_files": len(files_for_dataset),
            "files": file_ctx_list,
        }

        llm_for_meta = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)

        prompt = (
            "You are analyzing ONE specific Kaggle dataset link.\n"
            "Write a concise, 1-sentence description focusing on what the data represents (the subject matter and scope). "
            "Do NOT include dataset names, file names, or column names. "
            "Focus on the real-world content and purpose rather than technical details.\n"
            "Then select the single best-use category for modeling from {classification, regression, clustering, time_series, text_generation, image_generation, other}.\n"
            "Output STRICT JSON only with keys 'description' and 'possibilities'. No preamble.\n\n"
            f"Dataset identification:\n"
            f"- source_url: {llm_context['source_url']}\n"
            f"- source_id: {llm_context.get('source_id')}\n"
            f"- display_name: {llm_context.get('display_name')}\n"
            f"- owner: {llm_context.get('owner')}\n"
            f"File summaries JSON: {json.dumps(file_ctx_list) }"
        )

        # Prefer Kaggle-provided description when present
        description = (bundle.meta or {}).get('description')
        possibility = None
        try:
            # Only call LLM when Kaggle doesn't provide description
            if not description:
                resp = llm_for_meta.invoke(prompt)
                content = getattr(resp, "content", "")
                start = content.find("{")
                end = content.rfind("}")
                if start != -1 and end != -1 and end > start:
                    js = content[start: end + 1]
                    data = json.loads(js)
                    description = (data.get("description") or "").strip() or None
                    poss = (data.get("possibilities") or "").strip().lower()
                    allowed = {"classification", "regression", "clustering", "time_series", "text_generation", "image_generation", "other"}
                    possibility = poss if poss in allowed else None
        except Exception:
            pass

        if possibility is None:
            possibility = infer_possibility_simple(files_for_dataset)

        # Only include datasets that have at least one file with metadata
        valid_files = [f for f in files_for_dataset if f.num_rows is not None and f.num_columns is not None]
        
        if valid_files:  # Only add dataset if it has valid columnar files
            ds = DatasetOutput(
                source_url=bundle.source_url,
                num_files=len(valid_files),
                description=description,
                possibilities=possibility,
                files=valid_files,
            )
            dataset_outputs.append(ds)

    return {
        "file_outputs": file_outputs,
        "dataset_outputs": dataset_outputs,
        "status": ["Generated file and dataset metadata"]
    }


def end_agent(state: AgentState):
    return state


# Graph
graph = StateGraph(AgentState)

graph.add_node("tavily_search", tavily_search_tool)
graph.add_node("download_kaggle_files", download_kaggle_files)
graph.add_node("get_metadata", get_metadata)
graph.add_node("end_agent", end_agent)

graph.add_edge(START, "tavily_search")
graph.add_edge("tavily_search", "download_kaggle_files")
graph.add_edge("download_kaggle_files", "get_metadata")
graph.add_edge("get_metadata", "end_agent")

final_graph = graph.compile()


def run_agent(query: str) -> Dict[str, Any]:
    """Run the agent pipeline and return the final state with results."""
    initial_state: AgentState = {
        "query": query,
        "tavilySearchOutput": [],
        "status": [],
        "download_results": [],
        "dataset_outputs": [],
    }
    # Execute graph and return final accumulated state
    final_state = final_graph.invoke(initial_state)
    # Convert pydantic models to dicts when present
    def model_to_dict(x):
        try:
            return x.model_dump()  # type: ignore[attr-defined]
        except Exception:
            return x
    out: Dict[str, Any] = {}
    for k, v in (final_state or {}).items():
        if isinstance(v, list):
            out[k] = [model_to_dict(i) for i in v]
        else:
            out[k] = model_to_dict(v)
    return out


if __name__ == "__main__":
    # Optional visualization and demo run for notebooks/local testing
    try:
        display(Image(final_graph.get_graph().draw_mermaid_png()))
    except Exception:
        pass

    # CLI: require a user-provided query instead of a hardcoded demo
    import argparse

    parser = argparse.ArgumentParser(description="Run the Nexora agent pipeline")
    parser.add_argument("--query", required=True, help="Search query for datasets (e.g., 'air quality time series')")
    args = parser.parse_args()

    state = AgentState(query=args.query)
    for event in final_graph.stream(state):
        print(event)


