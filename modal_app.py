"""
Modal deployment wrapper for Sharp API.

This file configures the Sharp FastAPI backend to run on Modal's
serverless GPU infrastructure with true async job queuing.

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

# Persistent volumes
model_cache = modal.Volume.from_name("sharp-model-cache", create_if_missing=True)
outputs_volume = modal.Volume.from_name("sharp-outputs", create_if_missing=True)

# Persistent job state dict (survives across requests)
job_dict = modal.Dict.from_name("sharp-jobs", create_if_missing=True)

@app.cls(
    gpu="T4",
    volumes={
        "/model-cache": model_cache,
        "/outputs": outputs_volume,
    },
    timeout=600,
    memory=8192,
)
class SharpInference:
    """Sharp inference class with model preloading."""
    
    @modal.enter()
    def load_model(self):
        """Preload Sharp model on container startup (runs once per container)."""
        import torch
        print("[Sharp] Container starting, preloading model...")
        
        # Import Sharp and trigger model download/loading
        try:
            from sharp.predictor import SharpPredictor
            self.predictor = SharpPredictor(device="cuda")
            print("[Sharp] Model preloaded successfully!")
        except Exception as e:
            print(f"[Sharp] Model preload failed (will use CLI fallback): {e}")
            self.predictor = None
    
    @modal.method()
    def run_inference(self, job_id: str, image_path: str):
        """Run Sharp inference on an image."""
        import time
        import subprocess
        from pathlib import Path
        
        start_time = time.time()
        
        try:
            # Update status to processing
            job_dict[job_id] = {
                "jobId": job_id,
                "status": "processing",
                "statusDetail": "Running Sharp inference...",
                "queuePosition": 0,
                "estimatedWaitSeconds": 0,
            }
            
            # Create output directory
            output_dir = f"/outputs/splats/{job_id}"
            Path(output_dir).mkdir(parents=True, exist_ok=True)
            
            # Try Python API first, fall back to CLI
            if self.predictor is not None:
                try:
                    job_dict[job_id]["statusDetail"] = "Processing with preloaded model..."
                    from PIL import Image
                    import numpy as np
                    
                    img = Image.open(image_path)
                    output = self.predictor.predict(img)
                    
                    # Save PLY
                    ply_path = Path(output_dir) / "splat.ply"
                    output.save_ply(str(ply_path))
                    ply_file = ply_path
                except Exception as e:
                    print(f"[Sharp] Python API failed, falling back to CLI: {e}")
                    self.predictor = None  # Don't retry Python API
                    
            if self.predictor is None:
                # Fallback to CLI
                job_dict[job_id]["statusDetail"] = "Running Sharp CLI..."
                cmd = [
                    "sharp", "predict",
                    "-i", image_path,
                    "-o", output_dir,
                ]
                
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=600,
                )
                
                if result.returncode != 0:
                    raise Exception(f"Sharp CLI failed: {result.stderr}")
                
                # Find output PLY file
                ply_file = Path(output_dir) / "splat.ply"
                if not ply_file.exists():
                    ply_files = list(Path(output_dir).glob("*.ply"))
                    if ply_files:
                        ply_file = ply_files[0]
                    else:
                        raise Exception(f"No PLY output found in {output_dir}")
            
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            # Update to complete
            job_dict[job_id] = {
                "jobId": job_id,
                "status": "complete",
                "statusDetail": "Complete",
                "splatUrl": f"/api/download/{job_id}/{ply_file.name}",
                "splatPath": str(ply_file),
                "processingTimeMs": elapsed_ms,
                "queuePosition": 0,
                "estimatedWaitSeconds": 0,
            }
            
            # Sync volume to persist output
            outputs_volume.commit()
            
            print(f"[Sharp] Job {job_id} complete: {ply_file.name}, {elapsed_ms}ms")
            
        except Exception as e:
            error_msg = str(e)
            print(f"[Sharp] Job {job_id} failed: {error_msg}")
            job_dict[job_id] = {
                "jobId": job_id,
                "status": "error",
                "error": error_msg,
                "statusDetail": "Inference failed",
                "queuePosition": 0,
                "estimatedWaitSeconds": 0,
            }


# Create a reference to the class for spawning
sharp_inference = SharpInference()

@app.function(
    volumes={
        "/outputs": outputs_volume,
    },
    timeout=120,
    memory=2048,
)
@modal.concurrent(max_inputs=100)  # Handle many status checks
@modal.asgi_app()
def fastapi_app():
    """Serve the Sharp FastAPI application (lightweight, no GPU)."""
    import uuid
    from pathlib import Path
    
    from fastapi import FastAPI, UploadFile, File, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse
    from pydantic import BaseModel
    
    # Ensure directories exist
    Path("/outputs/uploads").mkdir(parents=True, exist_ok=True)
    Path("/outputs/splats").mkdir(parents=True, exist_ok=True)
    Path("/outputs/meshes").mkdir(parents=True, exist_ok=True)
    
    web_app = FastAPI(
        title="Sharp API",
        description="Apple Sharp monocular view synthesis - deployed on Modal",
        version="2.0.0",
    )
    
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    class SplatJob(BaseModel):
        jobId: str
        status: str
        statusDetail: str | None = None
        splatUrl: str | None = None
        splatPath: str | None = None
        processingTimeMs: int | None = None
        error: str | None = None
        queuePosition: int | None = None
        estimatedWaitSeconds: int | None = None
    
    class GenerateRequest(BaseModel):
        imageId: str
    
    @web_app.get("/")
    async def root():
        return {
            "name": "Sharp API (Modal)",
            "version": "2.0.0",
            "docs": "/docs",
            "health": "/api/health",
            "queue": "/api/queue",
        }
    
    @web_app.get("/api/health")
    async def health_check():
        # Count active jobs from dict
        active_count = 0
        queued_count = 0
        try:
            for key in job_dict.keys():
                job = job_dict.get(key, {})
                if job.get("status") == "processing":
                    active_count += 1
                elif job.get("status") == "queued":
                    queued_count += 1
        except:
            pass
        
        return {
            "status": "ok",
            "service": "sharp-api-modal",
            "version": "2.0.0",
            "activeJobs": active_count,
            "queuedJobs": queued_count,
        }
    
    @web_app.get("/api/queue")
    async def get_queue_status():
        active_count = 0
        queued_count = 0
        try:
            for key in job_dict.keys():
                job = job_dict.get(key, {})
                if job.get("status") == "processing":
                    active_count += 1
                elif job.get("status") == "queued":
                    queued_count += 1
        except:
            pass
        
        return {
            "activeJobs": active_count,
            "queuedJobs": queued_count,
            "maxConcurrent": 3,
        }
    
    @web_app.post("/api/upload")
    async def upload_image(file: UploadFile = File(...)):
        image_id = str(uuid.uuid4())
        ext = Path(file.filename or "image.png").suffix or ".png"
        save_path = f"/outputs/uploads/{image_id}{ext}"
        
        content = await file.read()
        with open(save_path, "wb") as f:
            f.write(content)
        
        # Sync volume
        outputs_volume.commit()
        
        from PIL import Image
        img = Image.open(save_path)
        width, height = img.size
        
        return {
            "imageId": image_id,
            "filename": file.filename,
            "width": width,
            "height": height,
        }
    
    @web_app.post("/api/generate")
    async def generate_splat(request: GenerateRequest):
        """
        Queue a job for Sharp inference.
        Returns immediately with job ID - processing happens async.
        """
        image_id = request.imageId
        job_id = str(uuid.uuid4())
        
        # Find uploaded image
        upload_dir = Path("/outputs/uploads")
        image_files = list(upload_dir.glob(f"{image_id}.*"))
        if not image_files:
            raise HTTPException(status_code=404, detail="Image not found")
        
        image_path = str(image_files[0])
        
        # Count current queue position
        queued_count = 0
        try:
            for key in job_dict.keys():
                job = job_dict.get(key, {})
                if job.get("status") in ["queued", "processing"]:
                    queued_count += 1
        except:
            pass
        
        # Store initial job state - QUEUED
        job_dict[job_id] = {
            "jobId": job_id,
            "status": "queued",
            "queuePosition": queued_count + 1,
            "estimatedWaitSeconds": (queued_count + 1) * 45,
        }
        
        # Spawn Sharp inference in background (non-blocking!)
        sharp_inference.run_inference.spawn(job_id, image_path)
        
        # Return immediately with queued status
        return SplatJob(
            jobId=job_id,
            status="queued",
            queuePosition=queued_count + 1,
            estimatedWaitSeconds=(queued_count + 1) * 45,
        )
    
    @web_app.get("/api/status/{job_id}")
    async def get_status(job_id: str):
        try:
            job = job_dict.get(job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")
            return SplatJob(**job)
        except KeyError:
            raise HTTPException(status_code=404, detail="Job not found")
    
    @web_app.get("/api/download/{job_id}/{filename}")
    async def download_file(job_id: str, filename: str):
        import asyncio
        
        file_path = Path("/outputs/splats") / job_id / filename
        
        # Retry with volume reloads to handle sync timing
        max_retries = 5
        for attempt in range(max_retries):
            # Reload volume to get latest files
            outputs_volume.reload()
            
            if file_path.exists():
                return FileResponse(
                    path=str(file_path),
                    filename=filename,
                    media_type="application/octet-stream"
                )
            
            # Wait and retry
            if attempt < max_retries - 1:
                await asyncio.sleep(2)  # Wait 2 seconds between retries
        
        # Log what files exist for debugging
        splat_dir = Path("/outputs/splats") / job_id
        existing_files = list(splat_dir.glob("*")) if splat_dir.exists() else []
        print(f"[Download] File not found: {file_path}")
        print(f"[Download] Existing files in {splat_dir}: {[f.name for f in existing_files]}")
        
        raise HTTPException(status_code=404, detail=f"File not found after {max_retries} attempts. Dir exists: {splat_dir.exists()}")
    
    # ========== Mesh Conversion Endpoints ==========
    
    class MeshConvertRequest(BaseModel):
        splat_path: str
        method: str = "poisson"
        output_format: str = "obj"
        depth: int = 8
        alpha: float = 0.03
    
    class MeshConvertResponse(BaseModel):
        success: bool
        mesh_path: str
        mesh_filename: str
        vertex_count: int
        face_count: int
        method: str
        format: str
        download_url: str
    
    @web_app.get("/api/mesh/methods")
    async def get_mesh_methods():
        return {
            "methods": [
                {
                    "id": "poisson",
                    "name": "Poisson Surface Reconstruction",
                    "description": "Creates smooth, watertight surfaces",
                    "parameters": [
                        {"name": "depth", "type": "int", "default": 8, "range": [6, 12]}
                    ]
                },
                {
                    "id": "ball_pivoting",
                    "name": "Ball Pivoting Algorithm",
                    "description": "Preserves original point positions",
                    "parameters": [
                        {"name": "radii", "type": "float", "default": 0, "range": [0, 0.1]}
                    ]
                },
                {
                    "id": "alpha_shape",
                    "name": "Alpha Shapes",
                    "description": "Fast with concave features",
                    "parameters": [
                        {"name": "alpha", "type": "float", "default": 0.03, "range": [0.01, 0.1]}
                    ]
                }
            ],
            "formats": ["obj", "glb", "ply"]
        }
    
    @web_app.post("/api/mesh/convert")
    async def convert_mesh(request: MeshConvertRequest):
        import open3d as o3d
        import numpy as np
        from plyfile import PlyData
        
        # Reload volume
        outputs_volume.reload()
        
        splat_path = request.splat_path
        if not Path(splat_path).exists():
            raise HTTPException(status_code=404, detail="Splat file not found")
        
        # Load PLY
        ply_data = PlyData.read(splat_path)
        vertex = ply_data['vertex']
        points = np.vstack([vertex['x'], vertex['y'], vertex['z']]).T
        
        # Get colors if available
        colors = None
        if 'red' in vertex.data.dtype.names:
            colors = np.vstack([
                vertex['red'] / 255.0,
                vertex['green'] / 255.0,
                vertex['blue'] / 255.0
            ]).T
        
        # Create point cloud
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(points)
        if colors is not None:
            pcd.colors = o3d.utility.Vector3dVector(colors)
        
        # Estimate normals
        pcd.estimate_normals(search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30))
        pcd.orient_normals_consistent_tangent_plane(k=15)
        
        # Convert to mesh
        if request.method == "poisson":
            mesh, _ = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
                pcd, depth=request.depth
            )
        elif request.method == "ball_pivoting":
            distances = pcd.compute_nearest_neighbor_distance()
            avg_dist = np.mean(distances)
            radii = [avg_dist, avg_dist * 2, avg_dist * 4]
            mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_ball_pivoting(
                pcd, o3d.utility.DoubleVector(radii)
            )
        else:  # alpha_shape
            mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_alpha_shape(
                pcd, request.alpha
            )
        
        # Generate output filename
        mesh_id = str(uuid.uuid4())[:8]
        filename = f"mesh_{mesh_id}.{request.output_format}"
        output_path = f"/outputs/meshes/{filename}"
        
        # Save mesh
        if request.output_format == "glb":
            o3d.io.write_triangle_mesh(output_path, mesh, write_vertex_colors=True)
        else:
            o3d.io.write_triangle_mesh(output_path, mesh)
        
        outputs_volume.commit()
        
        return MeshConvertResponse(
            success=True,
            mesh_path=output_path,
            mesh_filename=filename,
            vertex_count=len(mesh.vertices),
            face_count=len(mesh.triangles),
            method=request.method,
            format=request.output_format,
            download_url=f"/api/mesh/download/{filename}",
        )
    
    @web_app.get("/api/mesh/download/{filename}")
    async def download_mesh(filename: str):
        outputs_volume.reload()
        
        file_path = Path("/outputs/meshes") / filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Mesh file not found")
        
        content_type = {
            ".obj": "text/plain",
            ".glb": "model/gltf-binary",
            ".ply": "application/octet-stream",
        }.get(file_path.suffix, "application/octet-stream")
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type=content_type
        )
    
    return web_app
