import { useState } from 'react';
import { AlertTriangle, Mouse, Settings, Check, X } from 'lucide-react';

interface DocsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function DocsModal({ isOpen, onClose }: DocsModalProps) {
    const [activeTab, setActiveTab] = useState<'about' | 'meshing' | 'usage'>('about');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-void/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-card border border-metal rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-metal shrink-0">
                    <h2 className="font-display text-xl tracking-tight text-[var(--foreground)]">
                        Documentation
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-sm text-muted hover:text-[var(--color-fp-text)] hover:bg-plate transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-metal shrink-0">
                    {[
                        { id: 'about', label: 'About Sharp' },
                        { id: 'meshing', label: 'Mesh Methods' },
                        { id: 'usage', label: 'Usage Guide' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as typeof activeTab)}
                            className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === tab.id
                                ? 'text-[var(--color-fp-text)] border-b-2 border-success'
                                : 'text-muted hover:text-[var(--color-fp-text)]'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-dark">
                    {activeTab === 'about' && <AboutTab />}
                    {activeTab === 'meshing' && <MeshingTab />}
                    {activeTab === 'usage' && <UsageTab />}
                </div>
            </div>
        </div>
    );
}

function AboutTab() {
    return (
        <div className="space-y-6 text-sm text-[var(--color-fp-text)]">
            <section>
                <h3 className="font-display text-lg mb-3 text-success">What is SHARP?</h3>
                <p className="leading-relaxed mb-4">
                    <strong>SHARP</strong> (Sharp Monocular View Synthesis in Less Than a Second) is an approach to
                    <strong> photorealistic view synthesis</strong> from a single image, developed by {' '}
                    <a href="https://arxiv.org/abs/2512.10685" target="_blank" rel="noopener" className="text-info hover:underline">Apple Research</a>.
                </p>
                <p className="leading-relaxed mb-4">
                    Given a single photograph, SHARP regresses the parameters of a 3D Gaussian representation
                    of the depicted scene in <strong>less than a second</strong> via a single
                    feedforward pass through a neural network.
                </p>
                <p className="leading-relaxed">
                    The 3D Gaussian representation can then be rendered in real time, yielding high-resolution
                    photorealistic images for nearby views. The representation is <strong>metric</strong>,
                    supporting absolute scale camera movements.
                </p>
            </section>

            <section>
                <h3 className="font-display text-lg mb-3 text-success">3D Gaussian Splats</h3>
                <p className="leading-relaxed mb-4">
                    Gaussian splats are a novel 3D representation that models scenes as collections of 3D Gaussian
                    primitives. Each splat has:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Position</strong> - 3D coordinates (x, y, z)</li>
                    <li><strong>Covariance</strong> - Shape/orientation as a 3D ellipsoid</li>
                    <li><strong>Opacity</strong> - Transparency value</li>
                    <li><strong>Color</strong> - Spherical harmonics for view-dependent color</li>
                </ul>
            </section>

            <section>
                <h3 className="font-display text-lg mb-3 text-success">Key Features</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>State of the art</strong> - 25–34% LPIPS improvement, 21–43% DISTS improvement</li>
                    <li><strong>Ultra fast</strong> - Less than a second per image (3 orders of magnitude faster)</li>
                    <li><strong>Zero-shot generalization</strong> - Works across diverse datasets</li>
                    <li><strong>Metric scale</strong> - Absolute scale, supports metric camera movements</li>
                    <li><strong>Real-time rendering</strong> - View results instantly</li>
                </ul>
            </section>

            <section className="bg-plate rounded-md p-4">
                <h4 className="font-medium mb-2 text-warning flex items-center gap-1.5"><AlertTriangle size={14} /> Notes</h4>
                <ul className="list-disc list-inside space-y-1 text-muted text-xs">
                    <li>Uses OpenCV coordinate convention (x right, y down, z forward)</li>
                    <li>Scene center is roughly at (0, 0, +z)</li>
                    <li>First inference downloads 2.8GB model checkpoint</li>
                    <li>Output PLY files compatible with standard 3DGS renderers</li>
                </ul>
            </section>
        </div>
    );
}

