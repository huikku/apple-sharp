# Sharp - Monocular View Synthesis

A web interface for Apple's Sharp model, which generates 3D Gaussian splats from single images.

![Sharp Demo](docs/demo.png)

## Features

- **Single Image → 3D**: Upload any image and generate a 3D Gaussian splat
- **Interactive Viewer**: Orbit, zoom, and explore the 3D scene
- **Mesh Export**: Convert splats to OBJ/GLB/PLY meshes using Poisson, Ball Pivoting, or Alpha Shapes
- **View Controls**: Adjust point size, colors, and shape

## Quick Start (Local Development)

### Prerequisites

- Python 3.11+
- Node.js 20+
- NVIDIA GPU with CUDA

### Backend Setup

```bash
# Create virtual environment
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Clone and install ml-sharp
git clone https://github.com/apple/ml-sharp.git ../ml-sharp
cd ../ml-sharp && pip install -r requirements.txt
cd ../server

# Start server
uvicorn server.main:app --reload --port 8001
```

### Frontend Setup

```bash
cd app
npm install
npm run dev
```

Visit http://localhost:5173

---

## Deployment (GitHub Pages + Modal)

### 1. Deploy Backend to Modal

```bash
# Install Modal CLI
pip install modal

# Authenticate
modal token new

# Deploy (gets a URL like: https://your-username--sharp-api-fastapi-app.modal.run)
modal deploy modal_app.py
```

### 2. Configure GitHub Repository

1. Go to **Settings → Pages → Source**: Select "GitHub Actions"
2. Go to **Settings → Secrets and variables → Actions → Variables**
3. Add variable: `MODAL_API_URL` = your Modal URL from step 1

### 3. Deploy Frontend

Push to `main` branch - GitHub Actions will automatically build and deploy.

```bash
git add .
git commit -m "Deploy to GitHub Pages"
git push origin main
```

Your app will be live at: `https://your-username.github.io/apple-sharp/`

---

## Project Structure

```
apple-sharp/
├── app/                    # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── services/       # API client
│   │   └── utils/          # PLY loader, etc.
│   └── vite.config.ts
├── server/                 # FastAPI backend
│   ├── routes/             # API endpoints
│   ├── services/           # Sharp runner, mesh converter
│   └── main.py
├── modal_app.py            # Modal deployment config
└── .github/workflows/      # GitHub Actions CI/CD
```

## Credits

- **Sharp Model**: [Apple Research](https://github.com/apple/ml-sharp)
- **Frontend**: John Huikku ([alienrobot.com](https://www.alienrobot.com))

## License

This project wraps Apple's ml-sharp model. See [ml-sharp LICENSE](https://github.com/apple/ml-sharp/blob/main/LICENSE) for model terms.
