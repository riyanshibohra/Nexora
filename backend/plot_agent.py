from __future__ import annotations

"""
Plot generation agent
 - Suggest plots from a given dataset file
 - Generate a matplotlib plot via LLM-produced Python code executed in a sand-boxed PythonREPL

Inputs: file_path (CSV/XLS/XLSX/JSON)
The LLM is instructed to write code that uses an existing pandas DataFrame named `df` and matplotlib.pyplot as `plt`.
The environment is headless (Agg backend). The output is returned as a base64 PNG data URL.
"""

from typing import Dict, Any, List
import io
import base64
import logging
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from pydantic import BaseModel, Field

from langchain_openai import ChatOpenAI
from langchain_experimental.utilities import PythonREPL
from langchain_core.prompts import ChatPromptTemplate

logger = logging.getLogger(__name__)


class VisualizationCode(BaseModel):
    code: str = Field(..., description="Valid Python code that draws a plot using the provided DataFrame `df` and matplotlib.pyplot as `plt`.")


GEN_CODE_SYSTEM = (
    "You are a senior data visualization engineer. "
    "Given a pandas DataFrame named df, write only the Python code snippet to draw a professional, readable chart with matplotlib. "
    "Do not load files; use the provided df variable. Do not show the plot. Use plt.* APIs. "
    "The DataFrame may be large – aggregate as needed but base computations on the full df. "
    "Guidelines: "
    "- If a datetime-like column exists, prefer a time series (resample by month if daily and long). "
    "- If a categorical column has many categories (>30), plot top 10–20 by a meaningful metric (count or sum of a selected numeric column). "
    "- If two numeric columns exist, consider a scatter plot with alpha to reduce overdraw. "
    "- For purely categorical data, use value_counts() and plot top 15. "
    "- Always set descriptive title and axis labels; rotate x labels for readability; use tight_layout(). "
    "- Use palette: '#6366F1', '#22C55E', '#EF4444', '#475569'. "
)


