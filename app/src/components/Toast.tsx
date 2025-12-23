import { useState, useCallback } from 'react';

export interface ToastData {
    id: string;
    type: 'error' | 'success' | 'warning' | 'info';
    title: string;
    message: string;
}

interface ToastProps {
    toast: ToastData;
    onDismiss: (id: string) => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(`${toast.title}: ${toast.message}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [toast]);

    const typeStyles = {
        error: 'border-l-4 border-l-critical bg-critical/10',
        success: 'border-l-4 border-l-success bg-success/10',
        warning: 'border-l-4 border-l-warning bg-warning/10',
        info: 'border-l-4 border-l-info bg-info/10',
    };

    const titleColors = {
        error: 'text-critical',
        success: 'text-success',
        warning: 'text-warning',
        info: 'text-info',
    };

    return (
        <div
            className={`
        relative bg-card border border-metal rounded-md p-4 shadow-lg
        animate-in slide-in-from-right duration-300
        ${typeStyles[toast.type]}
      `}
            style={{ minWidth: '320px', maxWidth: '480px' }}
        >
            <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                    <h4 className={`font-display text-sm uppercase tracking-wider ${titleColors[toast.type]}`}>
                        {toast.title}
                    </h4>
                    <p className="mt-1 text-sm text-[var(--color-fp-text)] break-words font-mono">
                        {toast.message}
                    </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-sm text-muted hover:text-[var(--color-fp-text)] hover:bg-plate transition-colors"
                        title="Copy error message"
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
                        onClick={() => onDismiss(toast.id)}
                        className="p-1.5 rounded-sm text-muted hover:text-critical hover:bg-plate transition-colors"
                        title="Dismiss"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

interface ToastContainerProps {
    toasts: ToastData[];
    onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

// Hook for managing toasts
export function useToast() {
    const [toasts, setToasts] = useState<ToastData[]>([]);

    const addToast = useCallback((toast: Omit<ToastData, 'id'>) => {
        const id = crypto.randomUUID();
        setToasts((prev) => [...prev, { ...toast, id }]);

        // Auto-dismiss after 8 seconds for non-error toasts
        if (toast.type !== 'error') {
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 8000);
        }
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showError = useCallback((title: string, message: string) => {
        addToast({ type: 'error', title, message });
    }, [addToast]);

    const showSuccess = useCallback((title: string, message: string) => {
        addToast({ type: 'success', title, message });
    }, [addToast]);

    return {
        toasts,
        addToast,
        dismissToast,
        showError,
        showSuccess,
    };
}
