from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pathlib import Path
from PIL import Image
import uuid
import os
import io
import time
from typing import Dict

from ..models import ImageUploadResponse, SplatJob, JobStatus, GenerateRequest
from ..services.sharp_runner import get_sharp_runner

router = APIRouter(prefix="/api")

# In-memory storage for jobs and uploads
UPLOAD_DIR = Path("outputs/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

uploads: Dict[str, dict] = {}
jobs: Dict[str, SplatJob] = {}


@router.post("/upload", response_model=ImageUploadResponse)
async def upload_image(file: UploadFile = File(...)):
    """Upload an image for processing."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Generate unique ID
    image_id = str(uuid.uuid4())
    
    # Read and validate image
    contents = await file.read()
    
    try:
        img = Image.open(io.BytesIO(contents))
        width, height = img.size
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")
    
    # Save file
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    save_path = UPLOAD_DIR / f"{image_id}{ext}"
    
    with open(save_path, "wb") as f:
        f.write(contents)
    
    # Store metadata
    uploads[image_id] = {
        "path": str(save_path),
        "filename": file.filename or "image",
        "width": width,
        "height": height,
        "size": len(contents),
    }
    
    return ImageUploadResponse(
        imageId=image_id,
        filename=file.filename or "image",
        width=width,
        height=height,
        size=len(contents),
    )


def run_sharp_prediction(job_id: str, image_path: str):
    """Background task to run Sharp prediction."""
    job = jobs.get(job_id)
    if not job:
        return
    
    runner = get_sharp_runner()
    success, result, processing_time = runner.predict(image_path, job_id)
    
    if success:
        # Find the generated PLY file path
        splat_dir = Path("outputs/splats") / job_id
        ply_files = list(splat_dir.glob("*.ply"))
        splat_path = str(ply_files[0].absolute()) if ply_files else None
        
        jobs[job_id] = SplatJob(
            jobId=job_id,
            imageId=job.imageId,
            status=JobStatus.complete,
            splatUrl=f"/api/download/{job_id}",
            splatPath=splat_path,
            processingTimeMs=processing_time,
        )
    else:
        jobs[job_id] = SplatJob(
            jobId=job_id,
            imageId=job.imageId,
            status=JobStatus.error,
            error=result,
            processingTimeMs=processing_time,
        )


@router.post("/generate", response_model=SplatJob)
async def generate_splat(request: GenerateRequest, background_tasks: BackgroundTasks):
    """Start Sharp inference on an uploaded image."""
    if request.imageId not in uploads:
        raise HTTPException(status_code=404, detail="Image not found")
    
    upload = uploads[request.imageId]
    job_id = str(uuid.uuid4())
    
    # Create initial job record
    job = SplatJob(
        jobId=job_id,
        imageId=request.imageId,
        status=JobStatus.processing,
    )
    jobs[job_id] = job
    
    # Start background processing
    background_tasks.add_task(run_sharp_prediction, job_id, upload["path"])
    
    return job


@router.get("/status/{job_id}", response_model=SplatJob)
async def get_status(job_id: str):
    """Get the status of a processing job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return jobs[job_id]


@router.get("/download/{job_id}")
async def download_splat(job_id: str):
    """Download the generated .ply file."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    if job.status != JobStatus.complete:
        raise HTTPException(status_code=400, detail="Job not complete")
    
    # Find the .ply file
    splat_dir = Path("outputs/splats") / job_id
    ply_files = list(splat_dir.glob("*.ply"))
    
    if not ply_files:
        raise HTTPException(status_code=404, detail="Splat file not found")
    
    return FileResponse(
        ply_files[0],
        media_type="application/octet-stream",
        filename=f"splat_{job_id}.ply",
    )
