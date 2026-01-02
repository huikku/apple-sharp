# Convert PLY Gaussian Splat to .splat format for web viewers
# Based on https://github.com/antimatter15/splat/blob/main/convert.py

from pathlib import Path
from plyfile import PlyData
import numpy as np
from io import BytesIO


def convert_ply_to_splat(ply_path: Path, output_path: Path) -> bool:
    """
    Convert a 3DGS PLY file to .splat format.
    
    Args:
        ply_path: Path to input PLY file
        output_path: Path to output .splat file
        
    Returns:
        True if conversion successful, False otherwise
    """
    try:
        plydata = PlyData.read(str(ply_path))
        vert = plydata["vertex"]
        
        # Sort by importance (size * opacity)
        sorted_indices = np.argsort(
            -np.exp(vert["scale_0"] + vert["scale_1"] + vert["scale_2"])
            / (1 + np.exp(-vert["opacity"]))
        )
        
        buffer = BytesIO()
        for idx in sorted_indices:
            v = vert[idx]
            
            # Position
            position = np.array([v["x"], v["y"], v["z"]], dtype=np.float32)
            
            # Scales (already in log space, exp them)
            scales = np.exp(
                np.array([v["scale_0"], v["scale_1"], v["scale_2"]], dtype=np.float32)
            )
            
            # Rotation quaternion
            rot = np.array(
                [v["rot_0"], v["rot_1"], v["rot_2"], v["rot_3"]],
                dtype=np.float32,
            )
            
            # Color - convert from SH to RGB
            SH_C0 = 0.28209479177387814
            color = np.array([
                0.5 + SH_C0 * v["f_dc_0"],
                0.5 + SH_C0 * v["f_dc_1"],
                0.5 + SH_C0 * v["f_dc_2"],
                1 / (1 + np.exp(-v["opacity"])),  # sigmoid
            ])
            
            # Write to buffer
            buffer.write(position.tobytes())
            buffer.write(scales.tobytes())
            buffer.write((color * 255).clip(0, 255).astype(np.uint8).tobytes())
            buffer.write(
                ((rot / np.linalg.norm(rot)) * 128 + 128)
                .clip(0, 255)
                .astype(np.uint8)
                .tobytes()
            )
        
        # Write output file
        with open(output_path, "wb") as f:
            f.write(buffer.getvalue())
        
        return True
        
    except Exception as e:
        print(f"PLY to splat conversion error: {e}")
        return False


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python ply_to_splat.py input.ply output.splat")
        sys.exit(1)
    
    success = convert_ply_to_splat(Path(sys.argv[1]), Path(sys.argv[2]))
    sys.exit(0 if success else 1)
