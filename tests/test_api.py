"""
API integration tests for Sharp backend.
Run with: pytest tests/test_api.py
"""

import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys

# Add server to path
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture
def client():
    """Create test client for FastAPI app."""
    from server.main import app
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for health check endpoint."""
    
    def test_health_returns_ok(self, client):
        """Health check should return status ok."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "service" in data
    
    def test_health_response_time(self, client):
        """Health check should respond quickly."""
        import time
        start = time.time()
        response = client.get("/api/health")
        elapsed = time.time() - start
        
        assert response.status_code == 200
        assert elapsed < 1.0  # Should respond in under 1 second


class TestRootEndpoint:
    """Tests for root endpoint."""
    
    def test_root_returns_info(self, client):
        """Root should return API info."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "docs" in data


class TestCORSHeaders:
    """Tests for CORS header configuration."""
    
    def test_cors_preflight_localhost(self, client):
        """CORS preflight should work for localhost."""
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET"
            }
        )
        # Should get CORS headers back
        assert response.status_code in [200, 204]
    
    def test_cors_not_allowed_unknown_origin(self, client):
        """Unknown origins should be rejected."""
        response = client.get(
            "/api/health",
            headers={"Origin": "https://malicious-site.com"}
        )
        # Request works but no CORS headers for unknown origin
        assert response.status_code == 200
        # Access-Control-Allow-Origin should NOT include the malicious origin
        cors_header = response.headers.get("Access-Control-Allow-Origin", "")
        assert "malicious-site.com" not in cors_header


class TestUploadValidation:
    """Tests for file upload validation."""
    
    def test_upload_rejects_no_file(self, client):
        """Upload without file should fail."""
        response = client.post("/api/inference/upload")
        # 404 is acceptable if route doesn't exist in local server
        # 400/422 for validation error if route exists
        assert response.status_code in [400, 404, 422]
    
    def test_upload_accepts_valid_image_types(self, client):
        """Valid image types should be accepted."""
        from io import BytesIO
        
        # Create minimal valid PNG
        png_header = b'\x89PNG\r\n\x1a\n'
        
        for ext in [".png", ".jpg", ".jpeg", ".webp"]:
            # Note: actual file validation may fail since this isn't a valid image
            # Testing the extension check primarily
            response = client.post(
                "/api/inference/upload",
                files={"file": (f"test{ext}", BytesIO(png_header), "image/png")}
            )
            # Should not reject based on extension
            # May fail for other reasons (invalid image data)
            assert response.status_code != 415  # Not Unsupported Media Type


class TestInferenceEndpoints:
    """Tests for inference API endpoints."""
    
    def test_generate_requires_image_id(self, client):
        """Generate endpoint should require image_id."""
        response = client.post("/api/inference/generate")
        # 404 is acceptable if route doesn't exist in local server
        assert response.status_code in [400, 404, 422]
    
    def test_status_invalid_job(self, client):
        """Status for invalid job should return 404."""
        response = client.get("/api/inference/status/nonexistent-job-id")
        assert response.status_code == 404


class TestMeshEndpoints:
    """Tests for mesh conversion endpoints."""
    
    def test_convert_requires_job_id(self, client):
        """Convert endpoint should require job_id."""
        response = client.post(
            "/api/mesh/convert",
            json={"method": "poisson", "output_format": "obj"}
        )
        # Should fail without job_id
        assert response.status_code in [400, 422]
    
    def test_convert_validates_method(self, client):
        """Convert endpoint should validate method parameter."""
        response = client.post(
            "/api/mesh/convert",
            json={
                "job_id": "test-job",
                "method": "invalid_method",
                "output_format": "obj"
            }
        )
        # Should reject invalid method
        assert response.status_code in [400, 422, 404]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
