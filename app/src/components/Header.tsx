import { useState } from 'react';
import type { JobStatus, SplatJob } from '../types';
import { StatusIndicator } from './StatusIndicator';
import { checkHealth } from '../services/api';

interface HeaderProps {
    status: JobStatus;
    processingTime?: number;
    error?: string;
    backendOnline: boolean;
    onDocsClick: () => void;
    currentJob?: SplatJob | null;
    onServerWake?: () => void;
    onLog?: (message: string, type: 'info' | 'success' | 'error') => void;
    mobileScreen?: number;
    onMobileScreenChange?: (screen: 0 | 1 | 2) => void;
}

export function Header({
    status,
    processingTime,
    error,
    backendOnline,
    onDocsClick,
    currentJob,
    onServerWake,
    onLog,
    mobileScreen,
    onMobileScreenChange
}: HeaderProps) {
    const [isWaking, setIsWaking] = useState(false);

    const handleWakeUp = async () => {
        setIsWaking(true);
        onLog?.('Waking up server... This can take 15-60 seconds on first start.', 'info');
        try {
            const success = await checkHealth();
            if (success) {
                onLog?.('Server is now online!', 'success');
                onServerWake?.();
            } else {
                onLog?.('Server still starting... Try again in a moment.', 'info');
            }
        } catch {
            onLog?.('Could not reach server. It may still be starting.', 'info');
        }
        setIsWaking(false);
    };

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
                    className="text-xs text-muted hover:text-info transition-colors hidden sm:inline"
                >
                    Apple Research
                </a>
            </div>

            {/* Mobile Screen Switcher */}
            {onMobileScreenChange !== undefined && (
                <div className="flex bg-void/50 border border-metal/30 rounded-md p-0.5 gap-0.5">
                    <button
                        onClick={() => onMobileScreenChange(0)}
                        className={`px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-tight transition-all ${mobileScreen === 0 ? 'bg-info text-void' : 'text-muted hover:text-foreground'}`}
                    >
                        Workflow
                    </button>
                    <button
                        onClick={() => onMobileScreenChange(1)}
                        className={`px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-tight transition-all ${mobileScreen === 1 ? 'bg-info text-void' : 'text-muted hover:text-foreground'}`}
                    >
                        Viewer
                    </button>
                    <button
                        onClick={() => onMobileScreenChange(2)}
                        className={`px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-tight transition-all ${mobileScreen === 2 ? 'bg-info text-void' : 'text-muted hover:text-foreground'}`}
                    >
                        Logs
                    </button>
                </div>
            )}

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

                {/* Server Status */}
                <div className="flex items-center gap-2">
                    <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${backendOnline ? 'bg-success' : 'bg-critical'
                            }`}
                    />
                    <span className="text-xs text-muted uppercase tracking-wider">
                        {backendOnline ? 'SERVER ONLINE' : 'SERVER OFFLINE'}
                    </span>
                    {!backendOnline && (
                        <button
                            onClick={handleWakeUp}
                            disabled={isWaking}
                            className="ml-1 px-2 py-0.5 text-xs rounded bg-warning/20 text-warning border border-warning/50 hover:bg-warning/30 transition-colors disabled:opacity-50"
                        >
                            {isWaking ? '...' : 'Wake Up'}
                        </button>
                    )}
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
