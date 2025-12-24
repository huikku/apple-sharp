import { useCallback, useState } from 'react';
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

    return (
        <div className="bg-card rounded-md border border-metal p-4">
            <h2 className="font-display text-base tracking-tight mb-4 text-[var(--foreground)]">
                INPUT IMAGE
            </h2>

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
                        <p className="text-xs text-muted mt-1">
                            JPEG, PNG, WebP
                        </p>
                    </div>
                </label>
            )}
        </div>
    );
}
