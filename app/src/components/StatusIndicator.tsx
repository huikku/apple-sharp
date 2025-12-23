import type { JobStatus } from '../types';

interface StatusIndicatorProps {
    status: JobStatus;
    processingTime?: number;
    error?: string;
}

const STATUS_CONFIG: Record<JobStatus, { label: string; colorClass: string; animate: boolean }> = {
    idle: { label: 'READY', colorClass: 'text-muted', animate: false },
    uploading: { label: 'UPLOADING', colorClass: 'text-info', animate: true },
    processing: { label: 'RUNNING INFERENCE', colorClass: 'text-warning', animate: true },
    complete: { label: 'COMPLETE', colorClass: 'text-success', animate: false },
    error: { label: 'ERROR', colorClass: 'text-critical', animate: false },
};

export function StatusIndicator({ status, processingTime, error }: StatusIndicatorProps) {
    const config = STATUS_CONFIG[status];

    return (
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
                <span
                    className={`inline-block w-2 h-2 rounded-full ${config.animate ? 'animate-pulse' : ''
                        } ${status === 'idle' ? 'bg-[var(--fp-metal-trim)]' :
                            status === 'uploading' || status === 'processing' ? 'bg-info' :
                                status === 'complete' ? 'bg-success' :
                                    'bg-critical'
                        }`}
                />
                <span className={`text-xs uppercase tracking-wider font-medium ${config.colorClass}`}>
                    {config.label}
                </span>
            </div>

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
