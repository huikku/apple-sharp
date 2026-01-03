# Sharp API Usage Examples

Base URL: `https://huikku--sharp-api-fastapi-app.modal.run`

## Quick Start

### 1. Upload an Image

```bash
curl -X POST "https://huikku--sharp-api-fastapi-app.modal.run/api/inference/upload" \
  -F "file=@photo.jpg"
```

Response:
```json
{
  "imageId": "abc123def",
  "jobId": "job-456",
  "message": "Image uploaded successfully",
  "queuePosition": 1
}
```

### 2. Start Generation

```bash
curl -X POST "https://huikku--sharp-api-fastapi-app.modal.run/api/inference/generate" \
  -H "Content-Type: application/json" \
  -d '{"image_id": "abc123def"}'
```

Response:
```json
{
  "jobId": "job-456",
  "status": "queued",
  "message": "Job queued for processing"
}
```

### 3. Poll for Status

```bash
curl "https://huikku--sharp-api-fastapi-app.modal.run/api/inference/status/job-456"
```

Responses:

**Queued:**
```json
{
  "jobId": "job-456",
  "status": "queued",
  "statusDetail": "Waiting in queue",
  "queuePosition": 2,
  "estimatedWaitSeconds": 60
}
```

**Processing:**
```json
{
  "jobId": "job-456",
  "status": "processing",
  "statusDetail": "Running Sharp inference...",
  "queuePosition": 0,
  "estimatedWaitSeconds": 0
}
```

**Complete:**
```json
{
  "jobId": "job-456",
  "status": "complete",
  "statusDetail": "Processing complete",
  "splatPath": "/outputs/splats/job-456/splat.ply",
  "splatUrl": "/api/download/job-456/splat.ply",
  "processingTimeMs": 15234
}
```

### 4. Download PLY

```bash
curl -O "https://huikku--sharp-api-fastapi-app.modal.run/api/download/job-456/splat.ply"
```

---

## Mesh Conversion

### Convert PLY to Mesh

```bash
curl -X POST "https://huikku--sharp-api-fastapi-app.modal.run/api/mesh/convert" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job-456",
    "method": "poisson",
    "output_format": "obj",
    "depth": 8
  }'
```

Response:
```json
{
  "mesh_filename": "mesh_abc123.obj",
  "format": "obj",
  "method": "poisson",
  "vertices": 50234,
  "faces": 100456,
  "download_url": "/api/mesh/download/mesh_abc123.obj"
}
```

### Mesh Methods

| Method | Parameters | Example |
|--------|------------|---------|
| `poisson` | `depth`: 6-12 (default 8) | Smooth, watertight surfaces |
| `ball_pivoting` | `radius`: auto or list | Preserves point positions |
| `alpha_shape` | `alpha`: 0.01-2.0 | Fast, handles concave shapes |

**Ball Pivoting Example:**
```json
{
  "job_id": "job-456",
  "method": "ball_pivoting",
  "output_format": "glb",
  "radius": [0.01, 0.02, 0.04]
}
```

**Alpha Shape Example:**
```json
{
  "job_id": "job-456",
  "method": "alpha_shape",
  "output_format": "ply",
  "alpha": 0.1
}
```

---

## Health & Stats

### Health Check

```bash
curl "https://huikku--sharp-api-fastapi-app.modal.run/api/health"
```

Response:
```json
{
  "status": "ok",
  "service": "sharp-api-modal",
  "version": "2.1.0",
  "activeJobs": 1,
  "queuedJobs": 3
}
```

### Usage Statistics

```bash
curl "https://huikku--sharp-api-fastapi-app.modal.run/api/stats"
```

Response:
```json
{
  "allTime": 1234,
  "thisYear": 567,
  "thisMonth": 89,
  "thisDay": 12,
  "thisHour": 3,
  "queueLength": 2,
  "activeJobs": 1,
  "hourlyBreakdown": [0, 0, 1, 2, 5, 3, 1, 0, ...]
}
```

---

## JavaScript/TypeScript Client

```typescript
const API_BASE = 'https://huikku--sharp-api-fastapi-app.modal.run';

// Upload image
async function uploadImage(file: File): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE}/api/inference/upload`, {
    method: 'POST',
    body: formData
  });
  
  return response.json();
}

// Poll for completion
async function waitForCompletion(jobId: string): Promise<JobStatus> {
  while (true) {
    const response = await fetch(`${API_BASE}/api/inference/status/${jobId}`);
    const status = await response.json();
    
    if (status.status === 'complete') return status;
    if (status.status === 'failed') throw new Error(status.error);
    
    await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
  }
}

// Full workflow
async function generateSplat(imageFile: File): Promise<string> {
  // 1. Upload
  const { jobId } = await uploadImage(imageFile);
  
  // 2. Start generation
  await fetch(`${API_BASE}/api/inference/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: jobId })
  });
  
  // 3. Wait for completion
  const result = await waitForCompletion(jobId);
  
  // 4. Return download URL
  return `${API_BASE}${result.splatUrl}`;
}
```

---

## Python Client

```python
import requests
import time

API_BASE = "https://huikku--sharp-api-fastapi-app.modal.run"

def generate_splat(image_path: str) -> str:
    """Generate a Gaussian splat from an image file."""
    
    # 1. Upload image
    with open(image_path, "rb") as f:
        response = requests.post(
            f"{API_BASE}/api/inference/upload",
            files={"file": f}
        )
    job_id = response.json()["jobId"]
    
    # 2. Start generation
    requests.post(
        f"{API_BASE}/api/inference/generate",
        json={"image_id": job_id}
    )
    
    # 3. Poll for completion
    while True:
        response = requests.get(f"{API_BASE}/api/inference/status/{job_id}")
        status = response.json()
        
        if status["status"] == "complete":
            break
        if status["status"] == "failed":
            raise Exception(status.get("error", "Generation failed"))
        
        time.sleep(2)
    
    # 4. Return download URL
    return f"{API_BASE}{status['splatUrl']}"

# Usage
ply_url = generate_splat("photo.jpg")
print(f"Download PLY: {ply_url}")
```

---

## Error Handling

### Common Error Responses

**400 Bad Request:**
```json
{
  "detail": "Invalid file type. Allowed: .jpg, .jpeg, .png, .webp, .gif"
}
```

**404 Not Found:**
```json
{
  "detail": "Job not found: invalid-job-id"
}
```

**500 Internal Error:**
```json
{
  "detail": "Internal error: CUDA out of memory"
}
```

### Rate Limits

Currently no rate limits applied. For production use, implement client-side throttling:
- Max 1 concurrent job per client
- Wait 2+ seconds between status polls
- Retry with exponential backoff on 5xx errors

---

## OpenAPI Documentation

Interactive API docs available at:
- **Swagger UI:** https://huikku--sharp-api-fastapi-app.modal.run/docs
- **ReDoc:** https://huikku--sharp-api-fastapi-app.modal.run/redoc
