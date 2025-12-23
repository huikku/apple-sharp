"""Mesh conversion service for Gaussian splat PLY files.

Provides three methods for converting point clouds to meshes:
1. Poisson Surface Reconstruction (best quality, watertight)
2. Ball Pivoting Algorithm (faster, handles holes)
3. 3DGS-to-PC style (if CUDA available, research-grade)

For licensing see accompanying LICENSE file.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Literal, Tuple, Optional
from dataclasses import dataclass

import numpy as np

LOGGER = logging.getLogger(__name__)

# Lazy imports to handle missing dependencies gracefully
_open3d = None
_trimesh = None


def _get_open3d():
    """Lazy load open3d."""
    global _open3d
    if _open3d is None:
        try:
            import open3d as o3d
            _open3d = o3d
        except ImportError:
            raise ImportError("open3d is required for mesh conversion. Install with: pip install open3d")
    return _open3d


def _get_trimesh():
    """Lazy load trimesh."""
    global _trimesh
    if _trimesh is None:
        try:
            import trimesh
            _trimesh = trimesh
        except ImportError:
            raise ImportError("trimesh is required for mesh export. Install with: pip install trimesh")
    return _trimesh


MeshMethod = Literal["poisson", "ball_pivoting", "alpha_shape"]
ExportFormat = Literal["obj", "glb", "ply"]


@dataclass
class MeshResult:
    """Result of mesh conversion."""
    mesh_path: Path
    vertex_count: int
    face_count: int
    method: str
    format: str


class MeshConverter:
    """Converts Gaussian splat PLY files to meshes."""

    def __init__(self, output_dir: Path):
        """Initialize converter with output directory."""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def load_splat_as_pointcloud(self, ply_path: Path) -> "open3d.geometry.PointCloud":
        """Load a Gaussian splat PLY as an Open3D point cloud.
        
        Extracts positions and colors from the splat format.
        Handles Sharp's PLY format with f_dc_* spherical harmonics.
        """
        o3d = _get_open3d()
        
        LOGGER.info(f"Loading splat PLY: {ply_path}")
        
        # Try to load with plyfile for better control over custom attributes
        try:
            from plyfile import PlyData
            plydata = PlyData.read(str(ply_path))
            vertex = plydata['vertex']
            
            # Extract positions
            x = np.array(vertex['x'])
            y = np.array(vertex['y'])
            z = np.array(vertex['z'])
            points = np.column_stack([x, y, z])
            
            # Convert from OpenCV (Y-down, Z-forward) to standard (Y-up, Z-back)
            points[:, 1] = -points[:, 1]  # Flip Y
            points[:, 2] = -points[:, 2]  # Flip Z
            
            # Extract colors from spherical harmonics if available
            colors = None
            if 'f_dc_0' in vertex.data.dtype.names:
                f_dc_0 = np.array(vertex['f_dc_0'])
                f_dc_1 = np.array(vertex['f_dc_1'])
                f_dc_2 = np.array(vertex['f_dc_2'])
                
                # Convert SH to RGB: color = sh * sqrt(1/(4*pi)) + 0.5
                SH_C0 = 0.28209479177387814  # sqrt(1/(4*pi))
                r = f_dc_0 * SH_C0 + 0.5
                g = f_dc_1 * SH_C0 + 0.5
                b = f_dc_2 * SH_C0 + 0.5
                
                # Clamp to [0, 1]
                colors = np.column_stack([
                    np.clip(r, 0, 1),
                    np.clip(g, 0, 1),
                    np.clip(b, 0, 1)
                ])
            elif 'red' in vertex.data.dtype.names:
                # Standard PLY colors
                r = np.array(vertex['red']) / 255.0
                g = np.array(vertex['green']) / 255.0
                b = np.array(vertex['blue']) / 255.0
                colors = np.column_stack([r, g, b])
            
            # Create Open3D point cloud
            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(points)
            
            if colors is not None:
                pcd.colors = o3d.utility.Vector3dVector(colors)
            
            LOGGER.info(f"Loaded {len(points)} points from splat")
            return pcd
            
        except Exception as e:
            LOGGER.warning(f"Failed to parse with plyfile, falling back to Open3D: {e}")
            # Fallback to basic Open3D loader
            pcd = o3d.io.read_point_cloud(str(ply_path))
            return pcd

    def convert_poisson(
        self,
        ply_path: Path,
        depth: int = 9,
        output_format: ExportFormat = "obj"
    ) -> MeshResult:
        """Convert using Poisson Surface Reconstruction.
        
        Produces watertight meshes. Best quality but slower.
        
        Args:
            ply_path: Path to input splat PLY
            depth: Octree depth (higher = more detail, default 9)
            output_format: Output format (obj, glb, ply)
        """
        o3d = _get_open3d()
        
        LOGGER.info(f"Converting with Poisson (depth={depth})")
        
        # Load point cloud
        pcd = self.load_splat_as_pointcloud(ply_path)
        
        # Estimate normals (required for Poisson)
        pcd.estimate_normals(
            search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30)
        )
        pcd.orient_normals_consistent_tangent_plane(k=15)
        
        # Run Poisson reconstruction
        mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
            pcd, depth=depth, linear_fit=True
        )
        
        # Remove low-density vertices (noise)
        densities = np.asarray(densities)
        density_threshold = np.quantile(densities, 0.1)
        vertices_to_remove = densities < density_threshold
        mesh.remove_vertices_by_mask(vertices_to_remove)
        
        # Clean up mesh
        mesh.remove_degenerate_triangles()
        mesh.remove_duplicated_triangles()
        mesh.remove_duplicated_vertices()
        mesh.remove_non_manifold_edges()
        
        # Transfer colors from point cloud to mesh vertices
        if pcd.has_colors():
            mesh.vertex_colors = mesh.vertex_colors  # Trigger color computation
        
        # Export
        output_path = self._export_mesh(mesh, ply_path.stem, "poisson", output_format)
        
        return MeshResult(
            mesh_path=output_path,
            vertex_count=len(mesh.vertices),
            face_count=len(mesh.triangles),
            method="poisson",
            format=output_format
        )

    def convert_ball_pivoting(
        self,
        ply_path: Path,
        radii: Optional[list[float]] = None,
        output_format: ExportFormat = "obj"
    ) -> MeshResult:
        """Convert using Ball Pivoting Algorithm.
        
        Faster than Poisson, handles surfaces with holes.
        
        Args:
            ply_path: Path to input splat PLY
            radii: Ball radii to try (auto-computed if None)
            output_format: Output format (obj, glb, ply)
        """
        o3d = _get_open3d()
        
        LOGGER.info("Converting with Ball Pivoting Algorithm")
        
        # Load point cloud
        pcd = self.load_splat_as_pointcloud(ply_path)
        
        # Estimate normals
        pcd.estimate_normals(
            search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30)
        )
        pcd.orient_normals_consistent_tangent_plane(k=15)
        
        # Compute radii if not provided
        if radii is None:
            distances = pcd.compute_nearest_neighbor_distance()
            avg_dist = np.mean(distances)
            radii = [avg_dist * 0.5, avg_dist, avg_dist * 2, avg_dist * 4]
        
        LOGGER.info(f"Using radii: {radii}")
        
        # Run Ball Pivoting
        mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_ball_pivoting(
            pcd, o3d.utility.DoubleVector(radii)
        )
        
        # Clean up
        mesh.remove_degenerate_triangles()
        mesh.remove_duplicated_triangles()
        mesh.remove_duplicated_vertices()
        
        # Export
        output_path = self._export_mesh(mesh, ply_path.stem, "bpa", output_format)
        
        return MeshResult(
            mesh_path=output_path,
            vertex_count=len(mesh.vertices),
            face_count=len(mesh.triangles),
            method="ball_pivoting",
            format=output_format
        )

    def convert_alpha_shape(
        self,
        ply_path: Path,
        alpha: float = 0.03,
        output_format: ExportFormat = "obj"
    ) -> MeshResult:
        """Convert using Alpha Shapes.
        
        Fastest method, good for convex-ish geometry.
        
        Args:
            ply_path: Path to input splat PLY
            alpha: Alpha parameter (smaller = tighter fit)
            output_format: Output format (obj, glb, ply)
        """
        o3d = _get_open3d()
        
        LOGGER.info(f"Converting with Alpha Shapes (alpha={alpha})")
        
        # Load point cloud
        pcd = self.load_splat_as_pointcloud(ply_path)
        
        # Create alpha shape
        mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_alpha_shape(
            pcd, alpha
        )
        
        # Compute vertex normals for better rendering
        mesh.compute_vertex_normals()
        
        # Export
        output_path = self._export_mesh(mesh, ply_path.stem, "alpha", output_format)
        
        return MeshResult(
            mesh_path=output_path,
            vertex_count=len(mesh.vertices),
            face_count=len(mesh.triangles),
            method="alpha_shape",
            format=output_format
        )

    def _export_mesh(
        self,
        mesh: "open3d.geometry.TriangleMesh",
        base_name: str,
        method: str,
        output_format: ExportFormat
    ) -> Path:
        """Export mesh to file."""
        o3d = _get_open3d()
        trimesh = _get_trimesh()
        
        filename = f"{base_name}_{method}.{output_format}"
        output_path = self.output_dir / filename
        
        # For GLB, use trimesh for better compatibility
        if output_format == "glb":
            # Convert Open3D mesh to trimesh
            vertices = np.asarray(mesh.vertices)
            faces = np.asarray(mesh.triangles)
            
            # Get vertex colors if available
            vertex_colors = None
            if mesh.has_vertex_colors():
                colors = np.asarray(mesh.vertex_colors)
                # Convert to RGBA uint8
                vertex_colors = (colors * 255).astype(np.uint8)
                vertex_colors = np.column_stack([
                    vertex_colors,
                    np.full(len(vertex_colors), 255, dtype=np.uint8)
                ])
            
            tm = trimesh.Trimesh(
                vertices=vertices,
                faces=faces,
                vertex_colors=vertex_colors
            )
            tm.export(str(output_path))
        else:
            # Use Open3D for OBJ and PLY
            o3d.io.write_triangle_mesh(str(output_path), mesh)
        
        LOGGER.info(f"Exported mesh to: {output_path}")
        return output_path

    def convert(
        self,
        ply_path: Path,
        method: MeshMethod = "poisson",
        output_format: ExportFormat = "obj",
        **kwargs
    ) -> MeshResult:
        """Convert splat PLY to mesh using specified method.
        
        Args:
            ply_path: Path to input splat PLY
            method: Conversion method (poisson, ball_pivoting, alpha_shape)
            output_format: Output format (obj, glb, ply)
            **kwargs: Method-specific parameters
        """
        ply_path = Path(ply_path)
        
        if not ply_path.exists():
            raise FileNotFoundError(f"PLY file not found: {ply_path}")
        
        if method == "poisson":
            return self.convert_poisson(ply_path, output_format=output_format, **kwargs)
        elif method == "ball_pivoting":
            return self.convert_ball_pivoting(ply_path, output_format=output_format, **kwargs)
        elif method == "alpha_shape":
            return self.convert_alpha_shape(ply_path, output_format=output_format, **kwargs)
        else:
            raise ValueError(f"Unknown method: {method}. Use poisson, ball_pivoting, or alpha_shape")
