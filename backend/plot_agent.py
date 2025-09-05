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
    "Use clear titles, axis labels with units where applicable, rotated x-ticks for readability, and tight_layout. "
    "Prefer bar/line for categorical/time series, hist for distributions, scatter for correlations. "
    "Keep colors professional: '#6366F1', '#22C55E', '#EF4444', '#475569'. "
)


class PlotAgent:
    def __init__(self) -> None:
        self.llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        self.python = PythonREPL()

    def _read_dataframe(self, file_path: str) -> pd.DataFrame:
        """Read a supported file into a DataFrame."""
        path = file_path.lower()
        if path.endswith(".csv"):
            return pd.read_csv(file_path)
        if path.endswith(".json"):
            data = pd.read_json(file_path)
            # If list of dicts, ensure tabular
            return pd.DataFrame(data)
        if path.endswith(".xlsx") or path.endswith(".xls"):
            return pd.read_excel(file_path)
        # Fallback: attempt csv
        return pd.read_csv(file_path)

    def suggest(self, file_path: str, max_items: int = 6) -> List[str]:
        df = self._read_dataframe(file_path)
        # Simple heuristics
        suggestions: List[str] = []
        cols = list(df.columns)
        numeric_cols = [c for c in cols if pd.api.types.is_numeric_dtype(df[c])]
        datetime_cols = [c for c in cols if pd.api.types.is_datetime64_any_dtype(df[c])]
        # Attempt to parse dates from string cols
        if not datetime_cols:
            for c in cols:
                if df[c].dtype == object:
                    try:
                        parsed = pd.to_datetime(df[c], errors="raise")
                        datetime_cols.append(c)
                    except Exception:
                        pass

        categorical_cols = [c for c in cols if df[c].dtype == object and c not in datetime_cols]

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

        # Deduplicate and cap
        out: List[str] = []
        for s in suggestions:
            if s not in out:
                out.append(s)
        return out[:max_items]

    def generate_plot(self, file_path: str, prompt: str) -> str:
        df = self._read_dataframe(file_path)
        # Use a trimmed sample for speed but preserve types
        sample = df.copy()
        if len(sample) > 2000:
            sample = sample.sample(2000, random_state=42)

        # Register df in the REPL environment by executing a prepared prelude
        prelude = (
            "import matplotlib\n"
            "matplotlib.use('Agg')\n"
            "import matplotlib.pyplot as plt\n"
            "import pandas as pd\n"
        )
        self.python.run(prelude)
        # Inject the DataFrame via CSV buffer to avoid filesystem coupling in REPL
        csv_buf = io.StringIO()
        sample.to_csv(csv_buf, index=False)
        csv_text = csv_buf.getvalue()
        self.python.run("import io, pandas as pd\n")
        self.python.run("_csv_txt = '''" + csv_text.replace("'", "\'") + "'''\n")
        self.python.run("df = pd.read_csv(io.StringIO(_csv_txt))\n")

        prompt_t = ChatPromptTemplate.from_messages([
            ("system", GEN_CODE_SYSTEM),
            ("user", "DataFrame columns and dtypes:"),
            ("user", str(sample.dtypes)),
            ("user", f"User request: {prompt}. Generate only Python code using df and plt.")
        ])
        formatted = prompt_t.invoke({})
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
            'figure.figsize': (6, 2.8),
            'figure.dpi': 110,
            'axes.titlesize': 12,
            'axes.labelsize': 10,
            'xtick.labelsize': 8,
            'ytick.labelsize': 8,
            'legend.fontsize': 9,
            'axes.spines.top': False,
            'axes.spines.right': False,
        })

        # Execute the plotting code
        try:
            self.python.run(code)
            # Enforce final figure size and layout to fit UI slot
            fig = plt.gcf()
            try:
                fig.set_size_inches(6, 2.8)
            except Exception:
                pass
            plt.xticks(rotation=45, ha='right')
            plt.tight_layout(pad=0.6)
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=110)
            buf.seek(0)
            img_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
            plt.close('all')
            return f"data:image/png;base64,{img_b64}"
        except Exception as e:
            logger.exception("Plot generation failed")
            plt.close('all')
            raise


