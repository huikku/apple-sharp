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
    .env({
        "HF_HOME": "/model-cache",
        "TRANSFORMERS_CACHE": "/model-cache",
    })
)

# Create the Modal app
app = modal.App("sharp-api", image=image)

# Persistent volume for model cache (avoids re-downloading 2.8GB model)
model_cache = modal.Volume.from_name("sharp-model-cache", create_if_missing=True)
outputs_volume = modal.Volume.from_name("sharp-outputs", create_if_missing=True)


@app.function(
    gpu="T4",  # T4 is cheapest, use "A10G" for faster inference
    volumes={
        "/model-cache": model_cache,
        "/outputs": outputs_volume,
    },
    timeout=600,  # 10 minute timeout for long operations
    memory=8192,  # 8GB RAM
)
@modal.concurrent(max_inputs=5)
@modal.asgi_app()
def fastapi_app():
    """Serve the Sharp FastAPI application."""
    import sys
    import os
    import uuid
    import time
    from pathlib import Path
    
    from fastapi import FastAPI, UploadFile, File, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse
    from pydantic import BaseModel
    
    # Ensure directories exist
    Path("/outputs/uploads").mkdir(parents=True, exist_ok=True)
    Path("/outputs/splats").mkdir(parents=True, exist_ok=True)
    Path("/outputs/meshes").mkdir(parents=True, exist_ok=True)
    
    # Create FastAPI app
    web_app = FastAPI(
        title="Sharp API",
        description="Apple Sharp monocular view synthesis - deployed on Modal",
        version="1.0.0",
    )
    
    # CORS for GitHub Pages and local development
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins for now
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Job storage (in-memory for now)
    jobs = {}
    
    class SplatJob(BaseModel):
        jobId: str
        status: str
        splatUrl: str | None = None
        splatPath: str | None = None
        processingTimeMs: int | None = None
        error: str | None = None
    
    @web_app.get("/")
    async def root():
        return {
            "name": "Sharp API (Modal)",
            "version": "1.0.0",
            "docs": "/docs",
            "health": "/api/health",
        }
    
    @web_app.get("/api/health")
    async def health_check():
        import torch
        return {
            "status": "ok",
            "service": "sharp-api-modal",
            "cuda_available": torch.cuda.is_available(),
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        }
    
    @web_app.post("/api/upload")
    async def upload_image(file: UploadFile = File(...)):
        image_id = str(uuid.uuid4())
        ext = Path(file.filename or "image.png").suffix or ".png"
        save_path = f"/outputs/uploads/{image_id}{ext}"
        
        content = await file.read()
        with open(save_path, "wb") as f:
            f.write(content)
        
        # Get image dimensions
        from PIL import Image
        img = Image.open(save_path)
        width, height = img.size
        
        return {
            "imageId": image_id,
            "filename": file.filename,
            "width": width,
            "height": height,
        }
    
    class GenerateRequest(BaseModel):
        imageId: str
    
    @web_app.post("/api/generate")
    async def generate_splat(request: GenerateRequest):
        image_id = request.imageId
        job_id = str(uuid.uuid4())
        
        # Find uploaded image
        upload_dir = Path("/outputs/uploads")
        image_files = list(upload_dir.glob(f"{image_id}.*"))
        if not image_files:
            raise HTTPException(status_code=404, detail="Image not found")
        
        image_path = str(image_files[0])
        output_path = f"/outputs/splats/{job_id}.ply"
        
        # Store initial job state
        jobs[job_id] = SplatJob(jobId=job_id, status="processing")
        
        # Run Sharp inference via CLI
        start_time = time.time()

        try:
            import subprocess
            
            # Sharp CLI creates output in a directory, with splat.ply inside
            output_dir = f"/outputs/splats/{job_id}"
            Path(output_dir).mkdir(parents=True, exist_ok=True)
            
            cmd = [
                "sharp", "predict",
                "-i", image_path,
                "-o", output_dir,
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout
            )
            
            if result.returncode != 0:
                raise Exception(f"Sharp failed: {result.stderr}")
            
            # Find the output PLY file
            ply_file = Path(output_dir) / "splat.ply"
            if not ply_file.exists():
                # Check for other ply files
                ply_files = list(Path(output_dir).glob("*.ply"))
                if ply_files:
                    ply_file = ply_files[0]
                else:
                    raise Exception(f"No PLY output found in {output_dir}")
            
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            jobs[job_id] = SplatJob(
                jobId=job_id,
                status="complete",
                splatUrl=f"/api/download/{job_id}/{ply_file.name}",
                splatPath=str(ply_file),
                processingTimeMs=elapsed_ms,
            )
        except Exception as e:
            jobs[job_id] = SplatJob(
                jobId=job_id,
                status="error",
                error=str(e),
            )
        
        return jobs[job_id]

    
    @web_app.get("/api/status/{job_id}")
    async def get_status(job_id: str):
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        return jobs[job_id]
    
    @web_app.get("/api/download/{job_id}/{filename}")
    async def download_file(job_id: str, filename: str):
        file_path = Path("/outputs/splats") / job_id / filename
        if not file_path.exists():
            # Try without job_id subdirectory
            file_path = Path("/outputs/splats") / filename
        if not file_path.exists():
            file_path = Path("/outputs/meshes") / filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(str(file_path), filename=filename)

    
    return web_app


# Optional: CLI entry point for local testing
if __name__ == "__main__":
    print("Deploy with: modal deploy modal_app.py")
    print("Test locally: modal serve modal_app.py")
