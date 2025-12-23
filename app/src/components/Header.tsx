import type { JobStatus, SplatJob } from '../types';
import { StatusIndicator } from './StatusIndicator';

interface HeaderProps {
    status: JobStatus;
    processingTime?: number;
    error?: string;
    backendOnline: boolean;
    onDocsClick: () => void;
    currentJob?: SplatJob | null;
}

export function Header({ status, processingTime, error, backendOnline, onDocsClick, currentJob }: HeaderProps) {
    return (
        <header className="h-14 bg-plate border-b border-metal flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
                <h1 className="font-display text-xl tracking-tight text-[var(--foreground)]">
                    SHARP
                </h1>
                <span className="text-xs text-muted uppercase tracking-wider">
                    Monocular View Synthesis
                </span>
                <span className="text-xs text-muted/60">
                    •
                </span>
                <a
                    href="https://github.com/apple/ml-sharp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted hover:text-info transition-colors"
                >
                    Apple Research
                </a>
            </div>

            <div className="flex items-center gap-6">
                <StatusIndicator
                    status={status}
                    processingTime={processingTime}
                    error={error}
                    currentJob={currentJob}
                />


                {/* Docs Button */}
                <button
                    onClick={onDocsClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs text-muted hover:text-[var(--color-fp-text)] hover:bg-frame transition-colors border border-metal"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    Docs
                </button>

                <div className="flex items-center gap-2">
                    <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${backendOnline ? 'bg-success' : 'bg-critical'
                            }`}
                    />
                    <span className="text-xs text-muted uppercase tracking-wider">
                        {backendOnline ? 'API CONNECTED' : 'API OFFLINE'}
                    </span>
                </div>

                <div className="flex items-center gap-1 text-xs text-muted/50">
                    <span>Frontend by</span>
                    <a
                        href="https://www.alienrobot.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted/70 hover:text-info transition-colors"
                    >
                        John Huikku
                    </a>
                </div>
            </div>
        </header>
    );
}
