import { useState } from 'react';
import { Clipboard, FileJson, Target } from 'lucide-react';
import { exportGeometry, getExportGeometry } from '../utils/meshExporter';
import { getFullApiUrl, convertToMesh, getMeshDownloadUrl, type MeshConvertResponse } from '../services/api';

interface OutputsPanelProps {
    splatPath: string | null;
    splatUrl: string | null;
    jobId: string | null;
    isComplete: boolean;
    onLog?: (message: string, type: 'info' | 'success' | 'error') => void;
}

type ExportFormat = 'obj' | 'glb' | 'ply';
type MeshMethod = 'poisson' | 'ball_pivoting' | 'alpha_shape';

export function OutputsPanel({ splatUrl, jobId, isComplete, splatPath, onLog }: OutputsPanelProps) {
    // Client-side export state
    const [format, setFormat] = useState<ExportFormat>('ply');
    const [isExporting, setIsExporting] = useState(false);

    // Server-side mesh conversion state
    const [meshMethod, setMeshMethod] = useState<MeshMethod>('poisson');
    const [meshFormat, setMeshFormat] = useState<ExportFormat>('obj');
    const [isConverting, setIsConverting] = useState(false);
    const [meshResult, setMeshResult] = useState<MeshConvertResponse | null>(null);

    const handleDownloadPly = () => {
        if (!splatUrl || !jobId) return;
        const link = document.createElement('a');
        link.href = getFullApiUrl(splatUrl);
        link.download = `splat_${jobId}.ply`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onLog?.('Downloading PLY file...', 'info');
    };

    const handleExport = async () => {
        const geometry = getExportGeometry();
        if (!geometry) {
            onLog?.('No geometry loaded to export. Generate a splat first.', 'error');
            return;
        }

        setIsExporting(true);
        onLog?.(`Exporting ${format.toUpperCase()} from loaded geometry...`, 'info');

        try {
            await exportGeometry(format, jobId || undefined);
            onLog?.(`${format.toUpperCase()} export complete!`, 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Export failed';
            onLog?.(`Export error: ${message}`, 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const handleServerMeshConversion = async () => {
        if (!splatPath) {
            onLog?.('Splat path missing for server-side conversion.', 'error');
            return;
        }

        setIsConverting(true);
        setMeshResult(null);
        onLog?.(`Starting server-side ${meshMethod} reconstruction...`, 'info');

        try {
            const result = await convertToMesh({
                splat_path: splatPath,
                method: meshMethod,
                output_format: meshFormat,
                // Default parameters
                depth: 8,
                alpha: 0.03
            });

            setMeshResult(result);
            onLog?.(`Mesh reconstruction complete! (${result.vertex_count} vertices)`, 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Conversion failed';
            onLog?.(`Mesh conversion error: ${message}`, 'error');
        } finally {
            setIsConverting(false);
        }
    };

    return (
        <div className="bg-card rounded-md border border-metal p-4 space-y-4">
            <h2 className="font-display text-base tracking-tight text-[var(--foreground)]">
                OUTPUTS
            </h2>

            {!isComplete ? (
                <p className="text-xs text-muted uppercase tracking-wider">
                    Generate splat first
                </p>
            ) : (
                <>
                    {/* 1. PLY Download */}
                    <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">Gaussian Splat</p>
                        <button
                            onClick={handleDownloadPly}
                            className="w-full py-2 px-3 rounded-sm text-sm font-medium uppercase tracking-wider
                                transition-colors border bg-transparent text-success border-success hover:bg-success/10"
                        >
                            Download .PLY
                        </button>
                    </div>

                    {/* 2. Server-side Mesh Reconstruction */}
                    <div className="pt-3 border-t border-metal">
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">Mesh Reconstruction (Server)</p>
                        <p className="text-xs text-muted mb-3 opacity-70">
                            Create watertight meshes using server algorithms
                        </p>

                        <div className="space-y-3">
                            {/* Method Selection */}
                            <select
                                value={meshMethod}
                                onChange={(e) => setMeshMethod(e.target.value as MeshMethod)}
                                className="w-full bg-plate border border-metal text-sm rounded px-2 py-1.5 focus:border-info outline-none"
                            >
                                <option value="poisson">Poisson (Smooth)</option>
                                <option value="ball_pivoting">Ball Pivoting (Precise)</option>
                                <option value="alpha_shape">Alpha Shape (Concave)</option>
                            </select>

                            {/* Format Selection for Mesh */}
                            <div className="flex gap-1">
                                {(['obj', 'glb', 'ply'] as ExportFormat[]).map((f) => (
                                    <button
                                        key={f}
                                        onClick={() => setMeshFormat(f)}
                                        className={`
                                            flex-1 py-1 rounded text-xs font-medium uppercase transition-colors border
                                            ${meshFormat === f
                                                ? 'bg-info/20 text-info border-info/50'
                                                : 'bg-plate text-muted border-metal hover:border-info/50'}
                                        `}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>

                            {/* Convert Button */}
                            <button
                                onClick={handleServerMeshConversion}
                                disabled={isConverting}
                                className={`
                                    w-full py-2 rounded text-sm font-medium uppercase tracking-wider transition-colors
                                    ${isConverting
                                        ? 'bg-metal text-muted cursor-not-allowed'
                                        : 'bg-info text-void hover:bg-info/80'}
                                `}
                            >
                                {isConverting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="w-3 h-3 border-2 border-muted border-t-transparent rounded-full animate-spin" />
                                        Processing...
                                    </span>
                                ) : (
                                    'Reconstruct Mesh'
                                )}
                            </button>

                            {/* Download Result */}
                            {meshResult && (
                                <a
                                    href={getFullApiUrl(getMeshDownloadUrl(meshResult.mesh_filename))}
                                    download={meshResult.mesh_filename}
                                    className="block w-full py-2 px-3 text-center rounded-sm text-sm font-medium uppercase tracking-wider
                                        transition-colors border bg-success/20 text-success border-success hover:bg-success/30"
                                >
                                    Download {meshResult.format.toUpperCase()}
                                </a>
                            )}
                        </div>
                    </div>

                    {/* 3. Client-side Export */}
                    <div className="pt-3 border-t border-metal">
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">Client-side Export</p>
                        <p className="text-xs text-muted mb-2 opacity-70">
                            Quick export of point cloud data
                        </p>

                        <div className="flex gap-1 mb-3">
                            {(['ply', 'obj', 'glb'] as ExportFormat[]).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFormat(f)}
                                    className={`
                                        flex-1 py-1 rounded text-xs font-medium uppercase transition-colors border
                                        ${format === f
                                            ? 'bg-info/20 text-info border-info/50'
                                            : 'bg-plate text-muted border-metal hover:border-info/50'}
                                    `}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className={`
                                w-full py-2 rounded text-sm font-medium uppercase tracking-wider transition-colors
                                ${isExporting
                                    ? 'bg-metal text-muted cursor-not-allowed'
                                    : 'bg-plate text-muted border-metal hover:border-info hover:text-info'}
                            `}
                        >
                            {isExporting ? 'Exporting...' : `Export .${format.toUpperCase()}`}
                        </button>
                    </div>

                    {/* 4. Camera Parameters */}
                    <div className="pt-3 border-t border-metal">
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">Camera Params</p>
                        <div className="flex gap-1">
                            <button
                                onClick={async () => {
                                    const params = {
                                        position: [0, 0, 0],
                                        look_at: [0, 0, 1],
                                        up: [0, -1, 0],
                                        fov: 60,
                                        notes: "OpenCV: X-right, Y-down, Z-forward"
                                    };
                                    await navigator.clipboard.writeText(JSON.stringify(params, null, 2));
                                    onLog?.('Camera params copied to clipboard', 'success');
                                }}
                                className="flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors border
                                    bg-plate text-muted border-metal hover:border-warning hover:text-warning"
                                title="Copy camera parameters"
                            >
                                <Clipboard size={12} className="inline mr-1" />Copy
                            </button>
                            <a
                                href={getFullApiUrl('/api/camera/params.json')}
                                download="camera_params.json"
                                className="flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors border text-center
                                    bg-plate text-muted border-metal hover:border-info hover:text-info"
                                title="Download camera JSON"
                            >
                                <FileJson size={12} className="inline mr-1" />JSON
                            </a>
                            <a
                                href={getFullApiUrl('/api/camera/frustum.obj')}
                                download="camera_frustum.obj"
                                className="flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors border text-center
                                    bg-plate text-muted border-metal hover:border-success hover:text-success"
                                title="Download camera frustum mesh"
                            >
                                <Target size={12} className="inline mr-1" />OBJ
                            </a>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
