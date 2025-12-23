from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import logging

from .routes import inference
from .routes import mesh

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Sharp Test API",
    description="API for testing Apple's Sharp monocular view synthesis model",
    version="0.1.0",
)

# CORS configuration - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(inference.router)
app.include_router(mesh.router)

# Ensure output directories exist
Path("outputs/uploads").mkdir(parents=True, exist_ok=True)
Path("outputs/splats").mkdir(parents=True, exist_ok=True)
Path("outputs/meshes").mkdir(parents=True, exist_ok=True)

# Mount static files for serving outputs
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "sharp-test-api"}


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Sharp Test API",
        "version": "0.1.0",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
