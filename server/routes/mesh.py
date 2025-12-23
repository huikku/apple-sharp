"""Mesh conversion API routes.

Provides endpoints for converting Gaussian splat PLY files to meshes.

For licensing see accompanying LICENSE file.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from server.services.mesh_converter import MeshConverter, MeshMethod, ExportFormat

LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mesh", tags=["mesh"])

# Output directory for meshes
MESH_OUTPUT_DIR = Path(__file__).parent.parent / "outputs" / "meshes"


class ConvertRequest(BaseModel):
    """Request to convert a splat to mesh."""
    splat_path: str
    method: MeshMethod = "poisson"
    output_format: ExportFormat = "obj"
    # Optional method-specific parameters
    depth: int = 9  # For Poisson
    alpha: float = 0.03  # For Alpha Shapes


class ConvertResponse(BaseModel):
    """Response from mesh conversion."""
    success: bool
    mesh_path: str
    mesh_filename: str
    vertex_count: int
    face_count: int
    method: str
    format: str
    download_url: str


@router.post("/convert", response_model=ConvertResponse)
async def convert_splat_to_mesh(request: ConvertRequest) -> ConvertResponse:
    """Convert a Gaussian splat PLY to a mesh.
    
    Supports three methods:
    - poisson: Best quality, watertight meshes (slower)
    - ball_pivoting: Good quality, handles holes (medium speed)
    - alpha_shape: Fastest, good for simple geometry
    """
    try:
        splat_path = Path(request.splat_path)
        
        if not splat_path.exists():
            raise HTTPException(status_code=404, detail=f"Splat file not found: {splat_path}")
        
        LOGGER.info(f"Converting {splat_path} to mesh using {request.method}")
        
        converter = MeshConverter(output_dir=MESH_OUTPUT_DIR)
        
        # Build kwargs based on method
        kwargs = {}
        if request.method == "poisson":
            kwargs["depth"] = request.depth
        elif request.method == "alpha_shape":
            kwargs["alpha"] = request.alpha
        
        result = converter.convert(
            ply_path=splat_path,
            method=request.method,
            output_format=request.output_format,
            **kwargs
        )
        
        return ConvertResponse(
            success=True,
            mesh_path=str(result.mesh_path),
            mesh_filename=result.mesh_path.name,
            vertex_count=result.vertex_count,
            face_count=result.face_count,
            method=result.method,
            format=result.format,
            download_url=f"/api/mesh/download/{result.mesh_path.name}"
        )
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Missing dependency: {e}")
    except Exception as e:
        LOGGER.exception(f"Mesh conversion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")


@router.get("/download/{filename}")
async def download_mesh(filename: str) -> FileResponse:
    """Download a converted mesh file."""
    mesh_path = MESH_OUTPUT_DIR / filename
    
    if not mesh_path.exists():
        raise HTTPException(status_code=404, detail=f"Mesh file not found: {filename}")
    
    # Determine media type
    suffix = mesh_path.suffix.lower()
    media_types = {
        ".obj": "model/obj",
        ".glb": "model/gltf-binary",
        ".ply": "application/octet-stream",
    }
    media_type = media_types.get(suffix, "application/octet-stream")
    
    return FileResponse(
        path=mesh_path,
        filename=filename,
        media_type=media_type
    )


@router.get("/methods")
async def get_available_methods():
    """Get list of available mesh conversion methods."""
    return {
        "methods": [
            {
                "id": "poisson",
                "name": "Poisson Surface Reconstruction",
                "description": "Best quality, produces watertight meshes. Slower.",
                "parameters": [
                    {"name": "depth", "type": "int", "default": 9, "range": [6, 12]}
                ]
            },
            {
                "id": "ball_pivoting",
                "name": "Ball Pivoting Algorithm",
                "description": "Good quality, faster than Poisson. Handles surfaces with holes.",
                "parameters": []
            },
            {
                "id": "alpha_shape",
                "name": "Alpha Shapes",
                "description": "Fastest method, good for convex geometry.",
                "parameters": [
                    {"name": "alpha", "type": "float", "default": 0.03, "range": [0.01, 0.1]}
                ]
            }
        ],
        "formats": ["obj", "glb", "ply"]
    }
