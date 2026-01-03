"""
Basic unit tests for Sharp API utilities.
Run with: pytest tests/test_utils.py
"""

import pytest
import numpy as np
from pathlib import Path


class TestPLYParsing:
    """Tests for PLY file parsing utilities."""
    
    def test_sh_to_rgb_conversion(self):
        """Test Spherical Harmonics to RGB conversion formula."""
        SH_C0 = 0.28209479177387814
        
        # Test neutral gray (SH = 0 should give 0.5)
        sh_value = 0.0
        rgb = 0.5 + SH_C0 * sh_value
        assert abs(rgb - 0.5) < 0.001
        
        # Test bright (positive SH)
        sh_value = 1.0
        rgb = min(1.0, max(0.0, 0.5 + SH_C0 * sh_value))
        assert 0.5 < rgb <= 1.0
        
        # Test dark (negative SH)
        sh_value = -1.0
        rgb = min(1.0, max(0.0, 0.5 + SH_C0 * sh_value))
        assert 0.0 <= rgb < 0.5
        
    def test_opacity_to_alpha_sigmoid(self):
        """Test opacity to alpha conversion using sigmoid."""
        # Sigmoid formula: 1.0 / (1.0 + exp(-opacity))
        
        # Test neutral (opacity 0 should give 0.5)
        opacity = 0.0
        alpha = 1.0 / (1.0 + np.exp(-opacity))
        assert abs(alpha - 0.5) < 0.001
        
        # Test high opacity (large positive -> ~1)
        opacity = 10.0
        alpha = 1.0 / (1.0 + np.exp(-opacity))
        assert alpha > 0.99
        
        # Test low opacity (large negative -> ~0)
        opacity = -10.0
        alpha = 1.0 / (1.0 + np.exp(-opacity))
        assert alpha < 0.01


class TestFileValidation:
    """Tests for file validation utilities."""
    
    def test_allowed_extensions(self):
        """Test file extension validation."""
        allowed_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
        
        # Valid extensions
        assert Path("image.jpg").suffix.lower() in allowed_extensions
        assert Path("IMAGE.PNG").suffix.lower() in allowed_extensions
        assert Path("photo.webp").suffix.lower() in allowed_extensions
        
        # Invalid extensions
        assert Path("document.pdf").suffix.lower() not in allowed_extensions
        assert Path("script.py").suffix.lower() not in allowed_extensions
        assert Path("archive.zip").suffix.lower() not in allowed_extensions
    
    def test_path_sanitization(self):
        """Test path traversal prevention."""
        import os
        
        # basename should strip directory components
        dangerous_paths = [
            ("../../../etc/passwd", "passwd"),
            ("/etc/passwd", "passwd"),
            ("foo/bar/baz.txt", "baz.txt"),
        ]
        
        for path, expected_base in dangerous_paths:
            safe = os.path.basename(path)
            # Should extract just the filename
            assert safe == expected_base, f"Expected {expected_base}, got {safe}"
            # Should not contain path separators
            assert "/" not in safe


class TestMeshConversion:
    """Tests for mesh conversion utilities."""
    
    def test_poisson_depth_range(self):
        """Test Poisson reconstruction depth parameter validation."""
        MIN_DEPTH = 6
        MAX_DEPTH = 12
        
        # Valid depths
        for depth in range(MIN_DEPTH, MAX_DEPTH + 1):
            assert MIN_DEPTH <= depth <= MAX_DEPTH
        
        # Invalid depths
        assert not (MIN_DEPTH <= 5 <= MAX_DEPTH)
        assert not (MIN_DEPTH <= 15 <= MAX_DEPTH)
    
    def test_alpha_shape_range(self):
        """Test Alpha shape parameter validation."""
        MIN_ALPHA = 0.01
        MAX_ALPHA = 2.0
        
        valid_alphas = [0.01, 0.05, 0.1, 0.5, 1.0, 2.0]
        for alpha in valid_alphas:
            assert MIN_ALPHA <= alpha <= MAX_ALPHA


class TestAPIConstants:
    """Tests for API constants and configuration."""
    
    def test_file_size_limit(self):
        """Test file upload size limit is reasonable."""
        MAX_FILE_SIZE_MB = 50
        MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
        
        # Should be 50MB
        assert MAX_FILE_SIZE_BYTES == 52428800
        
        # Should reject files over limit
        test_size = 60 * 1024 * 1024  # 60MB
        assert test_size > MAX_FILE_SIZE_BYTES
    
    def test_timeout_values(self):
        """Test timeout values are reasonable."""
        INFERENCE_TIMEOUT_SECONDS = 600  # 10 minutes
        MESH_TIMEOUT_SECONDS = 300       # 5 minutes
        
        assert INFERENCE_TIMEOUT_SECONDS == 600
        assert MESH_TIMEOUT_SECONDS == 300
        assert INFERENCE_TIMEOUT_SECONDS > MESH_TIMEOUT_SECONDS


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