function MeshingTab() {
    return (
        <div className="space-y-6 text-sm text-[var(--color-fp-text)]">
            <section>
                <h3 className="font-display text-lg mb-3 text-success">Mesh Conversion</h3>
                <p className="leading-relaxed">
                    Gaussian splats are point-based representations. To use the 3D model in traditional
                    software (Blender, Unity, etc.), you can convert splats to polygon meshes using
                    surface reconstruction algorithms.
                </p>
            </section>

            <section>
                <h3 className="font-display text-lg mb-3 text-info">Poisson Surface Reconstruction</h3>
                <div className="bg-plate rounded-md p-4 mb-3">
                    <p className="text-xs text-muted mb-2">Best for: Smooth, watertight meshes</p>
                </div>
                <p className="leading-relaxed mb-3">
                    Creates smooth, watertight surfaces by solving a Poisson equation over an implicit
                    function fitted to the point cloud. Produces clean meshes suitable for 3D printing.
                </p>
                <div className="text-xs text-muted">
                    <strong>Depth parameter:</strong> Controls octree depth (6-12). Higher = more detail but slower.
                </div>
            </section>

            <section>
                <h3 className="font-display text-lg mb-3 text-info">Ball Pivoting Algorithm</h3>
                <div className="bg-plate rounded-md p-4 mb-3">
                    <p className="text-xs text-muted mb-2">Best for: Preserving original point positions</p>
                </div>
                <p className="leading-relaxed mb-3">
                    Rolls a virtual ball over the point cloud, creating triangles wherever the ball
                    touches three points. Preserves original point positions exactly.
                </p>
                <div className="text-xs text-muted">
                    <strong>Radius parameter:</strong> Ball radius. Use 0 for auto-detection, or specify multiple radii.
                </div>
            </section>

            <section>
                <h3 className="font-display text-lg mb-3 text-info">Alpha Shapes</h3>
                <div className="bg-plate rounded-md p-4 mb-3">
                    <p className="text-xs text-muted mb-2">Best for: Fast results with concave features</p>
                </div>
                <p className="leading-relaxed mb-3">
                    Generalizes convex hulls to create surfaces that can follow concave regions.
                    Fast computation but may produce holes in sparse areas.
                </p>
                <div className="text-xs text-muted">
                    <strong>Alpha parameter:</strong> Controls surface tightness. Smaller = tighter fit, larger = smoother.
                </div>
            </section>

            <section>
                <h3 className="font-display text-lg mb-3 text-success">Export Formats</h3>
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-plate rounded-md p-3 text-center">
                        <div className="font-mono text-lg mb-1">.OBJ</div>
                        <div className="text-xs text-muted">Universal format, widely supported</div>
                    </div>
                    <div className="bg-plate rounded-md p-3 text-center">
                        <div className="font-mono text-lg mb-1">.GLB</div>
                        <div className="text-xs text-muted">Web/mobile optimized, includes materials</div>
                    </div>
                    <div className="bg-plate rounded-md p-3 text-center">
                        <div className="font-mono text-lg mb-1">.PLY</div>
                        <div className="text-xs text-muted">Point cloud format, preserves colors</div>
                    </div>
                </div>
            </section>

            <section>
                <h3 className="font-display text-lg mb-3 text-warning">Camera Parameters</h3>
                <p className="leading-relaxed mb-3">
                    Sharp reconstructs the scene from the original camera's viewpoint. For projection
                    mapping and texture reprojection, use these camera settings:
                </p>
                <div className="bg-plate rounded-md p-4 font-mono text-xs mb-3">
                    <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted">Position:</span>
                        <span>(0, 0, 0)</span>
                        <span className="text-muted">Look At:</span>
                        <span>(0, 0, 1)</span>
                        <span className="text-muted">Up Vector:</span>
                        <span>(0, -1, 0)</span>
                        <span className="text-muted">FOV:</span>
                        <span>60°</span>
                        <span className="text-muted">Coordinate System:</span>
                        <span>OpenCV (X-right, Y-down, Z-forward)</span>
                    </div>
                </div>
                <div className="text-xs text-muted">
                    <strong>Blender workflow:</strong> Import mesh → Create camera at origin →
                    Point toward +Z → Set FOV 60° → Use "Project from View" UV mapping
                </div>
            </section>

            <section className="mt-8 border-t border-metal pt-6">
                <h3 className="font-display text-lg mb-3 text-critical">Blender Tips: Viewing Colors</h3>
                <p className="leading-relaxed mb-3">
                    If your imported model looks black in Blender, follow these steps:
                </p>
                <div className="space-y-3">
                    <div className="bg-plate rounded-md p-3">
                        <div className="font-medium text-xs mb-1">1. Viewport Shading</div>
                        <p className="text-xs text-muted">
                            In the 3D Viewport, click the dropdown next to the shading spheres and set
                            <strong> Color</strong> to <strong>Attribute</strong>.
                        </p>
                    </div>
                    <div className="bg-plate rounded-md p-3">
                        <div className="font-medium text-xs mb-1">2. Point Cloud Rendering</div>
                        <p className="text-xs text-muted">
                            For raw PLY files, Blender 4.0+ supports <strong>Point Cloud</strong> objects.
                            Use a <strong>Color Attribute</strong> node in your shader to access the "color" layer.
                        </p>
                    </div>
                    <div className="bg-plate rounded-md p-3">
                        <div className="font-medium text-xs mb-1">3. GLB Point Clouds</div>
                        <p className="text-xs text-muted">
                            Point clouds in GLB are supported by standard GLTF importers. If points don't appear,
                            ensure <strong>Points</strong> is checked in the Blender import settings or use
                            the <strong>Splat PLY</strong> format for raw attribute access.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}

function UsageTab() {
    return (
        <div className="space-y-6 text-sm text-[var(--color-fp-text)]">
            <section>
                <h3 className="font-display text-lg mb-3 text-success">Quick Start</h3>
                <ol className="list-decimal list-inside space-y-3 ml-2">
                    <li>
                        <strong>Upload an image</strong> - Click the upload area or drag & drop
                        <p className="text-xs text-muted mt-1 ml-5">Supported: JPG, PNG, WebP</p>
                    </li>
                    <li>
                        <strong>Generate splat</strong> - Click "Generate 3D Splat"
                        <p className="text-xs text-muted mt-1 ml-5">First run downloads model (~60-120s)</p>
                    </li>
                    <li>
                        <strong>View result</strong> - Rotate, zoom, and explore in 3D
                        <p className="text-xs text-muted mt-1 ml-5">Mouse: drag to rotate, scroll to zoom</p>
                    </li>
                    <li>
                        <strong>Export</strong> - Download PLY or convert to mesh
                    </li>
                </ol>
            </section>

            <section>
                <h3 className="font-display text-lg mb-3 text-success">View Controls</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-plate rounded-md p-3">
                        <h4 className="font-medium mb-2 flex items-center gap-1.5"><Mouse size={14} /> Mouse</h4>
                        <ul className="text-xs text-muted space-y-1">
                            <li>Left drag → Rotate view</li>
                            <li>Right drag → Pan camera</li>
                            <li>Scroll → Zoom in/out</li>
                        </ul>
                    </div>
                    <div className="bg-plate rounded-md p-3">
                        <h4 className="font-medium mb-2 flex items-center gap-1.5"><Settings size={14} /> Settings</h4>
                        <ul className="text-xs text-muted space-y-1">
                            <li>Point Size → Adjust splat size</li>
                            <li>Colors → Toggle RGB/white</li>
                            <li>Shape → Circle or square points</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section>
                <h3 className="font-display text-lg mb-3 text-success">Best Practices</h3>
                <div className="space-y-3">
                    <div className="flex items-start gap-3">
                        <Check size={14} className="text-success" />
                        <div>
                            <strong>Clear subject</strong>
                            <p className="text-xs text-muted">Center your subject with good lighting</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Check size={14} className="text-success" />
                        <div>
                            <strong>Simple background</strong>
                            <p className="text-xs text-muted">Plain backgrounds improve reconstruction</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Check size={14} className="text-success" />
                        <div>
                            <strong>Full body visible</strong>
                            <p className="text-xs text-muted">Include the complete subject in frame</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <X size={14} className="text-critical" />
                        <div>
                            <strong>Avoid</strong>
                            <p className="text-xs text-muted">Blurry images, extreme poses, heavy occlusion</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-plate rounded-md p-4">
                <h4 className="font-medium mb-2">🔗 Resources</h4>
                <ul className="text-xs space-y-2">
                    <li>
                        <a href="https://github.com/apple/ml-sharp" target="_blank" rel="noopener" className="text-info hover:underline">
                            GitHub - apple/ml-sharp →
                        </a>
                    </li>
                    <li>
                        <a href="https://huggingface.co/apple/Sharp" target="_blank" rel="noopener" className="text-info hover:underline">
                            HuggingFace - apple/Sharp →
                        </a>
                    </li>
                    <li>
                        <a href="https://arxiv.org/abs/2512.10685" target="_blank" rel="noopener" className="text-info hover:underline">
                            arXiv Paper →
                        </a>
                    </li>
                    <li>
                        <a href="https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/" target="_blank" rel="noopener" className="text-info hover:underline">
                            3D Gaussian Splatting Paper →
                        </a>
                    </li>
                </ul>
            </section>
        </div>
    );
}
