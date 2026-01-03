# Staging Environment Setup Guide

**Apple Sharp - 3D Gaussian Splats**
**Last Updated:** January 3, 2026

---

## Overview

This guide walks you through setting up a complete staging environment for Apple Sharp, with isolated infrastructure for testing before production deployment.

**Architecture:**
- **Production:** `main` branch → GitHub Pages + Modal production app
- **Staging:** `staging` branch → GitHub Pages `/staging/` + Modal staging app
- **Development:** Local (`localhost:5173` + `localhost:8001`)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Backend Setup (Modal Staging)](#3-backend-setup-modal-staging)
4. [Frontend Setup (GitHub Pages Staging)](#4-frontend-setup-github-pages-staging)
5. [CI/CD Pipeline](#5-cicd-pipeline)
6. [Testing Workflow](#6-testing-workflow)
7. [Cost Optimization](#7-cost-optimization)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Architecture Overview

### Environment Comparison

| Aspect | Development | Staging | Production |
|--------|-------------|---------|------------|
| **Frontend URL** | `localhost:5173` | `huikku.github.io/apple-sharp/staging/` | `huikku.github.io/apple-sharp/` |
| **Backend URL** | `localhost:8001` | `*--sharp-api-staging-web.modal.run` | `*--sharp-api-web.modal.run` |
| **Modal App Name** | N/A | `sharp-api-staging` | `sharp-api` |
| **Sentry Environment** | `development` | `staging` | `production` |
| **Git Branch** | `develop` | `staging` | `main` |
| **Min Containers** | 0 | 0 (cold start OK) | 1 (warm start) |
| **Trace Sampling** | 100% | 50% | 10% |
| **Job Retention** | N/A | 7 days | 30 days |

### Data Isolation

Each environment has completely separate:
- ✅ Modal volumes (outputs, model cache)
- ✅ Modal persistent dicts (jobs, stats)
- ✅ Sentry projects
- ✅ API keys/secrets

---

## 2. Prerequisites

### Required Accounts & Credentials

- [x] GitHub repository with Pages enabled
- [x] Modal account with API token
- [x] Sentry account (optional but recommended)

### GitHub Secrets to Configure

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

```
MODAL_TOKEN_ID          # Modal authentication token ID
MODAL_TOKEN_SECRET      # Modal authentication token secret
MODAL_API_URL           # Production Modal URL (e.g., https://yourname--sharp-api-web.modal.run)
MODAL_STAGING_API_URL   # Staging Modal URL (will be set after first deploy)
SENTRY_DSN              # Sentry DSN for error tracking (optional)
```

**Get Modal Token:**
```bash
# Generate Modal token
modal token new

# Copy the token ID and secret to GitHub secrets
```

---

## 3. Backend Setup (Modal Staging)

### Step 1: Create Staging Configuration File

Create a new file: `modal_app_staging.py`

```python
"""
Modal Staging App for Apple Sharp
Separate infrastructure from production for safe testing
"""

import os
import time
from pathlib import Path
from typing import Optional

import modal
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import sentry_sdk

# ============================================================================
# STAGING CONFIGURATION
# ============================================================================

ENVIRONMENT = "staging"
APP_NAME = "sharp-api-staging"

# Sentry configuration for staging
if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(
        dsn=os.environ["SENTRY_DSN"],
        environment=ENVIRONMENT,
        traces_sample_rate=0.5,  # Higher sampling for staging (50%)
        send_default_pii=True,
        release=f"sharp-staging@{os.getenv('GIT_COMMIT', 'unknown')}",
    )

# ============================================================================
# MODAL APP SETUP
# ============================================================================

# Create staging-specific app
app = modal.App(APP_NAME)

# Staging-specific volumes (separate from production)
outputs_volume = modal.Volume.from_name(
    "sharp-outputs-staging",
    create_if_missing=True
)
model_cache = modal.Volume.from_name(
    "sharp-model-cache-staging",
    create_if_missing=True
)

# Staging-specific persistent storage
jobs = modal.Dict.from_name("sharp-jobs-staging", create_if_missing=True)
stats = modal.Dict.from_name("sharp-stats-staging", create_if_missing=True)

# Container image (same as production)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libgl1-mesa-glx", "libgomp1")
    .pip_install(
        "fastapi>=0.109.0",
        "uvicorn>=0.27.0",
        "python-multipart",
        "pillow>=10.0.0",
        "torch>=2.0.0",
        "torchvision>=0.15.0",
        "numpy",
        "open3d>=0.18.0",
        "trimesh>=4.0.0",
        "plyfile",
        "timm",
        "einops",
        "huggingface_hub",
        "sentry-sdk[fastapi]",
    )
    .run_commands(
        "cd /root && git clone https://github.com/apple/ml-sharp.git",
        "cd /root/ml-sharp && pip install -e .",
    )
    .env({"HF_HOME": "/cache/huggingface", "TORCH_HOME": "/cache/torch"})
)

# ============================================================================
# FASTAPI APP
# ============================================================================

web_app = FastAPI(
    title="Apple Sharp API - Staging",
    version="2.1.0-staging",
    description="Staging environment for 3D Gaussian Splatting API"
)

# CORS - Allow staging frontend + local dev
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://huikku.github.io",  # GitHub Pages (both prod and staging)
        "http://localhost:5173",        # Local dev
        "http://localhost:3000",        # Alternative local port
        "http://127.0.0.1:5173",
        "https://supersplat.super-splat.com",  # SuperSplat integration
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers middleware
@web_app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Environment"] = "staging"  # Staging identifier
    return response

# Rate limiting (more permissive for staging)
from collections import defaultdict
rate_limit_store = defaultdict(list)

@web_app.middleware("http")
async def rate_limit_middleware(request, call_next):
    client_ip = request.client.host
    current_time = time.time()

    # Staging: 120 requests per minute (vs 60 in production)
    rate_limit_store[client_ip] = [
        t for t in rate_limit_store[client_ip]
        if current_time - t < 60
    ]

    if len(rate_limit_store[client_ip]) >= 120:
        raise HTTPException(status_code=429, detail="Rate limit exceeded (staging: 120/min)")

    rate_limit_store[client_ip].append(current_time)
    return await call_next(request)

# ============================================================================
# API ENDPOINTS
# ============================================================================

@web_app.get("/")
def root():
    """Root endpoint - API info"""
    return {
        "name": "Apple Sharp API",
        "version": "2.1.0-staging",
        "environment": "staging",
        "description": "Monocular 3D Gaussian Splatting API - Staging Environment",
        "docs": "/docs",
        "status": "active"
    }

@web_app.get("/api/health")
def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "sharp-api",
        "environment": "staging",
        "timestamp": int(time.time())
    }

# TODO: Add all your other endpoints from modal_app.py here
# Copy from modal_app.py:
# - /api/inference/upload
# - /api/inference/generate
# - /api/inference/status/{job_id}
# - /api/inference/download/{job_id}
# - /api/mesh/convert
# - /api/mesh/download/{job_id}
# - /api/mesh/methods
# - /api/stats (if you have it)

# ============================================================================
# MODAL DEPLOYMENT
# ============================================================================

@app.function(
    image=image,
    gpu="T4",  # Staging can use cheaper GPU
    timeout=600,  # 10 min (same as production)
    volumes={"/outputs": outputs_volume, "/cache": model_cache},
    container_idle_timeout=300,
    allow_concurrent_inputs=10,
    min_containers=0,  # Staging: cold start acceptable (save costs)
)
@modal.asgi_app()
def web():
    """Staging web endpoint"""
    return web_app
```

### Step 2: Deploy Staging Backend

```bash
# Deploy to Modal
modal deploy modal_app_staging.py

# Output will show:
# ✓ Created web function sharp-api-staging-web
# View app at: https://modal.com/apps/ap-xxx/main/sharp-api-staging
# Web endpoint: https://yourname--sharp-api-staging-web.modal.run
```

**Copy the staging URL and add it to GitHub secrets as `MODAL_STAGING_API_URL`**

### Step 3: Test Staging Backend

```bash
# Health check
curl https://yourname--sharp-api-staging-web.modal.run/api/health

# Should return:
# {"status":"ok","service":"sharp-api","environment":"staging",...}
```

---

## 4. Frontend Setup (GitHub Pages Staging)

### Step 1: Create Staging Branch

```bash
# Create and checkout staging branch
git checkout -b staging

# Push to GitHub
git push -u origin staging
```

### Step 2: Update Frontend Config

Create `app/src/config.ts`:

```typescript
/**
 * Environment-specific configuration
 */

interface Config {
  apiUrl: string
  environment: 'development' | 'staging' | 'production'
  sentryDsn?: string
  sentryEnvironment: string
}

const configs: Record<string, Config> = {
  development: {
    apiUrl: 'http://localhost:8001',
    environment: 'development',
    sentryEnvironment: 'development',
  },
  staging: {
    apiUrl: import.meta.env.VITE_API_URL || 'https://yourname--sharp-api-staging-web.modal.run',
    environment: 'staging',
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
    sentryEnvironment: 'staging',
  },
  production: {
    apiUrl: import.meta.env.VITE_API_URL || 'https://yourname--sharp-api-web.modal.run',
    environment: 'production',
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
    sentryEnvironment: 'production',
  },
}

// Auto-detect environment based on hostname and path
function getEnvironment(): string {
  const hostname = window.location.hostname
  const pathname = window.location.pathname

  // Local development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'development'
  }

  // Staging (deployed to /staging/ subdirectory)
  if (pathname.startsWith('/apple-sharp/staging')) {
    return 'staging'
  }

  // Production
  return 'production'
}

const environment = getEnvironment()
const config = configs[environment]

export default config
```

### Step 3: Update API Client

Update `app/src/services/api.ts`:

```typescript
import axios from 'axios'
import config from '../config'

const api = axios.create({
  baseURL: config.apiUrl,
  timeout: 120000,
  withCredentials: false,
})

// Add environment header
api.interceptors.request.use((config) => {
  config.headers['X-Client-Environment'] = environment
  return config
})

// Log environment on init
console.log(`[API] Environment: ${config.environment}`)
console.log(`[API] Backend: ${config.apiUrl}`)

export default api
```

### Step 4: Update Vite Config

Update `app/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/apple-sharp/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
})
```

---

## 5. CI/CD Pipeline

### Create GitHub Actions Workflow

Create `.github/workflows/deploy-staging.yml`:

```yaml
name: Deploy Staging

on:
  push:
    branches: [staging]
  workflow_dispatch:

jobs:
  deploy-backend:
    name: Deploy Modal Staging Backend
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install Modal
        run: pip install modal

      - name: Deploy to Modal Staging
        env:
          MODAL_TOKEN_ID: ${{ secrets.MODAL_TOKEN_ID }}
          MODAL_TOKEN_SECRET: ${{ secrets.MODAL_TOKEN_SECRET }}
        run: |
          modal token set --token-id $MODAL_TOKEN_ID --token-secret $MODAL_TOKEN_SECRET
          modal deploy modal_app_staging.py

  deploy-frontend:
    name: Deploy GitHub Pages Staging
    needs: deploy-backend
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: app/package-lock.json

      - name: Install dependencies
        working-directory: ./app
        run: npm ci

      - name: Build frontend
        working-directory: ./app
        env:
          VITE_API_URL: ${{ secrets.MODAL_STAGING_API_URL }}
          VITE_BASE_PATH: /apple-sharp/staging/
          VITE_SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
        run: npm run build

      - name: Deploy to GitHub Pages (Staging)
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./app/dist
          destination_dir: staging
          commit_message: 'Deploy staging build'

  notify:
    name: Notify Deployment
    needs: [deploy-backend, deploy-frontend]
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Deployment Status
        run: |
          echo "Staging deployment completed!"
          echo "Frontend: https://huikku.github.io/apple-sharp/staging/"
          echo "Backend: ${{ secrets.MODAL_STAGING_API_URL }}"
```

### Update Production Workflow

Update `.github/workflows/deploy.yml` to only deploy on `main`:

```yaml
name: Deploy Production

on:
  push:
    branches: [main]  # Only main branch
  workflow_dispatch:

# ... rest of your existing production deployment
```

---

## 6. Testing Workflow

### Development → Staging → Production Flow

```
┌─────────────┐
│   develop   │  Local development branch
└──────┬──────┘
       │ PR
       ▼
┌─────────────┐
│   staging   │  Staging environment
└──────┬──────┘  • Auto-deploy on merge
       │         • QA testing
       │         • Performance testing
       │         • Beta user testing
       │ PR
       ▼
┌─────────────┐
│    main     │  Production environment
└─────────────┘  • Auto-deploy on merge
                 • Live users
```

### Testing Checklist for Staging

Before promoting to production, verify:

- [ ] Image upload and processing works
- [ ] 3D viewer renders correctly
- [ ] Mesh conversion (all 3 methods)
- [ ] SuperSplat integration
- [ ] Rate limiting (try 120+ requests/min)
- [ ] Error handling and Sentry alerts
- [ ] Mobile responsiveness
- [ ] Performance (check Sentry traces)
- [ ] CORS from GitHub Pages
- [ ] Stats dashboard

### Testing Commands

```bash
# Test staging upload
curl -X POST https://yourname--sharp-api-staging-web.modal.run/api/inference/upload \
  -F "file=@test-image.jpg"

# Test staging health
curl https://yourname--sharp-api-staging-web.modal.run/api/health

# Check Sentry staging environment
# Visit: https://your-sentry-org.sentry.io/issues/?environment=staging
```

---

## 7. Cost Optimization

### Staging Cost-Saving Measures

**Modal Configuration:**
```python
# Staging settings to reduce costs
min_containers=0,              # No warm containers (vs 1 in prod)
container_idle_timeout=300,    # 5 min (vs 10 min in prod)
gpu="T4",                      # Cheaper GPU (vs A10G in prod)
timeout=300,                   # 5 min (vs 10 min in prod)
```

**Data Retention:**
```python
# Clean up old staging jobs
async def cleanup_old_jobs():
    """Delete staging jobs older than 7 days"""
    cutoff = time.time() - (7 * 24 * 60 * 60)

    for job_id, job in list(jobs.items()):
        if job.get("created_at", 0) < cutoff:
            # Delete job metadata
            del jobs[job_id]

            # Delete files
            job_dir = Path(f"/outputs/splats/{job_id}")
            if job_dir.exists():
                shutil.rmtree(job_dir)
```

**Estimated Costs:**

| Environment | Monthly Cost | Notes |
|-------------|--------------|-------|
| **Production** | $20-100 | Warm container, A10G GPU, full retention |
| **Staging** | $5-20 | Cold start, T4 GPU, 7-day retention |
| **Total** | $25-120 | Depends on usage |

### Cost Monitoring

Add to Sentry or create a simple endpoint:

```python
@web_app.get("/api/stats/costs")
def estimate_costs():
    """Estimate staging costs"""
    total_jobs = len(jobs)
    avg_duration = 30  # seconds
    gpu_cost_per_hour = 0.50  # T4 GPU

    estimated_gpu_hours = (total_jobs * avg_duration) / 3600
    estimated_cost = estimated_gpu_hours * gpu_cost_per_hour

    return {
        "environment": "staging",
        "total_jobs": total_jobs,
        "estimated_gpu_hours": round(estimated_gpu_hours, 2),
        "estimated_cost_usd": round(estimated_cost, 2)
    }
```

---

## 8. Troubleshooting

### Common Issues

#### 1. Frontend Can't Connect to Staging Backend

**Symptoms:** CORS errors, 404 errors

**Solutions:**
```bash
# Verify backend is running
curl https://yourname--sharp-api-staging-web.modal.run/api/health

# Check CORS configuration in modal_app_staging.py
# Ensure GitHub Pages URL is in allow_origins

# Verify frontend is using correct API URL
# Check browser console for config.apiUrl
```

#### 2. GitHub Actions Deployment Fails

**Symptoms:** Action fails with "Permission denied"

**Solutions:**
```yaml
# Ensure GitHub Pages is enabled
# Settings → Pages → Source: GitHub Actions

# Verify secrets are set
# Settings → Secrets → Actions
# - MODAL_TOKEN_ID
# - MODAL_TOKEN_SECRET
# - MODAL_STAGING_API_URL

# Check action logs for specific error
```

#### 3. Staging and Production Data Mixed

**Symptoms:** Production jobs appearing in staging

**Solutions:**
```python
# Verify separate Modal app names
# modal_app.py:        app = modal.App("sharp-api")
# modal_app_staging.py: app = modal.App("sharp-api-staging")

# Verify separate volumes/dicts
# Production: "sharp-outputs", "sharp-jobs"
# Staging:    "sharp-outputs-staging", "sharp-jobs-staging"

# List Modal resources
modal volume list
modal dict list
```

#### 4. Sentry Events Not Appearing

**Symptoms:** No errors in Sentry staging environment

**Solutions:**
```python
# Verify Sentry DSN is set
print(os.getenv("SENTRY_DSN"))

# Check environment is correct
sentry_sdk.init(
    environment="staging",  # Must match Sentry filter
    # ...
)

# Test error manually
@web_app.get("/api/test-error")
def test_error():
    raise Exception("Test staging error!")
```

#### 5. Rate Limiting Too Aggressive

**Symptoms:** Constant 429 errors in staging

**Solutions:**
```python
# Increase staging rate limit
if len(rate_limit_store[client_ip]) >= 120:  # Higher than production (60)
    raise HTTPException(...)

# Or disable rate limiting for specific IPs
STAGING_WHITELIST = ["YOUR_IP_HERE"]
if client_ip in STAGING_WHITELIST:
    return await call_next(request)
```

---

## 9. Monitoring & Observability

### Sentry Dashboard Filters

**View Staging Errors:**
```
https://alienrobot.sentry.io/issues/?environment=staging
```

**Compare Staging vs Production:**
```
Filter by environment: staging
Compare to: production
```

### Modal Dashboard

**View Staging App:**
```
https://modal.com/apps/your-workspace/main/sharp-api-staging
```

**Monitor Costs:**
- Modal Dashboard → Usage
- Filter by app: `sharp-api-staging`

### Custom Health Dashboard

Add to staging app:

```python
@web_app.get("/api/health/detailed")
def detailed_health():
    """Detailed health metrics for staging"""
    return {
        "environment": "staging",
        "timestamp": int(time.time()),
        "volumes": {
            "outputs": outputs_volume.listdir("/"),
            "cache": model_cache.listdir("/"),
        },
        "jobs": {
            "total": len(jobs),
            "queued": sum(1 for j in jobs.values() if j.get("status") == "queued"),
            "processing": sum(1 for j in jobs.values() if j.get("status") == "processing"),
            "completed": sum(1 for j in jobs.values() if j.get("status") == "complete"),
        },
        "stats": dict(stats) if stats else {},
    }
```

---

## 10. Promotion to Production

### Pre-Production Checklist

Before merging `staging` → `main`:

- [ ] All staging tests pass
- [ ] No critical Sentry errors in staging
- [ ] Performance metrics acceptable
- [ ] Beta users have tested successfully
- [ ] Database migrations ready (if applicable)
- [ ] Rollback plan documented

### Promotion Process

```bash
# 1. Ensure staging is up to date
git checkout staging
git pull origin staging

# 2. Create PR from staging to main
git checkout main
git pull origin main
git merge staging

# 3. Review changes
git diff origin/main

# 4. Push to main (triggers production deployment)
git push origin main

# 5. Monitor deployment
# - Watch GitHub Actions
# - Check Sentry production environment
# - Monitor Modal production app
# - Check https://huikku.github.io/apple-sharp/

# 6. If issues arise, rollback
git revert HEAD
git push origin main
```

---

## 11. Quick Reference

### URLs

| Environment | Frontend | Backend |
|-------------|----------|---------|
| **Development** | http://localhost:5173 | http://localhost:8001 |
| **Staging** | https://huikku.github.io/apple-sharp/staging/ | https://huikku--sharp-api-staging-web.modal.run |
| **Production** | https://huikku.github.io/apple-sharp/ | https://huikku--sharp-api-web.modal.run |

### Git Branches

```bash
# Development
git checkout develop
git push origin develop

# Staging (triggers auto-deploy)
git checkout staging
git merge develop
git push origin staging

# Production (triggers auto-deploy)
git checkout main
git merge staging
git push origin main
```

### Modal Commands

```bash
# Deploy staging
modal deploy modal_app_staging.py

# Deploy production
modal deploy modal_app.py

# View staging logs
modal app logs sharp-api-staging

# View staging stats
modal volume list | grep staging
modal dict list | grep staging
```

### Environment Variables

```bash
# Local .env
VITE_API_URL=http://localhost:8001

# Staging (set in GitHub Actions)
VITE_API_URL=${{ secrets.MODAL_STAGING_API_URL }}
VITE_BASE_PATH=/apple-sharp/staging/

# Production (set in GitHub Actions)
VITE_API_URL=${{ secrets.MODAL_API_URL }}
VITE_BASE_PATH=/apple-sharp/
```

---

## 12. Next Steps

1. **Create staging branch:** `git checkout -b staging`
2. **Create `modal_app_staging.py`** (copy from modal_app.py, update app name and configs)
3. **Deploy staging backend:** `modal deploy modal_app_staging.py`
4. **Add staging URL to GitHub secrets:** `MODAL_STAGING_API_URL`
5. **Create staging workflow:** `.github/workflows/deploy-staging.yml`
6. **Test staging deployment:** Push to staging branch
7. **Verify staging works:** Visit staging URL and test functionality

**Estimated setup time:** 1-2 hours with Claude Opus 4.5 assistance 🚀

---

## Support

**Issues?** Check:
1. [Troubleshooting section](#8-troubleshooting)
2. GitHub Actions logs
3. Modal dashboard logs
4. Sentry error reports

**Questions?** Open an issue on GitHub or check the main [README.md](../README.md)

---

**Document Version:** 1.0
**Last Updated:** January 3, 2026
**Maintained by:** Claude Opus 4.5 + Human