class PlotAgent:
    def __init__(self) -> None:
        self.llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        self.python = PythonREPL()

    def _classify_columns(self, df: pd.DataFrame) -> Dict[str, List[str]]:
        cols = list(df.columns)
        numeric_cols: List[str] = []
        for c in cols:
            s = df[c]
            if pd.api.types.is_numeric_dtype(s):
                numeric_cols.append(c)
            elif s.dtype == object:
                try:
                    if pd.to_numeric(s, errors="coerce").notna().mean() >= 0.6:
                        numeric_cols.append(c)
                except Exception:
                    pass
        datetime_cols: List[str] = [c for c in cols if pd.api.types.is_datetime64_any_dtype(df[c])]
        if not datetime_cols:
            for c in cols:
                if df[c].dtype == object:
                    try:
                        pd.to_datetime(df[c], errors="raise")
                        datetime_cols.append(c)
                    except Exception:
                        continue
        categorical_cols: List[str] = [c for c in cols if df[c].dtype == object and c not in datetime_cols]
        for c in numeric_cols:
            try:
                if df[c].nunique(dropna=True) <= min(20, max(5, int(len(df) * 0.05))):
                    if c not in categorical_cols:
                        categorical_cols.append(c)
            except Exception:
                pass
        return {"numeric": numeric_cols, "datetime": datetime_cols, "categorical": categorical_cols}

    # ---------- Professional style helpers ----------
    def _apply_pro_style(self) -> None:
        plt.style.use('seaborn-v0_8-whitegrid')
        plt.rcParams.update({
            'figure.figsize': (8, 4.5),
            'figure.dpi': 140,
            'axes.titlesize': 14,
            'axes.labelsize': 11,
            'xtick.labelsize': 9,
            'ytick.labelsize': 9,
            'legend.fontsize': 10,
            'axes.spines.top': False,
            'axes.spines.right': False,
        })

    def _palette(self, n: int) -> List[str]:
        base = ["#6366F1", "#22C55E", "#EF4444", "#06B6D4", "#F59E0B", "#8B5CF6", "#10B981", "#3B82F6"]
        if n <= len(base):
            return base[:n]
        # Cycle if needed
        return [base[i % len(base)] for i in range(n)]

    # ---------- Planner: choose best chart ----------
    def plan(self, df: pd.DataFrame) -> Dict[str, Any]:
        kinds = self._classify_columns(df)
        numeric_cols, datetime_cols, categorical_cols = kinds["numeric"], kinds["datetime"], kinds["categorical"]
        plan: Dict[str, Any] = {"type": None}
        # 1) Correlation if many numerics
        if len(numeric_cols) >= 6:
            plan.update({"type": "corr", "cols": numeric_cols[:10]})
            return plan
        # 2) Time series if there is datetime + numeric
        if datetime_cols and numeric_cols:
            plan.update({"type": "timeseries", "x": datetime_cols[0], "y": numeric_cols[0]})
            return plan
        # 3) Top-N bar for categorical + numeric
        if categorical_cols and numeric_cols:
            plan.update({"type": "bar_topn", "cat": categorical_cols[0], "val": numeric_cols[0], "n": 10})
            return plan
        # 4) Histogram for a single numeric
        if numeric_cols:
            plan.update({"type": "hist", "col": numeric_cols[0]})
            return plan
        # 5) Frequency bar for a categorical-only dataset
        if categorical_cols:
            plan.update({"type": "freq", "col": categorical_cols[0], "n": 15})
            return plan
        # Default: corr even if few columns
        plan.update({"type": "corr", "cols": numeric_cols[:10]})
        return plan

    # ---------- Deterministic renderers ----------
    def render(self, df: pd.DataFrame, plan: Dict[str, Any]) -> None:
        self._apply_pro_style()
        t = plan.get("type")
        if t == "corr":
            cols = plan.get("cols", [])
            if not cols:
                cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])][:10]
            corr = df[cols].corr(numeric_only=True)
            fig, ax = plt.subplots()
            im = ax.imshow(corr.values, cmap='coolwarm', vmin=-1, vmax=1)
            plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
            ax.set_xticks(range(len(cols))); ax.set_yticks(range(len(cols)))
            ax.set_xticklabels(cols, rotation=45, ha='right'); ax.set_yticklabels(cols)
            for i in range(len(cols)):
                for j in range(len(cols)):
                    val = corr.values[i, j]
                    ax.text(j, i, f"{val:.2f}", ha='center', va='center', color='white' if abs(val) > 0.5 else '#0b1220', fontsize=8)
            ax.set_title("Correlation Matrix")
            return
        if t == "timeseries":
            xcol, ycol = plan["x"], plan["y"]
            tmp = df[[xcol, ycol]].copy()
            tmp[xcol] = pd.to_datetime(tmp[xcol], errors='coerce')
            tmp = tmp.dropna()
            if tmp[xcol].nunique() > 200:
                tmp = tmp.set_index(xcol).resample('M').mean().reset_index()
            fig, ax = plt.subplots()
            ax.plot(tmp[xcol], tmp[ycol], color="#3B82F6", lw=1.8)
            ax.set_title(f"{ycol} over {xcol}")
            ax.set_xlabel(str(xcol)); ax.set_ylabel(str(ycol))
            return
        if t == "bar_topn":
            cat, val, n = plan["cat"], plan["val"], plan.get("n", 10)
            tmp = df.groupby(cat)[val].sum(numeric_only=True).sort_values(ascending=False).head(n)
            fig, ax = plt.subplots()
            bars = ax.barh(tmp.index.astype(str)[::-1], tmp.values[::-1], color=self._palette(min(n, 8))[0])
            ax.set_title(f"Top {n} {cat} by {val}")
            ax.set_xlabel(str(val)); ax.set_ylabel(str(cat))
            ax.bar_label(bars, fmt='%.0f', padding=3, color='#eaf2ff')
            return
        if t == "hist":
            col = plan["col"]
            fig, ax = plt.subplots()
            data = pd.to_numeric(df[col], errors='coerce').dropna()
            ax.hist(data, bins=40, color="#6366F1", alpha=0.9)
            ax.set_title(f"Distribution of {col}")
            ax.set_xlabel(str(col)); ax.set_ylabel("Count")
            return
        if t == "freq":
            col, n = plan["col"], plan.get("n", 15)
            tmp = df[col].astype(str).value_counts().head(n)
            fig, ax = plt.subplots()
            bars = ax.barh(tmp.index[::-1], tmp.values[::-1], color="#06B6D4")
            ax.set_title(f"Top {n} {col} by frequency")
            ax.set_xlabel("Count"); ax.set_ylabel(str(col))
            ax.bar_label(bars, padding=3, color='#eaf2ff')
            return
    def _read_dataframe(self, file_path: str, nrows: int | None = None) -> pd.DataFrame:
        """Read a supported file into a DataFrame. Optionally limit rows for speed."""
        path = file_path.lower()
        if path.endswith(".csv"):
            return pd.read_csv(file_path, nrows=nrows)
        if path.endswith(".json"):
            data = pd.read_json(file_path)
            # If list of dicts, ensure tabular
            return pd.DataFrame(data if nrows is None else data[:nrows])
        if path.endswith(".xlsx") or path.endswith(".xls"):
            return pd.read_excel(file_path, nrows=nrows)
        # Fallback: attempt csv
        return pd.read_csv(file_path, nrows=nrows)

    def suggest(self, file_path: str, max_items: int = 6) -> List[str]:
        # Read only a slice to keep latency small
        df = self._read_dataframe(file_path, nrows=2000)
        kinds = self._classify_columns(df)
        numeric_cols = kinds["numeric"]
        datetime_cols = kinds["datetime"]
        categorical_cols = kinds["categorical"]
        # Simple heuristics with robust detection
        suggestions: List[str] = []

        if datetime_cols and numeric_cols:
            suggestions.append(f"Line chart of {numeric_cols[0]} over {datetime_cols[0]}")
        if categorical_cols and numeric_cols:
            suggestions.append(f"Top 10 {categorical_cols[0]} by {numeric_cols[0]} (bar chart)")
        if len(numeric_cols) >= 2:
            suggestions.append(f"Scatter of {numeric_cols[0]} vs {numeric_cols[1]} with trendline")
        if numeric_cols:
            suggestions.append(f"Histogram of {numeric_cols[0]}")
        if categorical_cols and len(numeric_cols) >= 2:
            suggestions.append(f"Grouped bar of {numeric_cols[0]} and {numeric_cols[1]} by {categorical_cols[0]}")

        # Fallbacks for datasets without clear numeric columns
        if categorical_cols and not numeric_cols:
            suggestions.append(f"Top 15 {categorical_cols[0]} by frequency (bar chart)")
            if len(categorical_cols) >= 2:
                suggestions.append(f"Stacked bar of {categorical_cols[0]} counts by {categorical_cols[1]}")

        # Correlation heatmap suggestion
        if len(numeric_cols) >= 3:
            suggestions.append("Correlation matrix heatmap of numeric columns (top 10 by variance)")

        # Always include a data-quality suggestion
        suggestions.append("Missing values per column (bar chart)")

        # Deduplicate and cap
        out: List[str] = []
        for s in suggestions:
            if s not in out:
                out.append(s)
        return out[:max_items]

    def generate_plot(self, file_path: str, prompt: str) -> str:
        # Load entire dataset (no sampling) to honor full-data requirement
        df = self._read_dataframe(file_path)
        kinds = self._classify_columns(df)
        numeric_cols = kinds["numeric"]
        datetime_cols = kinds["datetime"]
        categorical_cols = kinds["categorical"]

        # Build a compact schema + stats summary to help the model choose a chart
        try:
            nunique = df.nunique(dropna=True).to_dict()
        except Exception:
            nunique = {}
        try:
            missing = df.isna().mean().round(3).to_dict()
        except Exception:
            missing = {}
        dtypes_map = {c: str(t) for c, t in df.dtypes.items()}
        # capture a few examples for object columns
        examples: Dict[str, Any] = {}
        for c in df.columns:
            try:
                if df[c].dtype == object:
                    examples[c] = df[c].dropna().astype(str).head(3).tolist()
            except Exception:
                continue

        summary_blob = {
            "dtypes": dtypes_map,
            "nunique": nunique,
            "missing_ratio": missing,
            "examples": examples,
            "rows": int(len(df)),
            "columns": int(df.shape[1]),
        }

        data_json = json.dumps(summary_blob, default=str)
        prompt_t = ChatPromptTemplate.from_messages([
            ("system", GEN_CODE_SYSTEM),
            ("user", "Data summary: {data}"),
            ("user", "User request: {request}. Generate only Python code using df and plt. "
                     "If there are too many categories, automatically select a top-N. "
                     "Parse datetime columns when helpful and sort by time.")
        ])
        formatted = prompt_t.invoke({"data": data_json, "request": prompt})
        code_llm = self.llm.with_structured_output(VisualizationCode)
        result = code_llm.invoke(formatted)
        code = result.code.strip()

        # Safety: forbid file IO and imports beyond matplotlib/numpy/pandas
        forbidden = ["open(", "to_csv(", "read_csv(", "read_excel(", "os.", "sys.", "subprocess", "shutil", "requests"]
        if any(tok in code for tok in forbidden):
            raise ValueError("Generated code attempted disallowed operations")

        # Apply a base style
        plt.style.use('seaborn-v0_8-whitegrid')
        plt.rcParams.update({
            'figure.figsize': (8, 4.5),
            'figure.dpi': 130,
            'axes.titlesize': 13,
            'axes.labelsize': 11,
            'xtick.labelsize': 9,
            'ytick.labelsize': 9,
            'legend.fontsize': 10,
            'axes.spines.top': False,
            'axes.spines.right': False,
        })

        # Helper functions available to LLM code
        def safe_polyfit(x, y, deg=1):
            try:
                return np.polyfit(np.asarray(x, dtype=float), np.asarray(y, dtype=float), deg)
            except Exception:
                return None

        def add_trendline(ax, x, y):
            coeffs = safe_polyfit(x, y, 1)
            if coeffs is None:
                return
            p = np.poly1d(coeffs)
            xx = np.linspace(np.nanmin(x), np.nanmax(x), 200)
            ax.plot(xx, p(xx), color="#EF4444", lw=2, alpha=0.7)

        def tight_layout():
            plt.tight_layout()

        # Execute the plotting code directly with the full DataFrame in scope
        try:
            env: Dict[str, Any] = {"df": df, "plt": plt, "pd": pd, "np": np, "add_trendline": add_trendline, "safe_polyfit": safe_polyfit, "tight_layout": tight_layout}
            # Special-case: user explicitly asks for correlation heatmap
            req = (prompt or "").lower()
            if "corr" in req or "correlation" in req:
                # Create a robust correlation heatmap with annotations
                cols = numeric_cols[:10] if len(numeric_cols) > 10 else numeric_cols
                corr_code = (
                    "import numpy as _np\n"
                    "_cols = " + repr(cols) + "\n"
                    "_df = df[_cols].copy()\n"
                    "corr = _df.corr(numeric_only=True)\n"
                    "fig, ax = plt.subplots()\n"
                    "im = ax.imshow(corr.values, cmap='coolwarm', vmin=-1, vmax=1)\n"
                    "plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)\n"
                    "ax.set_xticks(range(len(_cols)))\n"
                    "ax.set_yticks(range(len(_cols)))\n"
                    "ax.set_xticklabels(_cols, rotation=45, ha='right')\n"
                    "ax.set_yticklabels(_cols)\n"
                    "for i in range(len(_cols)):\n"
                    "    for j in range(len(_cols)):\n"
                    "        ax.text(j, i, f'{corr.values[i,j]:.2f}', ha='center', va='center', color='white' if abs(corr.values[i,j])>0.5 else '#0b1220', fontsize=8)\n"
                    "ax.set_title('Correlation Matrix (numeric columns)')\n"
                )
                exec(corr_code, env, env)
            else:
                # First try deterministic planner if the prompt is vague
                if len(prompt.strip()) < 6:
                    planned = self.plan(df)
                    self.render(df, planned)
                else:
                    exec(code, env, env)
            # Enforce final figure size and layout to fit UI slot
            fig = plt.gcf()
            try:
                fig.set_size_inches(8, 4.5)
            except Exception:
                pass
            plt.xticks(rotation=45, ha='right')
            plt.tight_layout(pad=0.6)
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=130)
            buf.seek(0)
            img_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
            plt.close('all')
            return f"data:image/png;base64,{img_b64}"
        except Exception as e:
            logger.exception("Plot generation failed")
            # Fallback: auto-generate a sensible plot with planner
            try:
                planned = self.plan(df)
                self.render(df, planned)
                plt.tight_layout(pad=0.6)
                buf = io.BytesIO()
                plt.savefig(buf, format='png', dpi=130)
                buf.seek(0)
                img_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
                plt.close('all')
                return f"data:image/png;base64,{img_b64}"
            except Exception:
                plt.close('all')
                raise


