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
        "HF_HOME": "/model-cache/huggingface",
        "TORCH_HOME": "/model-cache/torch",
        "PYTHONPATH": "/opt/ml-sharp/src",
    })
)

# Create the Modal app
app = modal.App("sharp-api", image=image)

# Persistent volumes
model_cache = modal.Volume.from_name("sharp-model-cache", create_if_missing=True)
outputs_volume = modal.Volume.from_name("sharp-outputs", create_if_missing=True)

# Persistent job state dict (survives across requests)
job_dict = modal.Dict.from_name("sharp-jobs", create_if_missing=True)
stats_dict = modal.Dict.from_name("sharp-stats", create_if_missing=True)


def add_blender_vertex_colors(ply_path):
    """
    Post-process PLY to add Blender-compatible vertex colors.
    Reads f_dc_* (SH DC terms) and opacity, converts to red/green/blue/alpha (uchar 0-255).
    """
    from plyfile import PlyData, PlyElement
    import numpy as np
    import shutil
    import tempfile
    
    try:
        # Read file into memory and close immediately
        with open(str(ply_path), 'rb') as f:
            ply = PlyData.read(f)
        
        vertex = ply['vertex']
        
        # Check if already has colors
        if 'red' in vertex.data.dtype.names:
            return  # Already has vertex colors
        
        # Convert SH DC to RGB: rgb = clamp(0.5 + SH_C0 * f_dc, 0..1)
        SH_C0 = 0.28209479177387814
        f_dc_0 = vertex['f_dc_0'].copy()  # Copy to avoid reference issues
        f_dc_1 = vertex['f_dc_1'].copy()
        f_dc_2 = vertex['f_dc_2'].copy()
        
        red = np.clip((0.5 + SH_C0 * f_dc_0) * 255, 0, 255).astype(np.uint8)
        green = np.clip((0.5 + SH_C0 * f_dc_1) * 255, 0, 255).astype(np.uint8)
        blue = np.clip((0.5 + SH_C0 * f_dc_2) * 255, 0, 255).astype(np.uint8)
        
        # Alpha from sigmoid of opacity
        opacity = vertex['opacity'].copy()
        alpha = np.clip(1.0 / (1.0 + np.exp(-opacity)) * 255, 0, 255).astype(np.uint8)
        
        # Create new dtype with color properties
        old_dtype = vertex.data.dtype.descr
        new_dtype = old_dtype + [('red', 'u1'), ('green', 'u1'), ('blue', 'u1'), ('alpha', 'u1')]
        
        new_data = np.empty(len(vertex.data), dtype=new_dtype)
        for name in vertex.data.dtype.names:
            new_data[name] = vertex.data[name]
        new_data['red'] = red
        new_data['green'] = green
        new_data['blue'] = blue
        new_data['alpha'] = alpha
        
        # Replace vertex element
        new_vertex = PlyElement.describe(new_data, 'vertex')
        new_elements = [new_vertex] + [e for e in ply.elements if e.name != 'vertex']
        new_ply = PlyData(new_elements)
        
        # Write to temp file first, then replace original
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.ply', delete=False) as tmp:
            new_ply.write(tmp)
            tmp_path = tmp.name
        
        shutil.move(tmp_path, str(ply_path))
        
        print(f"[Blender] Added vertex colors to {ply_path}")
    except Exception as e:
        print(f"[Blender] Warning: Could not add vertex colors: {e}")


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
        
        try:
            # Import Sharp and trigger model download/loading
            from sharp.models import PredictorParams, create_predictor
            
            DEFAULT_MODEL_URL = "https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt"
            
            print(f"[Sharp] Loading weights from {DEFAULT_MODEL_URL}...")
            # This will use TORCH_HOME cache automatically
            state_dict = torch.hub.load_state_dict_from_url(DEFAULT_MODEL_URL, progress=True)
            
            print("[Sharp] Initializing model architectural components...")
            self.predictor = create_predictor(PredictorParams())
            self.predictor.load_state_dict(state_dict)
            self.predictor.eval()
            self.predictor.to("cuda")
            
            print("[Sharp] Model preloaded successfully on CUDA!")
        except Exception as e:
            import traceback
            print(f"[Sharp] Model preload failed: {e}")
            traceback.print_exc()
            self.predictor = None
    
    @modal.method()
    def run_inference(self, job_id: str, image_path: str):
        """Run Sharp inference on an image."""
        import time
        import subprocess
        from pathlib import Path
        
        start_time = time.time()
        
        try:
            # CRITICAL: Reload volume to see files uploaded by web function
            outputs_volume.reload()
            
            # Verify input file exists
            if not Path(image_path).exists():
                raise Exception(f"Input file not found: {image_path}")
            
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
            
            # CRITICAL: Always use Python API now for performance
            if self.predictor is None:
                raise Exception("Sharp model not preloaded. Check container logs.")

            job_dict[job_id]["statusDetail"] = "Running in-memory inference..."
            
            import torch
            import torch.nn.functional as F
            from sharp.utils import io
            from sharp.utils.gaussians import save_ply, unproject_gaussians
            import numpy as np
            
            # 1. Preprocessing
            internal_shape = (1536, 1536)
            image, _, f_px = io.load_rgb(Path(image_path))
            height, width = image.shape[:2]
            
            device = torch.device("cuda")
            image_pt = torch.from_numpy(image.copy()).float().to(device).permute(2, 0, 1) / 255.0
            disparity_factor = torch.tensor([f_px / width]).float().to(device)
            
            image_resized_pt = F.interpolate(
                image_pt[None],
                size=(internal_shape[1], internal_shape[0]),
                mode="bilinear",
                align_corners=True,
            )
            
            # 2. Inference
            with torch.no_grad():
                gaussians_ndc = self.predictor(image_resized_pt, disparity_factor)
            
            # 3. Postprocessing (Unprojection)
            intrinsics = torch.tensor([
                [f_px, 0, width / 2, 0],
                [0, f_px, height / 2, 0],
                [0, 0, 1, 0],
                [0, 0, 0, 1],
            ]).float().to(device)
            
            intrinsics_resized = intrinsics.clone()
            intrinsics_resized[0] *= internal_shape[0] / width
            intrinsics_resized[1] *= internal_shape[1] / height
            
            gaussians = unproject_gaussians(
                gaussians_ndc, torch.eye(4).to(device), intrinsics_resized, internal_shape
            )
            
            # 4. Save PLY (scale reduction now happens in save_ply itself)
            ply_file = Path(output_dir) / "splat.ply"
            save_ply(gaussians, f_px, (height, width), ply_file)
            
            # 5. Post-process PLY to add Blender-compatible vertex colors
            add_blender_vertex_colors(ply_file)
            
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
            
            # Record stat
            try:
                current_time = int(time.time())
                # Stats are stored as a list of timestamps in the 'completions' key
                completions = stats_dict.get("completions", [])
                completions.append(current_time)
                # Keep only last 10,000 to avoid bloat, but enough for yearly stats if needed
                if len(completions) > 10000:
                    completions = completions[-10000:]
                stats_dict["completions"] = completions
                
                # Record total count separately for all-time
                stats_dict["total_count"] = stats_dict.get("total_count", 0) + 1
            except Exception as se:
                print(f"[Stats] Failed to record completion: {se}")
            
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
    timeout=300,        # Increased to 5 mins for large reconstructions
    memory=8192,       # Increased to 8GB for 1M+ point clouds
    min_containers=1,  # Always keep 1 container running (~$5-10/month)
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
    
    # SECURITY: Restrict CORS to known frontend origins
    ALLOWED_ORIGINS = [
        "https://huikku.github.io",  # Production GitHub Pages
        "http://localhost:5173",     # Local Vite dev server
        "http://localhost:3000",     # Alternative local dev
        "http://127.0.0.1:5173",
    ]
    
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
    
    # Add exception handler to ensure CORS headers on errors
    from starlette.responses import JSONResponse
    from starlette.requests import Request
    
    @web_app.exception_handler(Exception)
    async def cors_exception_handler(request: Request, exc: Exception):
        # Check if origin is allowed
        origin = request.headers.get("origin", "")
        cors_origin = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
        
        print(f"[API] Unhandled exception: {type(exc).__name__}: {str(exc)}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal error: {str(exc)}"},
            headers={
                "Access-Control-Allow-Origin": cors_origin,
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            }
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
        # SECURITY: File size limit (20MB)
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
        
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413, 
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB"
            )
        
        # Validate file extension
        allowed_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
        ext = Path(file.filename or "image.png").suffix.lower() or ".png"
        if ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
            )
        
        image_id = str(uuid.uuid4())
        save_path = f"/outputs/uploads/{image_id}{ext}"
        
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
        import os
        
        # SECURITY: Sanitize inputs to prevent path traversal
        safe_job_id = os.path.basename(job_id)
        safe_filename = os.path.basename(filename)
        
        if safe_job_id != job_id or safe_filename != filename:
            print(f"[Download] Blocked path traversal attempt: {job_id}/{filename}")
            raise HTTPException(status_code=400, detail="Invalid path")
        
        file_path = Path("/outputs/splats") / safe_job_id / safe_filename
        splat_dir = Path("/outputs/splats") / safe_job_id
        
        print(f"[Download] Request: job_id={safe_job_id}, filename={safe_filename}")
        print(f"[Download] Looking in: {splat_dir}")
        
        # Retry with volume reloads to handle sync timing
        max_retries = 5
        for attempt in range(max_retries):
            # Reload volume to get latest files
            outputs_volume.reload()
            
            # Log what exists on each attempt
            if splat_dir.exists():
                existing = [f.name for f in splat_dir.iterdir()]
                print(f"[Download] Attempt {attempt+1}/{max_retries}: dir exists, files: {existing}")
            else:
                print(f"[Download] Attempt {attempt+1}/{max_retries}: dir DOES NOT EXIST")
            
            if file_path.exists():
                print(f"[Download] Found exact match: {file_path}")
                return FileResponse(
                    path=str(file_path),
                    filename=filename,
                    media_type="application/octet-stream"
                )
            
            # Fallback: try to find ANY PLY file in the job directory
            if splat_dir.exists():
                ply_files = list(splat_dir.glob("*.ply"))
                if ply_files:
                    found_file = ply_files[0]
                    print(f"[Download] Exact file not found, using fallback: {found_file.name}")
                    return FileResponse(
                        path=str(found_file),
                        filename=found_file.name,
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
        try:
            import open3d as o3d
            import numpy as np
            from plyfile import PlyData
            
            # Reload volume
            outputs_volume.reload()
            
            splat_path = request.splat_path
            if not Path(splat_path).exists():
                raise HTTPException(status_code=404, detail=f"Splat file not found: {splat_path}")
            
            print(f"[Mesh] Converting {splat_path} using {request.method}")
            
            # Load PLY
            print(f"[Mesh] Reading PLY data from {splat_path}...")
            ply_data = PlyData.read(splat_path)
            vertex = ply_data['vertex']
            print(f"[Mesh] PLY properties: {vertex.data.dtype.names}")
            
            points = np.vstack([vertex['x'], vertex['y'], vertex['z']]).T
            print(f"[Mesh] Successfully loaded {len(points)} points")
            
            # Get colors if available (try multiple formats)
            colors = None
            if 'red' in vertex.data.dtype.names:
                print("[Mesh] Found direct RGB colors")
                colors = np.vstack([
                    vertex['red'] / 255.0,
                    vertex['green'] / 255.0,
                    vertex['blue'] / 255.0
                ]).T
            elif 'f_dc_0' in vertex.data.dtype.names:
                print("[Mesh] Converting Spherical Harmonics to RGB...")
                # Convert spherical harmonics to RGB
                SH_C0 = 0.28209479177387814
                colors = np.vstack([
                    np.clip(vertex['f_dc_0'] * SH_C0 + 0.5, 0, 1),
                    np.clip(vertex['f_dc_1'] * SH_C0 + 0.5, 0, 1),
                    np.clip(vertex['f_dc_2'] * SH_C0 + 0.5, 0, 1),
                ]).T
            else:
                print("[Mesh] No colors found in PLY")
            
            # Create point cloud
            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(points)
            if colors is not None:
                pcd.colors = o3d.utility.Vector3dVector(colors)
            
            # Estimate normals
            print("[Mesh] Estimating normals...")
            pcd.estimate_normals(search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30))
            pcd.orient_normals_consistent_tangent_plane(k=15)
            
            # Convert to mesh
            print(f"[Mesh] Running {request.method} reconstruction...")
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
            
            # Transfer vertex colors from point cloud to mesh vertices
            # Mesh reconstruction doesn't preserve colors, so we sample from nearest points
            if colors is not None and len(mesh.vertices) > 0:
                print("[Mesh] Transferring vertex colors from point cloud...")
                mesh_vertices = np.asarray(mesh.vertices)
                pcd_tree = o3d.geometry.KDTreeFlann(pcd)
                vertex_colors = np.zeros((len(mesh_vertices), 3))
                
                for i, vertex in enumerate(mesh_vertices):
                    # Find nearest point in original point cloud
                    [_, idx, _] = pcd_tree.search_knn_vector_3d(vertex, 1)
                    vertex_colors[i] = colors[idx[0]]
                
                mesh.vertex_colors = o3d.utility.Vector3dVector(vertex_colors)
                print(f"[Mesh] Transferred colors to {len(mesh_vertices)} vertices")
            
            # Generate output filename
            mesh_id = str(uuid.uuid4())[:8]
            filename = f"mesh_{mesh_id}.{request.output_format}"
            output_path = f"/outputs/meshes/{filename}"
            
            # Save mesh
            print(f"[Mesh] Saving to {output_path}")
            # Explicitly enable vertex colors for all formats (OBJ, GLB, PLY)
            o3d.io.write_triangle_mesh(output_path, mesh, write_vertex_colors=True)
            
            outputs_volume.commit()
            
            print(f"[Mesh] Complete: {len(mesh.vertices)} vertices, {len(mesh.triangles)} faces")
            
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
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Mesh] Error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Mesh conversion failed: {str(e)}")
    
    @web_app.get("/api/mesh/download/{filename}")
    async def download_mesh(filename: str):
        import os
        
        # SECURITY: Sanitize filename to prevent path traversal
        safe_filename = os.path.basename(filename)
        if safe_filename != filename:
            print(f"[Mesh Download] Blocked path traversal attempt: {filename}")
            raise HTTPException(status_code=400, detail="Invalid path")
        
        outputs_volume.reload()
        
        file_path = Path("/outputs/meshes") / safe_filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Mesh file not found")
        
        content_type = {
            ".obj": "text/plain",
            ".glb": "model/gltf-binary",
            ".ply": "application/octet-stream",
        }.get(file_path.suffix, "application/octet-stream")
        
        return FileResponse(
            path=str(file_path),
            filename=safe_filename,
            media_type=content_type
        )
    
    # ========== Camera Parameters ==========
    
    # Sharp uses OpenCV convention: X-right, Y-down, Z-forward
    # Camera is at origin looking into scene (toward +Z)
    CAMERA_PARAMS = {
        "position": [0.0, 0.0, 0.0],
        "rotation_euler": [0.0, 0.0, 0.0],  # Looking down +Z
        "rotation_quaternion": [1.0, 0.0, 0.0, 0.0],  # Identity
        "look_at": [0.0, 0.0, 1.0],  # Looking toward +Z
        "up_vector": [0.0, -1.0, 0.0],  # Y is down in OpenCV
        "fov_degrees": 60.0,  # Assumed FOV
        "coordinate_system": "opencv",  # X-right, Y-down, Z-forward
        "notes": "Sharp reconstructs scene from camera at origin. Place camera at (0,0,0) looking toward +Z for projection mapping."
    }
    
    @web_app.get("/api/camera/params")
    async def get_camera_params():
        """Get the assumed camera parameters for Sharp reconstructions."""
        return CAMERA_PARAMS
    
    @web_app.get("/api/camera/frustum.obj")
    async def get_camera_frustum():
        """Download a camera frustum mesh (cone) for visualization in 3D software."""
        import io
        
        # Create a simple camera frustum/cone OBJ
        # Frustum points from origin (camera) toward +Z
        frustum_obj = """# Camera Frustum for Sharp Scene
# Place this at origin to show camera position
# Camera looks down +Z axis

# Vertices
v 0.0 0.0 0.0
v -0.3 -0.2 0.5
v 0.3 -0.2 0.5
v 0.3 0.2 0.5
v -0.3 0.2 0.5

# Faces (cone from origin to frustum plane)
f 1 2 3
f 1 3 4
f 1 4 5
f 1 5 2
f 2 4 3
f 2 5 4
"""
        
        from starlette.responses import Response
        return Response(
            content=frustum_obj,
            media_type="text/plain",
            headers={
                "Content-Disposition": "attachment; filename=camera_frustum.obj",
                "Access-Control-Allow-Origin": "*",
            }
        )
    
    @web_app.get("/api/camera/params.json")
    async def download_camera_json():
        """Download camera parameters as a JSON file."""
        import json
        from starlette.responses import Response
        
        return Response(
            content=json.dumps(CAMERA_PARAMS, indent=2),
            media_type="application/json",
            headers={
                "Content-Disposition": "attachment; filename=camera_params.json",
                "Access-Control-Allow-Origin": "*",
            }
        )
    
    # ========== Usage Stats & Costs ==========
    
    @web_app.get("/api/stats")
    async def get_usage_stats():
        import time
        from datetime import datetime
        
        completions = stats_dict.get("completions", [])
        total_count = stats_dict.get("total_count", 0)
        
        now = time.time()
        hour_ago = now - 3600
        day_ago = now - 86400
        month_ago = now - 2592000 # 30 days
        year_ago = now - 31536000 # 365 days
        
        # Calculate hourly breakdown for last 24 hours (for graph)
        hourly_breakdown = []
        for i in range(24):
            # i=0 is current hour, i=23 is 23 hours ago
            start = now - (i + 1) * 3600
            end = now - i * 3600
            count = len([t for t in completions if start < t <= end])
            hourly_breakdown.append(count)
        # Reverse so index 0 is oldest (23h ago), index 23 is most recent
        hourly_breakdown.reverse()
        
        # Get queue status from job_dict
        jobs = list(job_dict.values())
        queue_length = len([j for j in jobs if j.get("status") == "pending"])
        active_jobs = len([j for j in jobs if j.get("status") == "processing"])
        
        return {
            "allTime": total_count,
            "thisYear": len([t for t in completions if t > year_ago]),
            "thisMonth": len([t for t in completions if t > month_ago]),
            "thisDay": len([t for t in completions if t > day_ago]),
            "thisHour": len([t for t in completions if t > hour_ago]),
            "queueLength": queue_length,
            "activeJobs": active_jobs,
            "hourlyBreakdown": hourly_breakdown,
        }

    @web_app.get("/api/costs")
    async def get_cost_stats():
        """Estimated costs based on Modal T4 pricing and uptime."""
        total_count = stats_dict.get("total_count", 0)
        
        # Modal T4 pricing ~ $0.59 / hour
        # Avg splat time ~ 25 seconds
        # Usage cost: $0.59 / 3600 * 25 = $0.004 per splat
        usage_cost = total_count * 0.004
        
        # Fixed cost (min_containers=1)
        # $0.59 * 24 * 30 = ~$425? Wait, Modal web functions are cheaper if idle?
        # Actually, Modal says "0.1Ghz/sec" etc. 
        # A warm container with min_containers=1 usually costs around $5-10/month 
        # because it only bills for the active "web" overhead when not processing.
        fixed_cost_estimate = 7.50 # Monthly base
        
        return {
            "estimatedUsageCost": round(usage_cost, 2),
            "monthlyFixedCost": fixed_cost_estimate,
            "currency": "USD",
            "note": "Estimates based on Modal GPU (T4) pricing."
        }
    
    return web_app
