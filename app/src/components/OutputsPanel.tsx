import { useState } from 'react';
import { convertToMesh, getMeshDownloadUrl, type MeshConvertRequest } from '../services/api';

interface OutputsPanelProps {
    splatPath: string | null;
    splatUrl: string | null;
    jobId: string | null;
    isComplete: boolean;
    onLog?: (message: string, type: 'info' | 'success' | 'error') => void;
}

type MeshMethod = 'poisson' | 'ball_pivoting' | 'alpha_shape';
type ExportFormat = 'obj' | 'glb' | 'ply';

const METHODS: { id: MeshMethod; name: string; desc: string }[] = [
    { id: 'poisson', name: 'Poisson', desc: 'Best quality' },
    { id: 'ball_pivoting', name: 'Ball Pivot', desc: 'Faster' },
    { id: 'alpha_shape', name: 'Alpha', desc: 'Fastest' },
];

export function OutputsPanel({ splatPath, splatUrl, jobId, isComplete, onLog }: OutputsPanelProps) {
    const [method, setMethod] = useState<MeshMethod>('poisson');
    const [format, setFormat] = useState<ExportFormat>('obj');
    const [isConverting, setIsConverting] = useState(false);
    const [depth, setDepth] = useState(9);

    const handleDownloadPly = () => {
        if (!splatUrl || !jobId) return;
        const link = document.createElement('a');
        link.href = splatUrl;
        link.download = `splat_${jobId}.ply`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onLog?.('Downloading PLY file...', 'info');
    };

    const handleExportMesh = async () => {
        if (!splatPath) {
            onLog?.('No splat file to convert', 'error');
            return;
        }

        setIsConverting(true);
        onLog?.(`Converting to ${format.toUpperCase()} with ${method}...`, 'info');

        try {
            const request: MeshConvertRequest = {
                splat_path: splatPath,
                method,
                output_format: format,
            };

            if (method === 'poisson') {
                request.depth = depth;
            }

            const result = await convertToMesh(request);

            onLog?.(
                `Mesh: ${result.vertex_count.toLocaleString()} verts, ${result.face_count.toLocaleString()} faces`,
                'success'
            );

            // Trigger download
            const downloadUrl = getMeshDownloadUrl(result.mesh_filename);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = result.mesh_filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Conversion failed';
            onLog?.(`Mesh error: ${message}`, 'error');
        } finally {
            setIsConverting(false);
        }
    };

    return (
        <div className="bg-card rounded-md border border-metal p-4">
            <h2 className="font-display text-base tracking-tight mb-4 text-[var(--foreground)]">
                OUTPUTS
            </h2>

            {!isComplete ? (
                <p className="text-xs text-muted uppercase tracking-wider">
                    Generate splat first
                </p>
            ) : (
                <div className="space-y-4">
                    {/* PLY Download */}
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

                    {/* Mesh Export */}
                    <div className="pt-3 border-t border-metal">
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">Export Mesh</p>

                        {/* Method Selection */}
                        <div className="flex gap-1 mb-2">
                            {METHODS.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setMethod(m.id)}
                                    className={`
                                        flex-1 py-1.5 px-1 rounded text-xs font-medium transition-colors border
                                        ${method === m.id
                                            ? 'bg-info/20 text-info border-info/50'
                                            : 'bg-plate text-muted border-metal hover:border-info/50'}
                                    `}
                                    title={m.desc}
                                >
                                    {m.name}
                                </button>
                            ))}
                        </div>

                        {/* Depth slider for Poisson */}
                        {method === 'poisson' && (
                            <div className="mb-2">
                                <div className="flex justify-between text-xs text-muted mb-1">
                                    <span>Depth: {depth}</span>
                                    <span className="text-muted/60">Quality</span>
                                </div>
                                <input
                                    type="range"
                                    min="6"
                                    max="12"
                                    value={depth}
                                    onChange={(e) => setDepth(parseInt(e.target.value))}
                                    className="w-full h-1 bg-metal rounded-full appearance-none cursor-pointer
                                        [&::-webkit-slider-thumb]:appearance-none
                                        [&::-webkit-slider-thumb]:w-3
                                        [&::-webkit-slider-thumb]:h-3
                                        [&::-webkit-slider-thumb]:bg-info
                                        [&::-webkit-slider-thumb]:rounded-full"
                                />
                            </div>
                        )}

                        {/* Format Selection */}
                        <div className="flex gap-1 mb-3">
                            {(['obj', 'glb', 'ply'] as ExportFormat[]).map((f) => (
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

                        {/* Export Button */}
                        <button
                            onClick={handleExportMesh}
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
                                    Converting...
                                </span>
                            ) : (
                                `Export .${format.toUpperCase()}`
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
