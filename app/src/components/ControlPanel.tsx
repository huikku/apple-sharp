import type { JobStatus, ImageUploadResponse } from '../types';

interface ControlPanelProps {
    uploadedImage: ImageUploadResponse | null;
    status: JobStatus;
    onGenerate: () => void;
    onReset: () => void;
    // View settings
    showAxes: boolean;
    onShowAxesChange: (show: boolean) => void;
    autoRotate: boolean;
    onAutoRotateChange: (rotate: boolean) => void;
    pointSize: number;
    onSplatScaleChange: (scale: number) => void;
    hasSplat: boolean;
}

export function ControlPanel({
    uploadedImage,
    status,
    onGenerate,
    onReset,
    showAxes,
    onShowAxesChange,
    autoRotate,
    onAutoRotateChange,
    pointSize,
    onSplatScaleChange,
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

                    <div className="flex gap-2">
                        <button
                            onClick={() => onShowAxesChange(!showAxes)}
                            className={`
                                flex-1 py-1.5 rounded text-xs font-medium uppercase transition-colors border
                                ${showAxes
                                    ? 'bg-info/20 text-info border-info/50'
                                    : 'bg-plate text-muted border-metal'}
                            `}
                        >
                            {showAxes ? 'AXES' : 'NO AXES'}
                        </button>
                        <button
                            onClick={() => onAutoRotateChange(!autoRotate)}
                            className={`
                                flex-1 py-1.5 rounded text-xs font-medium uppercase transition-colors border
                                ${autoRotate
                                    ? 'bg-warning/20 text-warning border-warning/50'
                                    : 'bg-plate text-muted border-metal'}
                            `}
                        >
                            {autoRotate ? 'TURNING' : 'STILL'}
                        </button>
                    </div>

                    {/* Splat Scale Slider */}
                    <div className="pt-1">
                        <div className="flex justify-between text-[10px] text-muted mb-1 uppercase tracking-widest">
                            <span>Splat Density</span>
                            <span className="font-mono text-info">{pointSize.toFixed(1)}x</span>
                        </div>
                        <input
                            type="range"
                            min="0.01"
                            max="5.0"
                            step="0.01"
                            value={pointSize}
                            onChange={(e) => onSplatScaleChange(parseFloat(e.target.value))}
                            className="w-full h-1 bg-metal rounded-full appearance-none cursor-pointer
                                [&::-webkit-slider-thumb]:appearance-none
                                [&::-webkit-slider-thumb]:w-3
                                [&::-webkit-slider-thumb]:h-3
                                [&::-webkit-slider-thumb]:bg-info
                                [&::-webkit-slider-thumb]:rounded-full
                                hover:[&::-webkit-slider-thumb]:scale-125
                                transition-all"
                        />
                    </div>

                    <p className="text-[10px] text-muted italic opacity-60 text-center">
                        Coordinates: OpenCV (Y-Down)
                    </p>
                </div>
            )}
        </div>
    );
}
