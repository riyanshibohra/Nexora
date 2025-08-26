# Nexora - Data Universe Explorer 🚀

A space-themed, AI-powered dataset discovery platform that transforms the way you explore and find datasets. Instead of scrolling through lists, you'll navigate through a cosmic galaxy of data planets.

UI link: https://excalidraw.com/#json=ItKD10NjJOa5rhjB8Or4v,dBAEZOaF7zWzg639N1ldsQ


# Cell 4 (Markdown)
# Tools added:
# - Tavily search tool
#     - Task: Get the URLs, content, and title of where the dataset is located.
#     - Input: A user query
#     - Output: A TavilySearchOutput consisting of URLs, Title, Content
# - Download Kaggle Files
#     - Task: Download each Kaggle dataset URL into its own folder and return structured bundles for UI/analysis.
#     - Input: Output from Tavily Search Tool (TavilySearchOutput)
#     - Output: A list of DownloadedDataset objects, each containing:
#         - source_url: The original Kaggle dataset URL
#         - source_id: The Kaggle dataset identifier (e.g., "username/dataset-name")
#         - display_name: (Optional) A human-readable name for the dataset
#         - dest_dir: The local directory where the dataset was downloaded
#         - files: A list of FileRecord objects for each file downloaded, with path, rel_path, and ext
#         - meta: Additional metadata (e.g., download status, errors, timestamps)
