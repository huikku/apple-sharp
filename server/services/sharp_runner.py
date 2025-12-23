import subprocess
import os
import time
from pathlib import Path
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class SharpRunner:
    """Wrapper for Sharp CLI commands."""
    
    def __init__(
        self, 
        checkpoint_path: Optional[str] = None,
        output_dir: str = "outputs/splats"
    ):
        # If checkpoint_path is provided and exists, use it. Otherwise None for auto-download
        self.checkpoint_path = checkpoint_path
        if checkpoint_path and not Path(checkpoint_path).exists():
            self.checkpoint_path = None  # Let Sharp auto-download
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def predict(self, input_image: str, job_id: str) -> Tuple[bool, str, int]:
        """
        Run Sharp prediction on an image.
        
        Returns:
            Tuple of (success, output_path_or_error, processing_time_ms)
        """
        output_path = self.output_dir / job_id
        output_path.mkdir(parents=True, exist_ok=True)
        
        start_time = time.time()
        
        try:
            cmd = [
                "sharp", "predict",
                "-i", input_image,
                "-o", str(output_path),
            ]
            
            # Only add checkpoint flag if we have a specific path
            if self.checkpoint_path:
                cmd.extend(["-c", self.checkpoint_path])
            
            logger.info(f"Running Sharp prediction: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout (first run downloads 2.8GB model)
            )
            
            processing_time = int((time.time() - start_time) * 1000)
            
            if result.returncode != 0:
                logger.error(f"Sharp failed: {result.stderr}")
                return False, result.stderr or "Sharp prediction failed", processing_time
            
            # Find the output .ply file
            ply_files = list(output_path.glob("*.ply"))
            if not ply_files:
                return False, "No .ply output generated", processing_time
            
            # Return the first .ply file found
            return True, str(ply_files[0]), processing_time
            
        except subprocess.TimeoutExpired:
            processing_time = int((time.time() - start_time) * 1000)
            return False, "Processing timeout exceeded", processing_time
        except FileNotFoundError:
            return False, "Sharp CLI not found. Install with: pip install ml-sharp", 0
        except Exception as e:
            processing_time = int((time.time() - start_time) * 1000)
            logger.exception("Sharp prediction error")
            return False, str(e), processing_time
    
    def render_trajectory(
        self, 
        splat_path: str, 
        job_id: str
    ) -> Tuple[bool, str, int]:
        """
        Render a video trajectory from a splat (requires CUDA GPU).
        
        Returns:
            Tuple of (success, output_path_or_error, processing_time_ms)
        """
        output_path = self.output_dir / job_id / "video"
        output_path.mkdir(parents=True, exist_ok=True)
        
        start_time = time.time()
        
        try:
            cmd = [
                "sharp", "render",
                "-i", splat_path,
                "-o", str(output_path),
            ]
            
            # Only add checkpoint flag if we have a specific path
            if self.checkpoint_path:
                cmd.extend(["-c", self.checkpoint_path])
            
            logger.info(f"Running Sharp render: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout for video
            )
            
            processing_time = int((time.time() - start_time) * 1000)
            
            if result.returncode != 0:
                return False, result.stderr or "Render failed", processing_time
            
            # Find output video
            video_files = list(output_path.glob("*.mp4"))
            if not video_files:
                return False, "No video output generated", processing_time
            
            return True, str(video_files[0]), processing_time
            
        except subprocess.TimeoutExpired:
            processing_time = int((time.time() - start_time) * 1000)
            return False, "Render timeout exceeded", processing_time
        except Exception as e:
            processing_time = int((time.time() - start_time) * 1000)
            return False, str(e), processing_time


# Singleton instance
_runner: Optional[SharpRunner] = None


def get_sharp_runner() -> SharpRunner:
    global _runner
    if _runner is None:
        _runner = SharpRunner()
    return _runner
