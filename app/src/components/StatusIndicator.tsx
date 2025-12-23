import type { JobStatus, SplatJob } from '../types';

interface StatusIndicatorProps {
    status: JobStatus;
    processingTime?: number;
    error?: string;
    currentJob?: SplatJob | null;
}

const STATUS_CONFIG: Record<JobStatus, { label: string; colorClass: string; animate: boolean }> = {
    idle: { label: 'READY', colorClass: 'text-muted', animate: false },
    uploading: { label: 'UPLOADING', colorClass: 'text-info', animate: true },
    queued: { label: 'IN QUEUE', colorClass: 'text-warning', animate: true },
    processing: { label: 'RUNNING INFERENCE', colorClass: 'text-warning', animate: true },
    complete: { label: 'COMPLETE', colorClass: 'text-success', animate: false },
    error: { label: 'ERROR', colorClass: 'text-critical', animate: false },
};

export function StatusIndicator({ status, processingTime, error, currentJob }: StatusIndicatorProps) {
    const config = STATUS_CONFIG[status];

    // Format estimated wait time
    const formatWaitTime = (seconds: number): string => {
        if (seconds < 60) return `~${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
    };

    return (
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
                <span
                    className={`inline-block w-2 h-2 rounded-full ${config.animate ? 'animate-pulse' : ''
                        } ${status === 'idle' ? 'bg-[var(--fp-metal-trim)]' :
                            status === 'uploading' || status === 'processing' || status === 'queued' ? 'bg-info' :
                                status === 'complete' ? 'bg-success' :
                                    'bg-critical'
                        }`}
                />
                <span className={`text-xs uppercase tracking-wider font-medium ${config.colorClass}`}>
                    {config.label}
                </span>
            </div>

            {/* Queue position info */}
            {status === 'queued' && currentJob?.queuePosition && currentJob.queuePosition > 0 && (
                <div className="flex items-center gap-2 px-2 py-1 bg-plate rounded-sm border border-metal">
                    <span className="text-xs text-muted">Position:</span>
                    <span className="font-mono text-xs text-warning font-medium">
                        #{currentJob.queuePosition}
                    </span>
                    {currentJob.estimatedWaitSeconds && currentJob.estimatedWaitSeconds > 0 && (
                        <>
                            <span className="text-xs text-muted">•</span>
                            <span className="font-mono text-xs text-muted">
                                {formatWaitTime(currentJob.estimatedWaitSeconds)}
                            </span>
                        </>
                    )}
                </div>
            )}

            {processingTime !== undefined && status === 'complete' && (
                <span className="font-mono text-xs text-muted">
                    {(processingTime / 1000).toFixed(2)}s
                </span>
            )}

            {error && (
                <span className="text-xs text-critical truncate max-w-48" title={error}>
                    {error}
                </span>
            )}
        </div>
    );
}
