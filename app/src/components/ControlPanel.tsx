import type { JobStatus, ImageUploadResponse } from '../types';

interface ControlPanelProps {
    uploadedImage: ImageUploadResponse | null;
    status: JobStatus;
    onGenerate: () => void;
    onReset: () => void;
    // View settings
    pointSize: number;
    onPointSizeChange: (size: number) => void;
    showColors: boolean;
    onShowColorsChange: (show: boolean) => void;
    pointShape: 'square' | 'circle';
    onPointShapeChange: (shape: 'square' | 'circle') => void;
    hasSplat: boolean;
}

export function ControlPanel({
    uploadedImage,
    status,
    onGenerate,
    onReset,
    pointSize,
    onPointSizeChange,
    showColors,
    onShowColorsChange,
    pointShape,
    onPointShapeChange,
    hasSplat,
}: ControlPanelProps) {
    const canGenerate = uploadedImage !== null && status === 'idle';
    const isProcessing = status === 'uploading' || status === 'processing';

    return (
        <div className="bg-card rounded-md border border-metal p-4">
            <h2 className="font-display text-base tracking-tight mb-4 text-[var(--foreground)]">
                CONTROLS
            </h2>

            <div className="space-y-3">
                <button
                    onClick={onGenerate}
                    disabled={!canGenerate || isProcessing}
                    className={`
                        w-full py-2.5 px-4 rounded-sm text-sm font-medium uppercase tracking-wider
                        transition-colors border
                        ${canGenerate && !isProcessing
                            ? 'bg-info text-white border-info hover:bg-info/90'
                            : 'bg-plate text-muted border-metal cursor-not-allowed'
                        }
                    `}
                >
                    {isProcessing ? 'PROCESSING...' : 'GENERATE SPLAT'}
                </button>

                <button
                    onClick={onReset}
                    disabled={isProcessing}
                    className={`
                        w-full py-2 px-4 rounded-sm text-xs font-medium uppercase tracking-wider
                        transition-colors
                        ${!isProcessing
                            ? 'text-muted hover:text-critical'
                            : 'text-muted/50 cursor-not-allowed'
                        }
                    `}
                >
                    RESET
                </button>
            </div>

            {uploadedImage && (
                <div className="mt-4 pt-4 border-t border-metal">
                    <p className="text-xs text-muted uppercase tracking-wider mb-2">INPUT IMAGE</p>
                    <p className="text-sm font-mono text-[var(--foreground)] truncate">
                        {uploadedImage.filename}
                    </p>
                </div>
            )}

            {/* View Settings - only show when splat is available */}
            {hasSplat && (
                <div className="mt-4 pt-4 border-t border-metal space-y-3">
                    <p className="text-xs text-muted uppercase tracking-wider">VIEW SETTINGS</p>

                    {/* Point Size */}
                    <div>
                        <div className="flex justify-between text-xs text-muted mb-1">
                            <span>Point Size</span>
                            <span className="font-mono">{pointSize.toFixed(3)}</span>
                        </div>
                        <input
                            type="range"
                            min="0.001"
                            max="0.03"
                            step="0.001"
                            value={pointSize}
                            onChange={(e) => onPointSizeChange(parseFloat(e.target.value))}
                            className="w-full h-1 bg-metal rounded-full appearance-none cursor-pointer
                                [&::-webkit-slider-thumb]:appearance-none
                                [&::-webkit-slider-thumb]:w-3
                                [&::-webkit-slider-thumb]:h-3
                                [&::-webkit-slider-thumb]:bg-info
                                [&::-webkit-slider-thumb]:rounded-full"
                        />
                    </div>

                    {/* Color & Shape toggles */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => onShowColorsChange(!showColors)}
                            className={`
                                flex-1 py-1.5 rounded text-xs font-medium uppercase transition-colors border
                                ${showColors
                                    ? 'bg-success/20 text-success border-success/50'
                                    : 'bg-plate text-muted border-metal'}
                            `}
                        >
                            {showColors ? 'COLOR' : 'MONO'}
                        </button>
                        <button
                            onClick={() => onPointShapeChange(pointShape === 'circle' ? 'square' : 'circle')}
                            className="flex-1 py-1.5 rounded text-xs font-medium uppercase transition-colors border
                                bg-plate text-muted border-metal hover:text-info hover:border-info"
                        >
                            {pointShape === 'circle' ? '● CIRCLE' : '■ SQUARE'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
