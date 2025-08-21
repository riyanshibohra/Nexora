from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn
import os
from dotenv import load_dotenv
from tavily import TavilyClient

# Load environment variables
load_dotenv()

app = FastAPI(title="Nexora API", description="AI-Powered Dataset Discovery")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],  # Vite dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Tavily client
TAVILY_API_KEY = os.getenv('TAVILY_API_KEY')
if not TAVILY_API_KEY:
    raise ValueError("TAVILY_API_KEY environment variable is required")

tavily_client = TavilyClient(api_key=TAVILY_API_KEY)

# Data models matching the frontend and your tavily_search_tool
class TavilySearchOutput(BaseModel):
    title: str
    url: str
    content: str

class SearchRequest(BaseModel):
    query: str

class SearchResponse(BaseModel):
    results: List[TavilySearchOutput]
    total: int

def tavily_search_tool(query: str) -> List[TavilySearchOutput]:
    """
    Real implementation of your tavily_search_tool function
    This searches Kaggle only and returns up to 10 most relevant, deduped dataset links.
    """
    site_queries = {
        "kaggle": f"{query} dataset site:kaggle.com/datasets"
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
        if any(x in u for x in [".csv", ".xlsx", ".json", "/download", "/raw/"]):
            score += 3.0
        if any(x in c for x in ["csv", "xlsx", "json", "download"]):
            score += 2.0
        for tok in set(query.lower().split()):
            if tok and (tok in t or tok in c):
                score += 0.5
        if site == "kaggle":
            score += 0.5
        return score

    candidates: list[tuple[str, TavilySearchOutput, float]] = []
    seen_urls: set[str] = set()

    # Collect per-site, compute scores (Kaggle only)
    for site, q in site_queries.items():
        try:
            r = tavily_client.search(query=q, search_depth="basic", max_results=15)
        except Exception as e:
            print(f"Error searching {site}: {e}")
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

    for _, tso, _ in candidates:
        if len(selected) >= 10:
            break
        if tso.url in used_urls:
            continue
        selected.append(tso)
        used_urls.add(tso.url)

    return selected

@app.get("/")
async def root():
    return {"message": "Welcome to Nexora API - AI-Powered Dataset Discovery"}

@app.post("/api/search", response_model=SearchResponse)
async def search_datasets(request: SearchRequest):
    """
    Use the real tavily_search_tool to search for datasets
    """
    try:
        # Call the real tavily_search_tool
        results = tavily_search_tool(request.query)
        
        return SearchResponse(
            results=results,
            total=len(results)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Nexora API", "tavily_configured": bool(TAVILY_API_KEY)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 