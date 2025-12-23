"""
Modal deployment wrapper for Sharp API.

This file configures the Sharp FastAPI backend to run on Modal's
serverless GPU infrastructure.

Deploy with: modal deploy modal_app.py
Test locally: modal serve modal_app.py
"""

import modal

# Define the container image with all Sharp dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "git",
        "libgl1-mesa-glx",  # OpenCV/Open3D dependency
        "libglib2.0-0",     # OpenCV dependency
        "libgomp1",         # OpenMP for parallel processing
    )
    .pip_install(
        # FastAPI and server deps
        "fastapi[standard]>=0.109.0",
        "uvicorn>=0.27.0",
        "python-multipart>=0.0.6",
        "pydantic>=2.5.0",
        # ML deps
        "torch>=2.0.0",
        "torchvision>=0.15.0",
        "numpy>=1.24.0",
        "Pillow>=10.0.0",
        # Mesh conversion deps
        "open3d>=0.18.0",
        "trimesh>=4.0.0",
        "plyfile",
        # Sharp deps
        "gsplat",
        "einops",
        "timm",
        "huggingface_hub",
    )
    .run_commands(
        # Clone and install ml-sharp
        "git clone https://github.com/apple/ml-sharp.git /opt/ml-sharp",
        "cd /opt/ml-sharp && pip install -e .",
    )
)

# Create the Modal app
app = modal.App("sharp-api", image=image)

# Persistent volume for model cache (avoids re-downloading 2.8GB model)
volume = modal.Volume.from_name("sharp-model-cache", create_if_missing=True)


@app.function(
    gpu="T4",  # T4 is cheapest, use "A10G" for faster inference
    volumes={
        "/root/.cache": volume,  # HuggingFace cache
        "/outputs": modal.Volume.from_name("sharp-outputs", create_if_missing=True),
    },
    timeout=600,  # 10 minute timeout for long operations
    allow_concurrent_inputs=5,
    memory=8192,  # 8GB RAM
)
@modal.asgi_app()
def fastapi_app():
    """Serve the Sharp FastAPI application."""
    import sys
    import os
    
    # Add server module to path
    sys.path.insert(0, "/opt/ml-sharp")
    
    # Set working directory for outputs
    os.chdir("/outputs")
    
    # Import the FastAPI app from our server
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from pathlib import Path
    
    # Create a new FastAPI app for Modal
    web_app = FastAPI(
        title="Sharp API",
        description="Apple Sharp monocular view synthesis - deployed on Modal",
        version="1.0.0",
    )
    
    # CORS for GitHub Pages and local development
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://alienrobot.github.io",  # GitHub Pages
            "https://*.github.io",
            "http://localhost:5173",  # Vite dev
            "http://localhost:3000",
        ],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Ensure output directories exist
    Path("/outputs/uploads").mkdir(parents=True, exist_ok=True)
    Path("/outputs/splats").mkdir(parents=True, exist_ok=True)
    Path("/outputs/meshes").mkdir(parents=True, exist_ok=True)
    
    # Import and include existing routers
    from server.routes import inference
    from server.routes import mesh
    
    web_app.include_router(inference.router)
    web_app.include_router(mesh.router)
    
    # Mount static files for serving outputs
    web_app.mount("/outputs", StaticFiles(directory="/outputs"), name="outputs")
    
    @web_app.get("/api/health")
    async def health_check():
        """Health check endpoint."""
        import torch
        return {
            "status": "ok", 
            "service": "sharp-api-modal",
            "cuda_available": torch.cuda.is_available(),
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        }
    
    @web_app.get("/")
    async def root():
        """Root endpoint with API info."""
        return {
            "name": "Sharp API (Modal)",
            "version": "1.0.0",
            "docs": "/docs",
            "health": "/api/health",
        }
    
    return web_app


# Optional: CLI entry point for local testing
if __name__ == "__main__":
    print("Deploy with: modal deploy modal_app.py")
    print("Test locally: modal serve modal_app.py")
