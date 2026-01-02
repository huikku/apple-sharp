import { useCallback, useState, useEffect } from 'react';
import { ClipboardPaste } from 'lucide-react';
import type { ImageUploadResponse } from '../types';

interface ImageUploadProps {
    onUpload: (file: File) => Promise<void>;
    uploadedImage: ImageUploadResponse | null;
    isUploading: boolean;
    disabled?: boolean;
}

export function ImageUpload({ onUpload, uploadedImage, isUploading, disabled }: ImageUploadProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const handleFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            console.error('Invalid file type');
            return;
        }

        const url = URL.createObjectURL(file);
        setPreviewUrl(url);

        await onUpload(file);
    }, [onUpload]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handlePaste = useCallback(async (e: ClipboardEvent | React.ClipboardEvent) => {
        const items = e instanceof ClipboardEvent ? e.clipboardData?.items : e.clipboardData.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    await handleFile(blob);
                }
                break;
            }
        }
    }, [handleFile]);

    // Global paste listener
    useEffect(() => {
        const globalPaste = (e: ClipboardEvent) => {
            // Only handle global paste if not already previewing and not disabled
            if (!previewUrl && !disabled && !isUploading) {
                handlePaste(e);
            }
        };
        window.addEventListener('paste', globalPaste);
        return () => window.removeEventListener('paste', globalPaste);
    }, [handlePaste, previewUrl, disabled, isUploading]);

    return (
        <div className="bg-card rounded-md border border-metal p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-display text-base tracking-tight text-[var(--foreground)]">
                    INPUT IMAGE
                </h2>
                {!previewUrl && (
                    <button
                        onClick={async () => {
                            try {
                                const clipboardItems = await navigator.clipboard.read();
                                for (const item of clipboardItems) {
                                    for (const type of item.types) {
                                        if (type.startsWith('image/')) {
                                            const blob = await item.getType(type);
                                            await handleFile(new File([blob], 'pasted-image.png', { type }));
                                            return;
                                        }
                                    }
                                }
                            } catch (err) {
                                console.error('Failed to read clipboard:', err);
                            }
                        }}
                        disabled={disabled || isUploading}
                        className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm border border-info/30 text-info hover:bg-info/10 transition-colors"
                    >
                        <ClipboardPaste size={12} className="inline mr-1" />Paste
                    </button>
                )}
            </div>

            {previewUrl ? (
                <div className="space-y-3">
                    <div className="relative aspect-video bg-void rounded-sm overflow-hidden border border-metal">
                        <img
                            src={previewUrl}
                            alt="Preview"
                            className="absolute inset-0 w-full h-full object-contain"
                        />
                    </div>

                    {uploadedImage && (
                        <div className="flex gap-4 text-xs text-muted">
                            <span className="font-mono">{uploadedImage.width}×{uploadedImage.height}</span>
                            <span className="font-mono">
                                {uploadedImage.size ? `${(uploadedImage.size / 1024).toFixed(1)} KB` : ''}
                            </span>
                        </div>
                    )}

                    <button
                        onClick={() => {
                            setPreviewUrl(null);
                        }}
                        disabled={disabled || isUploading}
                        className="text-xs text-info hover:text-info/80 disabled:opacity-50"
                    >
                        Clear & Upload New
                    </button>
                </div>
            ) : (
                <label
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`
            block aspect-video rounded-sm border-2 border-dashed cursor-pointer
            transition-colors flex items-center justify-center
            ${isDragOver
                            ? 'border-info bg-info/10'
                            : 'border-metal hover:border-info/50'
                        }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
                >
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleInputChange}
                        disabled={disabled || isUploading}
                        className="hidden"
                    />
                    <div className="text-center">
                        <p className="text-sm text-muted">
                            {isUploading ? 'UPLOADING...' : 'DROP IMAGE OR CLICK TO UPLOAD'}
                        </p>
                        <p className="text-xs text-muted mt-1 uppercase tracking-tighter opacity-50">
                            Or just paste with Ctrl+V (Cmd+V)
                        </p>
                    </div>
                </label>
            )}
        </div>
    );
}
