from fastapi import FastAPI

# Create the FastAPI app
app = FastAPI(title="Nexora API", description="Simple start for dataset exploration")

# A simple hello endpoint
@app.get("/")
def read_root():
    return {"message": "Welcome to Nexora! 🚀"}

# A simple datasets endpoint (we'll build this out later)
@app.get("/datasets")
def get_datasets():
    # For now, just return some dummy data
    return {
        "datasets": [
            {"id": 1, "title": "Sample Dataset 1", "description": "This is a sample dataset"},
            {"id": 2, "title": "Sample Dataset 2", "description": "Another sample dataset"}
        ]
    }

# Health check endpoint
@app.get("/health")
def health_check():
    return {"status": "healthy"} 