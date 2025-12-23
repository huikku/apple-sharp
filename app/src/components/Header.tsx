import type { JobStatus } from '../types';
import { StatusIndicator } from './StatusIndicator';

interface HeaderProps {
    status: JobStatus;
    processingTime?: number;
    error?: string;
    backendOnline: boolean;
}

export function Header({ status, processingTime, error, backendOnline }: HeaderProps) {
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
                />

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
