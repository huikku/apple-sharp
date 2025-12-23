# Sharp - Monocular View Synthesis

A web interface for Apple's **Sharp** model, which generates 3D Gaussian splats from single images.

## About Sharp

**Sharp** (Single-image 3D Human and Animal Reconstruction from Photos) is an AI model developed by [Apple Research](https://machinelearning.apple.com/research/sharp) that generates 3D Gaussian splats from a single photograph.

Unlike traditional 3D reconstruction methods that require multiple images or depth sensors, Sharp uses a foundation model trained on diverse datasets to infer 3D structure from monocular input.

### What are Gaussian Splats?

Gaussian splats are a novel 3D representation that models scenes as collections of 3D Gaussian primitives. Each splat has:

- **Position** - 3D coordinates (x, y, z)
- **Covariance** - Shape/orientation as a 3D ellipsoid
- **Opacity** - Transparency value
- **Color** - Spherical harmonics for view-dependent appearance

## Features

- **Single Image → 3D**: Upload any image and generate a 3D Gaussian splat
- **Interactive Viewer**: Orbit, zoom, and explore the 3D scene
- **Mesh Export**: Convert splats to OBJ/GLB/PLY meshes
- **View Controls**: Adjust point size, colors, and shape
- **In-app Documentation**: Click "Docs" button for full usage guide

## Mesh Conversion Methods

After generating a splat, you can convert it to a polygon mesh for use in traditional 3D software.

### Poisson Surface Reconstruction

Creates smooth, watertight surfaces by solving a Poisson equation. Best for 3D printing and clean meshes.

- **Depth parameter**: Controls octree depth (6-12). Higher = more detail but slower.

### Ball Pivoting Algorithm

Rolls a virtual ball over points, creating triangles where it touches. Preserves original point positions exactly.

- **Radius parameter**: Ball radius. Use 0 for auto-detection.

### Alpha Shapes

Generalizes convex hulls to follow concave regions. Fast but may have holes in sparse areas.

- **Alpha parameter**: Surface tightness. Smaller = tighter fit.

### Export Formats

| Format | Best For |
|--------|----------|
| `.OBJ` | Universal compatibility, Blender, Maya |
| `.GLB` | Web/mobile, includes materials |
| `.PLY` | Point clouds, preserves vertex colors |

---

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

## Usage Tips

### Best Practices for Input Images

✓ **Clear subject** - Center your subject with good lighting  
✓ **Simple background** - Plain backgrounds improve reconstruction  
✓ **Full body visible** - Include the complete subject in frame  
✗ **Avoid** - Blurry images, extreme poses, heavy occlusion

### Performance Notes

- First inference downloads the 2.8GB model checkpoint (~60-120s)
- Subsequent inferences are much faster (~10-30s)
- Best results with humans and animals

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

## Resources

- [Apple Research - Sharp Paper](https://machinelearning.apple.com/research/sharp)
- [GitHub - apple/ml-sharp](https://github.com/apple/ml-sharp)
- [3D Gaussian Splatting Paper](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)

## Credits

- **Sharp Model**: [Apple Research](https://github.com/apple/ml-sharp)
- **Frontend**: John Huikku ([alienrobot.com](https://www.alienrobot.com))

## License

This project wraps Apple's ml-sharp model. See [ml-sharp LICENSE](https://github.com/apple/ml-sharp/blob/main/LICENSE) for model terms.
