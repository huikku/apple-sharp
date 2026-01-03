import { useState, useCallback, useRef, useEffect } from 'react';

export interface LogEntry {
    id: string;
    timestamp: Date;
    type: 'error' | 'success' | 'info' | 'warning';
    title: string;
    message: string;
}

interface LogPanelProps {
    logs: LogEntry[];
    onClear: () => void;
}

export function LogPanel({ logs, onClear }: LogPanelProps) {
    const [copied, setCopied] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const isAtBottomRef = useRef(true);

    // Track if user is at bottom
    const handleScroll = useCallback(() => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
        }
    }, []);

    // Auto-scroll to bottom only if user was already at bottom
    useEffect(() => {
        if (scrollRef.current && isAtBottomRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const handleCopyAll = useCallback(async () => {
        const text = logs
            .map((log) => `[${log.timestamp.toISOString()}] ${log.type.toUpperCase()}: ${log.title}\n${log.message}`)
            .join('\n\n');

        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy logs:', err);
        }
    }, [logs]);

    const handleCopyEntry = useCallback(async (log: LogEntry) => {
        const text = `[${log.timestamp.toISOString()}] ${log.type.toUpperCase()}: ${log.title}\n${log.message}`;
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, []);

    const typeColors = {
        error: 'text-critical border-l-critical',
        success: 'text-success border-l-success',
        warning: 'text-warning border-l-warning',
        info: 'text-info border-l-info',
    };

    return (
        <div className="bg-card rounded-md border border-metal flex flex-col h-full">
            <div className="px-4 py-3 border-b border-metal flex items-center justify-between shrink-0">
                <h2 className="font-display text-base tracking-tight text-[var(--foreground)]">
                    LOGS
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopyAll}
                        disabled={logs.length === 0}
                        className="p-1.5 rounded-sm text-muted hover:text-[var(--color-fp-text)] hover:bg-plate transition-colors disabled:opacity-50"
                        title="Copy all logs"
                    >
                        {copied ? (
                            <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        )}
                    </button>
                    <button
                        onClick={onClear}
                        disabled={logs.length === 0}
                        className="p-1.5 rounded-sm text-muted hover:text-critical hover:bg-plate transition-colors disabled:opacity-50"
                        title="Clear logs"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0 scrollbar-dark"
            >

                {logs.length === 0 ? (
                    <p className="text-xs text-muted text-center py-4">No logs yet</p>
                ) : (
                    logs.map((log) => (
                        <div
                            key={log.id}
                            className={`p-2 bg-plate rounded-sm border-l-2 ${typeColors[log.type]} group relative`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs font-medium uppercase ${typeColors[log.type].split(' ')[0]}`}>
                                            {log.title}
                                        </span>
                                        <span className="text-[10px] text-muted font-mono">
                                            {log.timestamp.toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <pre className="text-xs text-[var(--color-fp-text)] font-mono whitespace-pre-wrap break-all overflow-hidden">
                                        {log.message}
                                    </pre>
                                </div>
                                <button
                                    onClick={() => handleCopyEntry(log)}
                                    className="p-1 rounded-sm text-muted hover:text-[var(--color-fp-text)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    title="Copy this log"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// Hook for managing logs
export function useLogs() {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
        const newEntry: LogEntry = {
            ...entry,
            id: crypto.randomUUID(),
            timestamp: new Date(),
        };
        setLogs((prev) => [...prev, newEntry]);
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    const logError = useCallback((title: string, message: string) => {
        addLog({ type: 'error', title, message });
    }, [addLog]);

    const logSuccess = useCallback((title: string, message: string) => {
        addLog({ type: 'success', title, message });
    }, [addLog]);

    const logInfo = useCallback((title: string, message: string) => {
        addLog({ type: 'info', title, message });
    }, [addLog]);

    return {
        logs,
        addLog,
        clearLogs,
        logError,
        logSuccess,
        logInfo,
    };
}
