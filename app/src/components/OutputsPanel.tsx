import { useState } from 'react';
import { exportGeometry, getExportGeometry } from '../utils/meshExporter';

interface OutputsPanelProps {
    splatPath: string | null;
    splatUrl: string | null;
    jobId: string | null;
    isComplete: boolean;
    onLog?: (message: string, type: 'info' | 'success' | 'error') => void;
}

type ExportFormat = 'obj' | 'glb' | 'ply';

export function OutputsPanel({ splatUrl, jobId, isComplete, onLog }: OutputsPanelProps) {
    const [format, setFormat] = useState<ExportFormat>('ply');
    const [isExporting, setIsExporting] = useState(false);

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

                    {/* Export Section */}
                    <div className="pt-3 border-t border-metal">
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">Export Format</p>
                        <p className="text-xs text-muted mb-2 opacity-70">
                            Client-side export (no server needed)
                        </p>

                        {/* Format Selection */}
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

                        {/* Export Button */}
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className={`
                                w-full py-2 rounded text-sm font-medium uppercase tracking-wider transition-colors
                                ${isExporting
                                    ? 'bg-metal text-muted cursor-not-allowed'
                                    : 'bg-info text-void hover:bg-info/80'}
                            `}
                        >
                            {isExporting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-3 h-3 border-2 border-muted border-t-transparent rounded-full animate-spin" />
                                    Exporting...
                                </span>
                            ) : (
                                `Export .${format.toUpperCase()}`
                            )}
                        </button>
                    </div>

                    {/* Camera Parameters */}
                    <div className="pt-3 border-t border-metal">
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">Camera Params</p>
                        <p className="text-xs text-muted mb-2 opacity-70">
                            For projection mapping in 3D software
                        </p>
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
                                📋 Copy
                            </button>
                            <a
                                href={`${import.meta.env.VITE_API_URL || '/api'}/camera/params.json`}
                                download="camera_params.json"
                                className="flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors border text-center
                                    bg-plate text-muted border-metal hover:border-info hover:text-info"
                                title="Download camera JSON"
                            >
                                📄 JSON
                            </a>
                            <a
                                href={`${import.meta.env.VITE_API_URL || '/api'}/camera/frustum.obj`}
                                download="camera_frustum.obj"
                                className="flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors border text-center
                                    bg-plate text-muted border-metal hover:border-success hover:text-success"
                                title="Download camera frustum mesh"
                            >
                                🎯 OBJ
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
