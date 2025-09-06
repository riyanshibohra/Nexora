<div align="center">
  
  <h1>Nexora: Data Explorer Agent</h1>
  <p>Agentic dataset discovery, profiling, and visualization. From query to analysis‑ready data in minutes.</p>
  
  <p>
    <a href="https://github.com/riyanshibohra/Nexora">GitHub</a>
    ·
    <a href="#-features">Features</a>
    ·
    <a href="#-quickstart">Quickstart</a>
    ·
    <a href="#-architecture">Architecture</a>
    ·
    <a href="#-api">API</a>
  </p>
</div>

<div align="center">
  
  <!-- Backend / Agent -->
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/LangChain-121212?style=for-the-badge&logo=chainlink&logoColor=white" />
  <img src="https://img.shields.io/badge/LangGraph-FF6B6B?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Kaggle-20BEFF?style=for-the-badge&logo=kaggle&logoColor=white" />
  <img src="https://img.shields.io/badge/Tavily-000000?style=for-the-badge" />
  <img src="https://img.shields.io/badge/pandas-150458?style=for-the-badge&logo=pandas&logoColor=white" />
  <img src="https://img.shields.io/badge/NumPy-013243?style=for-the-badge&logo=numpy&logoColor=white" />
  <img src="https://img.shields.io/badge/matplotlib-11557c?style=for-the-badge" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />

  <!-- Frontend -->
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=000000" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white" />

</div>

---

## ✨ Overview

Nexora is an AI‑native “data universe explorer” that turns a plain‑English query into curated, profiled, and visualizable datasets. It runs an agentic workflow to search Kaggle, download relevant columnar files (CSV/XLSX/JSON), profile them with pandas, and generate safe matplotlib plots via LLM codegen - all surfaced through a clean FastAPI backend and a React + Three.js frontend.

---

## 🚀 Features

- Agentic pipeline (LangGraph + LangChain) orchestrating: search → download → profile → describe → plot
- Targeted discovery via Tavily + Kaggle API (columnar-first, dedup, file size caps)
- Profiling with pandas: row/column counts, dtype map, missingness; task fit inference
- Sandboxed plotting: GPT‑4o/4o‑mini → matplotlib, headless (Agg) in a restricted Python REPL, returns base64 PNG
- Durable storage: SQLite (WAL) with idempotent upserts and sensible indexes
- Production-friendly FastAPI with CORS for local dev
- Frontend: React/Vite + Three.js interactive results, instant previews, one‑click exports

---

## ⚙️ Tech Stack

- Backend: FastAPI, LangGraph, LangChain, pandas, matplotlib, SQLite
- Tooling/Integrations: Tavily, Kaggle API, python‑dotenv
- Frontend: React, Vite, Three.js, React Router

---

## 🧰 Prerequisites

- Python 3.12+
- Node.js 18+
- Kaggle credentials configured (~/.kaggle/kaggle.json)
- API keys in environment (.env):
  - OPEN_API_KEY (OpenAI)
  - TAVILY_API_KEY

---

## 🔧 Quickstart

1) Backend setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

2) Frontend setup (in `frontend/`)

```bash
cd frontend
npm install
npm run dev
```

Visit the app at `http://127.0.0.1:5173`.

---

## 🧠 How It Works

1. Search: The agent queries Tavily for Kaggle dataset links and ranks for columnar relevance.
2. Download: Datasets are fetched via Kaggle API with safe filenames and size limits.
3. Profile: pandas computes rows/cols, dtypes, and missingness with resilient CSV/Excel/JSON parsing.
4. Describe: A concise dataset description and task fit (classification/regression/etc.).
5. Plot: GPT‑4o‑mini generates matplotlib code executed headless in a restricted Python REPL; images are returned as base64.
6. Persist + Serve: Metadata stored in SQLite (WAL); FastAPI exposes endpoints for the frontend.

---

## 🧱 Architecture

```
Frontend (React/Vite + Three.js)
   │
   ▼
FastAPI (backend/main.py)
   ├─ Agent pipeline (backend/agent.py)
   │   ├─ Tavily search → Kaggle download → pandas profile → LLM describe
   │   └─ LangGraph state machine orchestration
   ├─ Plot agent (backend/plot_agent.py)
   │   └─ GPT‑4o‑mini → matplotlib in restricted PythonREPL (Agg)
   └─ DB layer (backend/db.py, SQLite WAL)
```

Key endpoints:

- POST `/run-agent` — Run the pipeline for a query
- GET `/datasets` — List profiled datasets
- GET `/dataset?source_url=` — Get one dataset + files
- GET `/file-preview` — Sample rows for preview
- GET `/download-file` — Download a specific file
- GET `/download-dataset-zip` — Zip all available files
- POST `/plot/suggestions` — Heuristic plot prompts
- POST `/plot/generate` — LLM‑generated matplotlib plot

---

## 🖥️ Frontend Highlights

- Landing search with typewriter prompt and DataMesh background
- Results view with a galaxy‑style visualization (Three.js)
- Dataset modal and analysis page with schema/missingness and previews
- Promptable plot generation with suggestions and one‑click export

---

## 🔒 Safety & Reliability

- Restricted Python REPL: no file IO/imports beyond plotting stack
- Agg backend, deterministic sizing, and style for plots
- Multi‑strategy CSV parsing and Excel via `openpyxl`/`xlrd`
- SQLite WAL, transactional upserts, and indices

---

## 📦 Environment Variables

Create a `.env` at the repo root:

```env
OPEN_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
```

Kaggle setup: ensure `~/.kaggle/kaggle.json` exists and is readable.

---


## 🤝 Contributing

PRs and issues are welcome. Please open an issue to discuss significant changes.

---

## 📄 License

MIT © 2025 Riyanshi Bohra — see [LICENSE](./LICENSE)
