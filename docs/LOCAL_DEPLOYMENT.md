# Local Deployment Guide

Complete setup instructions for running Sharp locally on your own machine.

## Requirements

### Hardware
- **NVIDIA GPU** with CUDA support (8GB+ VRAM recommended)
- **16GB+ RAM** recommended
- **10GB+ disk space** for model checkpoints

### Software
- **Python 3.11+**
- **Node.js 20+** and npm
- **CUDA 11.8+** and cuDNN
- **Git**

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/huikku/apple-sharp.git
cd apple-sharp
```

## Step 2: Backend Setup

### 2.1 Create Python Virtual Environment

```bash
cd server
python -m venv venv

# Activate virtual environment
# Linux/Mac:
source venv/bin/activate
# Windows:
venv\Scripts\activate
```

### 2.2 Install Python Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 2.3 Install Apple's ml-sharp

```bash
# Clone ml-sharp repository
cd ..
git clone https://github.com/apple/ml-sharp.git

# Install ml-sharp dependencies
cd ml-sharp
pip install -r requirements.txt
pip install -e .
cd ..
```

### 2.4 Verify CUDA Installation

```bash
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"None\"}')"
```

Expected output:
```
CUDA available: True
GPU: NVIDIA GeForce RTX 3090  # or your GPU
```

### 2.5 Start Backend Server

```bash
cd server
uvicorn server.main:app --reload --port 8001
```

The API will be available at `http://localhost:8001`

Verify it's running:
```bash
curl http://localhost:8001/api/health
```

---

## Step 3: Frontend Setup

Open a **new terminal** (keep backend running).

### 3.1 Install Node Dependencies

```bash
cd apple-sharp/app
npm install
```

### 3.2 Start Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

---

## Step 4: First Run

1. Open http://localhost:5173 in your browser
2. You should see "API CONNECTED" in the header
3. Upload an image and click "Generate 3D Splat"

**First inference will take ~2-5 minutes** as it downloads the 2.8GB Sharp model checkpoint. Subsequent runs are much faster (~30 seconds).

---

## Directory Structure

After setup, your directory should look like:

```
apple-sharp/
├── app/                    # React frontend
│   ├── node_modules/       # (created by npm install)
│   └── ...
├── server/                 # FastAPI backend
│   ├── venv/               # (created by python -m venv)
│   └── ...
├── ml-sharp/               # Apple's Sharp model (cloned)
├── outputs/                # Generated files (created on first run)
│   ├── uploads/
│   ├── splats/
│   └── meshes/
└── ...
```

---

## Troubleshooting

### "CUDA not available" Error

1. Verify NVIDIA drivers: `nvidia-smi`
2. Verify CUDA: `nvcc --version`
3. Reinstall PyTorch with CUDA:
   ```bash
   pip uninstall torch torchvision
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
   ```

### "Module not found: sharp" Error

Make sure ml-sharp is installed in editable mode:
```bash
cd ml-sharp
pip install -e .
```

### Backend Connection Failed (API OFFLINE)

1. Check if backend is running on port 8001
2. Check for port conflicts: `lsof -i :8001`
3. Check backend logs for errors

### Frontend Won't Start

```bash
# Clear node modules and reinstall
cd app
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Out of GPU Memory

Sharp requires ~6GB VRAM. If you have less:
- Close other GPU applications
- Reduce image input size
- Use a cloud GPU (see Modal deployment)

---

## Running Both Servers

For convenience, you can use two terminal tabs/windows:

**Terminal 1 (Backend):**
```bash
cd apple-sharp/server
source venv/bin/activate
uvicorn server.main:app --reload --port 8001
```

**Terminal 2 (Frontend):**
```bash
cd apple-sharp/app
npm run dev
```

---

## Environment Variables (Optional)

The frontend supports an optional environment variable:

**`app/.env.local`** (for development):
```
# Leave empty for local development (uses Vite proxy)
VITE_API_URL=
```

**`app/.env.production`** (for production builds):
```
# Set to your backend URL
VITE_API_URL=https://your-api-url.com
```

---

## Next Steps

- [Deploy to Cloud (Modal)](../README.md#deployment-github-pages--modal)
- [API Documentation](http://localhost:8001/docs) (when backend is running)
- [Sharp Research Paper](https://machinelearning.apple.com/research/sharp)
